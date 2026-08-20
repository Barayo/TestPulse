package store

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CustomFieldRepo struct {
	pool *pgxpool.Pool
}

const customFieldColumns = "id, project_id, name, field_type, position, created_at"
const customFieldOptionColumns = "id, field_id, value, position"

func scanCustomField(row pgx.Row) (domain.CustomField, error) {
	var f domain.CustomField
	err := row.Scan(&f.ID, &f.ProjectID, &f.Name, &f.FieldType, &f.Position, &f.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.CustomField{}, ErrNotFound
	}
	return f, err
}

// ProjectID resolves the project a custom field belongs to — used by
// requirePermission's per-resource resolver, mirroring
// CaseRepo.ProjectID/SuiteRepo.ProjectID.
func (r *CustomFieldRepo) ProjectID(ctx context.Context, fieldID string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM case_custom_fields WHERE id = $1`, fieldID,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}

func (r *CustomFieldRepo) Create(ctx context.Context, projectID, name string, fieldType domain.CustomFieldType) (domain.CustomField, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO case_custom_fields (project_id, name, field_type, position)
		 VALUES ($1, $2, $3, (SELECT COALESCE(max(position) + 1, 0) FROM case_custom_fields WHERE project_id = $1))
		 RETURNING `+customFieldColumns,
		projectID, name, fieldType,
	)
	return scanCustomField(row)
}

// List returns a project's custom field definitions ordered by their
// admin-set position, each with its options (populated only for `select`
// fields) ordered by their own position.
func (r *CustomFieldRepo) List(ctx context.Context, projectID string) ([]domain.CustomField, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+customFieldColumns+` FROM case_custom_fields WHERE project_id = $1 ORDER BY position`, projectID)
	if err != nil {
		return nil, err
	}
	fields := []domain.CustomField{}
	for rows.Next() {
		var f domain.CustomField
		if err := rows.Scan(&f.ID, &f.ProjectID, &f.Name, &f.FieldType, &f.Position, &f.CreatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		fields = append(fields, f)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()

	for i, f := range fields {
		opts, err := r.listOptions(ctx, f.ID)
		if err != nil {
			return nil, err
		}
		fields[i].Options = opts
	}
	return fields, nil
}

func (r *CustomFieldRepo) listOptions(ctx context.Context, fieldID string) ([]domain.CustomFieldOption, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+customFieldOptionColumns+` FROM case_custom_field_options WHERE field_id = $1 ORDER BY position`, fieldID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	opts := []domain.CustomFieldOption{}
	for rows.Next() {
		var o domain.CustomFieldOption
		if err := rows.Scan(&o.ID, &o.FieldID, &o.Value, &o.Position); err != nil {
			return nil, err
		}
		opts = append(opts, o)
	}
	return opts, rows.Err()
}

func (r *CustomFieldRepo) Rename(ctx context.Context, fieldID, name string) (domain.CustomField, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE case_custom_fields SET name = $2 WHERE id = $1 RETURNING `+customFieldColumns,
		fieldID, name,
	)
	return scanCustomField(row)
}

// Delete removes the field definition; case_custom_field_options rows
// CASCADE. Existing case versions' recorded custom_fields values are left
// untouched (immutable, design.md D6) — they simply reference an id that
// no longer resolves to a live definition.
func (r *CustomFieldRepo) Delete(ctx context.Context, fieldID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM case_custom_fields WHERE id = $1`, fieldID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Reorder rewrites every field's position to match the given order.
func (r *CustomFieldRepo) Reorder(ctx context.Context, projectID string, fieldIDs []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for i, id := range fieldIDs {
		if _, err := tx.Exec(ctx,
			`UPDATE case_custom_fields SET position = $2 WHERE id = $1 AND project_id = $3`, id, i, projectID,
		); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *CustomFieldRepo) AddOption(ctx context.Context, fieldID, value string) (domain.CustomFieldOption, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO case_custom_field_options (field_id, value, position)
		 VALUES ($1, $2, (SELECT COALESCE(max(position) + 1, 0) FROM case_custom_field_options WHERE field_id = $1))
		 RETURNING `+customFieldOptionColumns,
		fieldID, value,
	)
	var o domain.CustomFieldOption
	err := row.Scan(&o.ID, &o.FieldID, &o.Value, &o.Position)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.CustomFieldOption{}, ErrNotFound
	}
	return o, err
}

func (r *CustomFieldRepo) RemoveOption(ctx context.Context, optionID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM case_custom_field_options WHERE id = $1`, optionID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *CustomFieldRepo) ReorderOptions(ctx context.Context, fieldID string, optionIDs []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for i, id := range optionIDs {
		if _, err := tx.Exec(ctx,
			`UPDATE case_custom_field_options SET position = $2 WHERE id = $1 AND field_id = $3`, id, i, fieldID,
		); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// DeletionPreview reports how many of the project's current (non-deleted)
// cases have a value set for this field on their current version — the
// count shown by the delete-field confirmation dialog before anything is
// deleted.
func (r *CustomFieldRepo) DeletionPreview(ctx context.Context, fieldID, projectID string) (domain.CustomFieldDeletionPreview, error) {
	var preview domain.CustomFieldDeletionPreview
	err := r.pool.QueryRow(ctx,
		`SELECT count(*)
		 FROM test_cases c
		 JOIN test_case_versions v ON v.case_id = c.id AND v.version = c.current_version
		 WHERE c.project_id = $1 AND NOT c.deleted AND v.custom_fields ? $2`,
		projectID, fieldID,
	).Scan(&preview.CaseCount)
	return preview, err
}
