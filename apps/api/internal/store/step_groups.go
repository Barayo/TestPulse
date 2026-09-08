package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StepGroupRepo is a project-scoped, named, ordered list of steps
// (add-reusable-steps). Mutable in place — like CustomFieldRepo, not
// itself versioned — and soft-deletable like FolderRepo.
type StepGroupRepo struct {
	pool *pgxpool.Pool
}

const stepGroupColumns = "id, key, project_id, name, steps, created_at, updated_at"

func scanStepGroup(row pgx.Row) (domain.StepGroup, error) {
	var g domain.StepGroup
	var stepsJSON []byte
	err := row.Scan(&g.ID, &g.Key, &g.ProjectID, &g.Name, &stepsJSON, &g.CreatedAt, &g.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.StepGroup{}, ErrNotFound
	}
	if err != nil {
		return domain.StepGroup{}, err
	}
	if err := json.Unmarshal(stepsJSON, &g.Steps); err != nil {
		return domain.StepGroup{}, err
	}
	return g, nil
}

// ProjectID resolves the project a step group belongs to — used by
// requirePermission's per-resource resolver, mirroring
// CustomFieldRepo.ProjectID/FolderRepo.ProjectID.
func (r *StepGroupRepo) ProjectID(ctx context.Context, groupID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM step_groups WHERE id = $1`, groupID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

func (r *StepGroupRepo) Create(ctx context.Context, projectID, name string, steps []domain.Step) (domain.StepGroup, error) {
	stepsJSON, err := marshalSteps(steps)
	if err != nil {
		return domain.StepGroup{}, err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.StepGroup{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	key, err := claimEntityKey(ctx, tx, projectID, "stepgroup", "%s-SG%d")
	if err != nil {
		return domain.StepGroup{}, err
	}

	row := tx.QueryRow(ctx,
		`INSERT INTO step_groups (key, project_id, name, steps)
		 VALUES ($1, $2, $3, $4) RETURNING `+stepGroupColumns,
		key, projectID, name, stepsJSON,
	)
	g, err := scanStepGroup(row)
	if err != nil {
		return domain.StepGroup{}, err
	}
	return g, tx.Commit(ctx)
}

func (r *StepGroupRepo) Get(ctx context.Context, groupID string) (domain.StepGroup, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+stepGroupColumns+` FROM step_groups WHERE id = $1 AND NOT deleted`, groupID)
	return scanStepGroup(row)
}

// GetByKey resolves a step group's key to its full content — used by the
// MCP tools' upsert-by-key path and by case-save's server-side GroupRef
// resolution (add-reusable-steps design.md: the server always re-resolves
// itself, never trusting client-supplied step content for a reference).
func (r *StepGroupRepo) GetByKey(ctx context.Context, key string) (domain.StepGroup, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT `+stepGroupColumns+` FROM step_groups WHERE key = $1 AND NOT deleted`, key)
	return scanStepGroup(row)
}

// List returns every non-deleted step group in a project, insertion order.
func (r *StepGroupRepo) List(ctx context.Context, projectID string) ([]domain.StepGroup, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+stepGroupColumns+` FROM step_groups WHERE project_id = $1 AND NOT deleted ORDER BY created_at`,
		projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	groups := []domain.StepGroup{}
	for rows.Next() {
		g, err := scanStepGroup(rows)
		if err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

func (r *StepGroupRepo) Update(ctx context.Context, groupID, name string, steps []domain.Step) (domain.StepGroup, error) {
	stepsJSON, err := marshalSteps(steps)
	if err != nil {
		return domain.StepGroup{}, err
	}
	row := r.pool.QueryRow(ctx,
		`UPDATE step_groups SET name = $2, steps = $3, updated_at = now()
		 WHERE id = $1 AND NOT deleted RETURNING `+stepGroupColumns,
		groupID, name, stepsJSON,
	)
	return scanStepGroup(row)
}

// Delete is a soft delete — already-saved case versions have already
// resolved and snapshotted any reference to this group, so they are
// unaffected (design.md: snapshot-at-save, not a live reference).
func (r *StepGroupRepo) Delete(ctx context.Context, groupID string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE step_groups SET deleted = true WHERE id = $1 AND NOT deleted`, groupID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
