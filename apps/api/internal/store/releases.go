package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ReleaseRepo struct {
	pool *pgxpool.Pool
}

// ProjectID resolves the project a release belongs to — used by
// requirePermission's per-resource resolver (add-project-rbac design.md D5).
func (r *ReleaseRepo) ProjectID(ctx context.Context, releaseID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM releases WHERE id = $1`, releaseID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// IDByKey resolves a release's key to its internal id (add-human-readable-keys D4).
func (r *ReleaseRepo) IDByKey(ctx context.Context, key string) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `SELECT id FROM releases WHERE key = $1`, key).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}

// Create inserts a release and claims its key in one transaction
// (introduce-release-test-plan design.md D6). Status defaults to active if
// empty.
func (r *ReleaseRepo) Create(ctx context.Context, projectID, name, description string, status domain.ReleaseStatus) (domain.Release, error) {
	if status == "" {
		status = domain.ReleaseStatusActive
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Release{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	key, err := claimEntityKey(ctx, tx, projectID, "release", "%s-REL%d")
	if err != nil {
		return domain.Release{}, fmt.Errorf("claiming release key: %w", err)
	}

	var rel domain.Release
	err = tx.QueryRow(ctx,
		`INSERT INTO releases (key, project_id, name, description, status) VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, key, project_id, name, description, status, created_at`,
		key, projectID, name, description, status,
	).Scan(&rel.ID, &rel.Key, &rel.ProjectID, &rel.Name, &rel.Description, &rel.Status, &rel.CreatedAt)
	if err != nil {
		return domain.Release{}, err
	}
	return rel, tx.Commit(ctx)
}

func (r *ReleaseRepo) Get(ctx context.Context, releaseID string) (domain.Release, error) {
	var rel domain.Release
	err := r.pool.QueryRow(ctx,
		`SELECT id, key, project_id, name, description, status, created_at FROM releases WHERE id = $1`, releaseID,
	).Scan(&rel.ID, &rel.Key, &rel.ProjectID, &rel.Name, &rel.Description, &rel.Status, &rel.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Release{}, ErrNotFound
	}
	return rel, err
}

// List returns a project's releases, newest-first, optionally filtered by
// status (empty statusFilter returns every status).
func (r *ReleaseRepo) List(ctx context.Context, projectID string, statusFilter domain.ReleaseStatus) ([]domain.Release, error) {
	var filterArg any
	if statusFilter != "" {
		filterArg = statusFilter
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, key, project_id, name, description, status, created_at FROM releases
		 WHERE project_id = $1 AND ($2::text IS NULL OR status = $2)
		 ORDER BY created_at DESC`, projectID, filterArg)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	releases := []domain.Release{}
	for rows.Next() {
		var rel domain.Release
		if err := rows.Scan(&rel.ID, &rel.Key, &rel.ProjectID, &rel.Name, &rel.Description, &rel.Status, &rel.CreatedAt); err != nil {
			return nil, err
		}
		releases = append(releases, rel)
	}
	return releases, rows.Err()
}

// Update overwrites a release's name, description, and status (a full
// update, like RoleRepo.Update — matches this codebase's existing pattern
// for small entities with few mutable fields).
func (r *ReleaseRepo) Update(ctx context.Context, rel domain.Release) (domain.Release, error) {
	var updated domain.Release
	err := r.pool.QueryRow(ctx,
		`UPDATE releases SET name = $2, description = $3, status = $4 WHERE id = $1
		 RETURNING id, key, project_id, name, description, status, created_at`,
		rel.ID, rel.Name, rel.Description, rel.Status,
	).Scan(&updated.ID, &updated.Key, &updated.ProjectID, &updated.Name, &updated.Description, &updated.Status, &updated.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Release{}, ErrNotFound
	}
	return updated, err
}

// Rollup aggregates a Release's run count and pass rate across every Run
// belonging to any of its Test Plans, in a single query
// (introduce-release-test-plan design.md D5) — never a client-side
// per-Test-Plan fetch loop. PassRate is nil when there are no items across
// any run (including when the Release has no Test Plans, or its Test Plans
// have no Runs, at all).
func (r *ReleaseRepo) Rollup(ctx context.Context, releaseID string) (domain.Rollup, error) {
	var rollup domain.Rollup
	var total, passCount int
	err := r.pool.QueryRow(ctx,
		`SELECT count(DISTINCT tr.id), count(i.id), count(i.id) FILTER (WHERE i.current_status = 'pass')
		 FROM test_plans tp
		 JOIN test_runs tr ON tr.test_plan_id = tp.id
		 LEFT JOIN test_run_items i ON i.run_id = tr.id
		 WHERE tp.release_id = $1`, releaseID,
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

// Delete removes a release, rejected with ErrHasChildren while it still has
// Test Plans (introduce-release-test-plan spec: "Deleting a Release with
// Test Plans is rejected") — never silently orphans execution history.
func (r *ReleaseRepo) Delete(ctx context.Context, releaseID string) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM releases WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM test_plans WHERE release_id = $1)`,
		releaseID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	var exists bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM releases WHERE id = $1)`, releaseID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}
	return ErrHasChildren
}
