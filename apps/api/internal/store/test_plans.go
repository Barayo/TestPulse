package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TestPlanRepo struct {
	pool *pgxpool.Pool
}

// ProjectID resolves the project a test plan belongs to — used by
// requirePermission's per-resource resolver (add-project-rbac design.md D5).
func (r *TestPlanRepo) ProjectID(ctx context.Context, testPlanID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM test_plans WHERE id = $1`, testPlanID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// IDByKey resolves a test plan's key to its internal id (add-human-readable-keys D4).
func (r *TestPlanRepo) IDByKey(ctx context.Context, key string) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `SELECT id FROM test_plans WHERE key = $1`, key).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}

// Create inserts a test plan scoped to a release and claims its key in one
// transaction (introduce-release-test-plan design.md D6).
func (r *TestPlanRepo) Create(ctx context.Context, projectID, releaseID, name, description string) (domain.TestPlan, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.TestPlan{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	key, err := claimEntityKey(ctx, tx, projectID, "plan", "%s-PLAN%d")
	if err != nil {
		return domain.TestPlan{}, fmt.Errorf("claiming test plan key: %w", err)
	}

	var plan domain.TestPlan
	err = tx.QueryRow(ctx,
		`INSERT INTO test_plans (key, project_id, release_id, name, description) VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, key, project_id, release_id, name, description, created_at`,
		key, projectID, releaseID, name, description,
	).Scan(&plan.ID, &plan.Key, &plan.ProjectID, &plan.ReleaseID, &plan.Name, &plan.Description, &plan.CreatedAt)
	if err != nil {
		return domain.TestPlan{}, err
	}
	if err := tx.QueryRow(ctx, `SELECT key FROM releases WHERE id = $1`, releaseID).Scan(&plan.ReleaseKey); err != nil {
		return domain.TestPlan{}, err
	}
	return plan, tx.Commit(ctx)
}

func (r *TestPlanRepo) Get(ctx context.Context, testPlanID string) (domain.TestPlan, error) {
	var plan domain.TestPlan
	err := r.pool.QueryRow(ctx,
		`SELECT tp.id, tp.key, tp.project_id, tp.release_id, rel.key, tp.name, tp.description, tp.created_at
		 FROM test_plans tp JOIN releases rel ON rel.id = tp.release_id
		 WHERE tp.id = $1`, testPlanID,
	).Scan(&plan.ID, &plan.Key, &plan.ProjectID, &plan.ReleaseID, &plan.ReleaseKey, &plan.Name, &plan.Description, &plan.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.TestPlan{}, ErrNotFound
	}
	return plan, err
}

// ListByProject returns every test plan across all of a project's releases
// — a single batched query, used to populate the run-creation Test Plan
// picker without an N+1 releases-then-plans client-side fetch loop
// (introduce-release-test-plan).
func (r *TestPlanRepo) ListByProject(ctx context.Context, projectID string) ([]domain.TestPlan, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT tp.id, tp.key, tp.project_id, tp.release_id, rel.key, tp.name, tp.description, tp.created_at
		 FROM test_plans tp JOIN releases rel ON rel.id = tp.release_id
		 WHERE tp.project_id = $1
		 ORDER BY rel.created_at DESC, tp.created_at DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	plans := []domain.TestPlan{}
	for rows.Next() {
		var plan domain.TestPlan
		if err := rows.Scan(&plan.ID, &plan.Key, &plan.ProjectID, &plan.ReleaseID, &plan.ReleaseKey, &plan.Name, &plan.Description, &plan.CreatedAt); err != nil {
			return nil, err
		}
		plans = append(plans, plan)
	}
	return plans, rows.Err()
}

// ListByRelease returns a release's test plans, newest-first.
func (r *TestPlanRepo) ListByRelease(ctx context.Context, releaseID string) ([]domain.TestPlan, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT tp.id, tp.key, tp.project_id, tp.release_id, rel.key, tp.name, tp.description, tp.created_at
		 FROM test_plans tp JOIN releases rel ON rel.id = tp.release_id
		 WHERE tp.release_id = $1
		 ORDER BY tp.created_at DESC`, releaseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	plans := []domain.TestPlan{}
	for rows.Next() {
		var plan domain.TestPlan
		if err := rows.Scan(&plan.ID, &plan.Key, &plan.ProjectID, &plan.ReleaseID, &plan.ReleaseKey, &plan.Name, &plan.Description, &plan.CreatedAt); err != nil {
			return nil, err
		}
		plans = append(plans, plan)
	}
	return plans, rows.Err()
}

// Update overwrites a test plan's name and description — its Release never
// changes after creation (introduce-release-test-plan spec).
func (r *TestPlanRepo) Update(ctx context.Context, plan domain.TestPlan) (domain.TestPlan, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE test_plans SET name = $2, description = $3 WHERE id = $1`,
		plan.ID, plan.Name, plan.Description)
	if err != nil {
		return domain.TestPlan{}, err
	}
	if tag.RowsAffected() == 0 {
		return domain.TestPlan{}, ErrNotFound
	}
	return r.Get(ctx, plan.ID)
}

// Rollup aggregates a Test Plan's run count and pass rate across all of its
// Runs in a single query (introduce-release-test-plan design.md D5) —
// never a client-side per-run fetch loop. PassRate is nil when the Test
// Plan has no items across its runs (including when it has no runs at all).
func (r *TestPlanRepo) Rollup(ctx context.Context, testPlanID string) (domain.Rollup, error) {
	var rollup domain.Rollup
	var total, passCount int
	err := r.pool.QueryRow(ctx,
		`SELECT count(DISTINCT tr.id), count(i.id), count(i.id) FILTER (WHERE i.current_status = 'pass')
		 FROM test_runs tr
		 LEFT JOIN test_run_items i ON i.run_id = tr.id
		 WHERE tr.test_plan_id = $1`, testPlanID,
	).Scan(&rollup.RunCount, &total, &passCount)
	if err != nil {
		return domain.Rollup{}, err
	}
	if total > 0 {
		rate := int(float64(passCount) / float64(total) * 100)
		rollup.PassRate = &rate
	}
	return rollup, nil
}

// Delete removes a test plan, rejected with ErrHasChildren while it still
// has Runs scoped to it (introduce-release-test-plan spec) — never silently
// orphans execution history.
func (r *TestPlanRepo) Delete(ctx context.Context, testPlanID string) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM test_plans WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM test_runs WHERE test_plan_id = $1)`,
		testPlanID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	var exists bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM test_plans WHERE id = $1)`, testPlanID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}
	return ErrHasChildren
}
