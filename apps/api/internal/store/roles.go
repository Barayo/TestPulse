package store

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RoleRepo struct {
	pool *pgxpool.Pool
}

const roleColumns = "id, name, rank, can_read, can_case_create, can_case_edit, can_case_delete, " +
	"can_section_create, can_section_delete, can_suite_create, can_suite_edit_membership, " +
	"can_run_create, can_run_record_result, can_manage_project, created_at"

// roleFlagColumns is roleColumns without id/name/rank/created_at — the ten
// design.md D11 permission flags, in the same order used by every INSERT/
// UPDATE/scan below.
const roleFlagColumns = "can_read, can_case_create, can_case_edit, can_case_delete, " +
	"can_section_create, can_section_delete, can_suite_create, can_suite_edit_membership, " +
	"can_run_create, can_run_record_result, can_manage_project"

func roleFlagValues(role domain.Role) []any {
	return []any{
		role.CanRead, role.CanCaseCreate, role.CanCaseEdit, role.CanCaseDelete,
		role.CanSectionCreate, role.CanSectionDelete, role.CanSuiteCreate, role.CanSuiteEditMembership,
		role.CanRunCreate, role.CanRunRecordResult, role.CanManageProject,
	}
}

func roleScanTargets(r *domain.Role) []any {
	return []any{
		&r.ID, &r.Name, &r.Rank, &r.CanRead, &r.CanCaseCreate, &r.CanCaseEdit, &r.CanCaseDelete,
		&r.CanSectionCreate, &r.CanSectionDelete, &r.CanSuiteCreate, &r.CanSuiteEditMembership,
		&r.CanRunCreate, &r.CanRunRecordResult, &r.CanManageProject, &r.CreatedAt,
	}
}

func scanRole(row pgx.Row) (domain.Role, error) {
	var r domain.Role
	err := row.Scan(roleScanTargets(&r)...)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Role{}, ErrNotFound
	}
	return r, err
}

func (r *RoleRepo) Create(ctx context.Context, role domain.Role) (domain.Role, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO roles (name, rank, `+roleFlagColumns+`)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		 RETURNING `+roleColumns,
		append([]any{role.Name, role.Rank}, roleFlagValues(role)...)...,
	)
	return scanRole(row)
}

func (r *RoleRepo) Get(ctx context.Context, id string) (domain.Role, error) {
	row := r.pool.QueryRow(ctx, `SELECT `+roleColumns+` FROM roles WHERE id = $1`, id)
	return scanRole(row)
}

func (r *RoleRepo) List(ctx context.Context) ([]domain.Role, error) {
	rows, err := r.pool.Query(ctx, `SELECT `+roleColumns+` FROM roles ORDER BY rank, created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	roles := []domain.Role{}
	for rows.Next() {
		var role domain.Role
		if err := rows.Scan(roleScanTargets(&role)...); err != nil {
			return nil, err
		}
		roles = append(roles, role)
	}
	return roles, rows.Err()
}

func (r *RoleRepo) Update(ctx context.Context, role domain.Role) (domain.Role, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE roles SET name = $2, rank = $3, can_read = $4, can_case_create = $5, can_case_edit = $6,
		                   can_case_delete = $7, can_section_create = $8, can_section_delete = $9,
		                   can_suite_create = $10, can_suite_edit_membership = $11, can_run_create = $12,
		                   can_run_record_result = $13, can_manage_project = $14
		 WHERE id = $1
		 RETURNING `+roleColumns,
		append([]any{role.ID, role.Name, role.Rank}, roleFlagValues(role)...)...,
	)
	return scanRole(row)
}

// Delete removes the role; project_members/project_team_roles rows
// referencing it CASCADE (design.md D10), so any user whose access
// depended solely on this role loses it.
func (r *RoleRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM roles WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
