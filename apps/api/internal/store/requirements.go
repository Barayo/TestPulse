package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RequirementRepo struct {
	pool *pgxpool.Pool
}

// ProjectID resolves the project a requirement belongs to — used by
// requirePermission's per-resource resolver (add-project-rbac design.md D5).
func (r *RequirementRepo) ProjectID(ctx context.Context, requirementID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM requirements WHERE id = $1`, requirementID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

// IDByKey resolves a requirement's key to its internal id (add-human-readable-keys D4).
func (r *RequirementRepo) IDByKey(ctx context.Context, key string) (string, error) {
	var id string
	err := r.pool.QueryRow(ctx, `SELECT id FROM requirements WHERE key = $1`, key).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return id, err
}

// Create inserts a requirement and claims its key in one transaction
// (design.md D5 — {projectKey}-REQ{n}).
func (r *RequirementRepo) Create(ctx context.Context, projectID, name, description, externalRef string) (domain.Requirement, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.Requirement{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	key, err := claimEntityKey(ctx, tx, projectID, "requirement", "%s-REQ%d")
	if err != nil {
		return domain.Requirement{}, fmt.Errorf("claiming requirement key: %w", err)
	}

	var req domain.Requirement
	err = tx.QueryRow(ctx,
		`INSERT INTO requirements (key, project_id, name, description, external_ref) VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, key, project_id, name, description, external_ref, created_at`,
		key, projectID, name, description, externalRef,
	).Scan(&req.ID, &req.Key, &req.ProjectID, &req.Name, &req.Description, &req.ExternalRef, &req.CreatedAt)
	if err != nil {
		return domain.Requirement{}, err
	}
	req.CaseIDs = []string{}
	return req, tx.Commit(ctx)
}

// Get returns a requirement with its live (non-soft-deleted) linked case
// ids — mirrors SuiteRepo.Get's "AND NOT c.deleted" filter exactly, since
// a soft-deleted case's requirement_cases row isn't force-removed (deletion
// is soft, not a hard row delete).
func (r *RequirementRepo) Get(ctx context.Context, requirementID string) (domain.Requirement, error) {
	var req domain.Requirement
	err := r.pool.QueryRow(ctx,
		`SELECT id, key, project_id, name, description, external_ref, created_at FROM requirements WHERE id = $1`, requirementID,
	).Scan(&req.ID, &req.Key, &req.ProjectID, &req.Name, &req.Description, &req.ExternalRef, &req.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Requirement{}, ErrNotFound
	}
	if err != nil {
		return domain.Requirement{}, err
	}

	rows, err := r.pool.Query(ctx,
		`SELECT rc.case_id FROM requirement_cases rc
		 JOIN test_cases c ON c.id = rc.case_id AND NOT c.deleted
		 WHERE rc.requirement_id = $1 ORDER BY c.created_at`, requirementID)
	if err != nil {
		return domain.Requirement{}, err
	}
	defer rows.Close()
	req.CaseIDs = []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return domain.Requirement{}, err
		}
		req.CaseIDs = append(req.CaseIDs, id)
	}
	return req, rows.Err()
}

// List returns a project's requirements, oldest-first. Populates CaseIDs
// via a per-row Get, mirroring SuiteRepo.List's established precedent for
// this same shape of secondary data.
func (r *RequirementRepo) List(ctx context.Context, projectID string) ([]domain.Requirement, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id FROM requirements WHERE project_id = $1 ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	reqs := make([]domain.Requirement, 0, len(ids))
	for _, id := range ids {
		req, err := r.Get(ctx, id)
		if err != nil {
			return nil, err
		}
		reqs = append(reqs, req)
	}
	return reqs, nil
}

// Update overwrites a requirement's name, description, and externalRef —
// matches ReleaseRepo.Update's full-update pattern for small entities with
// few mutable fields.
func (r *RequirementRepo) Update(ctx context.Context, req domain.Requirement) (domain.Requirement, error) {
	var updated domain.Requirement
	err := r.pool.QueryRow(ctx,
		`UPDATE requirements SET name = $2, description = $3, external_ref = $4 WHERE id = $1
		 RETURNING id, key, project_id, name, description, external_ref, created_at`,
		req.ID, req.Name, req.Description, req.ExternalRef,
	).Scan(&updated.ID, &updated.Key, &updated.ProjectID, &updated.Name, &updated.Description, &updated.ExternalRef, &updated.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Requirement{}, ErrNotFound
	}
	if err != nil {
		return domain.Requirement{}, err
	}
	full, err := r.Get(ctx, updated.ID)
	if err != nil {
		return domain.Requirement{}, err
	}
	return full, nil
}

// Delete removes a requirement, rejected with ErrHasChildren while it still
// has live (non-soft-deleted) linked cases — same "reject orphaning"
// pattern as ReleaseRepo.Delete for Test Plans.
func (r *RequirementRepo) Delete(ctx context.Context, requirementID string) error {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM requirements req WHERE req.id = $1 AND NOT EXISTS (
		   SELECT 1 FROM requirement_cases rc
		   JOIN test_cases c ON c.id = rc.case_id AND NOT c.deleted
		   WHERE rc.requirement_id = req.id
		 )`, requirementID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 1 {
		return nil
	}
	var exists bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM requirements WHERE id = $1)`, requirementID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}
	return ErrHasChildren
}

// LinkCase is idempotent — linking an already-linked pair is a no-op, not
// an error (mirrors SuiteRepo.AddCase's ON CONFLICT DO NOTHING).
func (r *RequirementRepo) LinkCase(ctx context.Context, requirementID, caseID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO requirement_cases (requirement_id, case_id) VALUES ($1, $2)
		 ON CONFLICT DO NOTHING`, requirementID, caseID)
	return err
}

// UnlinkCase removes only the link — neither the case nor the requirement
// is affected (mirrors SuiteRepo.RemoveCase).
func (r *RequirementRepo) UnlinkCase(ctx context.Context, requirementID, caseID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM requirement_cases WHERE requirement_id = $1 AND case_id = $2`, requirementID, caseID)
	return err
}

// CoverageForRelease computes, in one aggregate query, every Requirement in
// the Release's project with a worst-case rollup status across its linked
// Cases' latest current_status among Runs scoped to that Release's Test
// Plans specifically (design.md D3) — never a client-side per-case fetch
// loop. A linked case's status folds pending/retest/skipped into the
// "no informative result" bucket alongside "no result at all", since none
// of those tell you whether the requirement is actually covered.
func (r *RequirementRepo) CoverageForRelease(ctx context.Context, releaseID string) ([]domain.RequirementCoverage, error) {
	rows, err := r.pool.Query(ctx, `
		WITH scoped_items AS (
			SELECT DISTINCT ON (i.case_id) i.case_id, i.current_status
			FROM test_run_items i
			JOIN test_runs tr ON tr.id = i.run_id
			JOIN test_plans tp ON tp.id = tr.test_plan_id
			WHERE tp.release_id = $1
			ORDER BY i.case_id, i.created_at DESC
		)
		SELECT r.id, r.key, r.name,
			count(tc.id) AS case_count,
			count(tc.id) FILTER (
				WHERE si.current_status IS NULL OR si.current_status IN ('pending', 'retest', 'skipped')
			) AS notrun_count,
			count(tc.id) FILTER (WHERE si.current_status IN ('failed', 'blocked')) AS failing_count
		FROM requirements r
		LEFT JOIN requirement_cases rc ON rc.requirement_id = r.id
		LEFT JOIN test_cases tc ON tc.id = rc.case_id AND NOT tc.deleted
		LEFT JOIN scoped_items si ON si.case_id = tc.id
		WHERE r.project_id = (SELECT project_id FROM releases WHERE id = $1)
		GROUP BY r.id, r.key, r.name, r.created_at
		ORDER BY r.created_at`, releaseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	coverage := []domain.RequirementCoverage{}
	for rows.Next() {
		var c domain.RequirementCoverage
		var caseCount, notRunCount, failingCount int
		if err := rows.Scan(&c.RequirementID, &c.RequirementKey, &c.Name, &caseCount, &notRunCount, &failingCount); err != nil {
			return nil, err
		}
		c.CaseCount = caseCount
		switch {
		case caseCount == 0 || notRunCount > 0:
			c.Status = domain.CoverageNotRun
		case failingCount > 0:
			c.Status = domain.CoverageFailing
		default:
			c.Status = domain.CoverageCovered
		}
		coverage = append(coverage, c)
	}
	return coverage, rows.Err()
}
