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
	"can_section_create, can_section_edit, can_section_delete, can_suite_create, can_suite_edit_membership, " +
	"can_run_create, can_run_record_result, can_manage_project, can_run_delete, can_project_delete, created_at"

// roleFlagColumns is roleColumns without id/name/rank/created_at — the
// design.md D11/add-data-retention D3 permission flags (plus
// add-library-folder-selection's sectionEdit), in the same order used by
// every INSERT/UPDATE/scan below.
const roleFlagColumns = "can_read, can_case_create, can_case_edit, can_case_delete, " +
	"can_section_create, can_section_edit, can_section_delete, can_suite_create, can_suite_edit_membership, " +
	"can_run_create, can_run_record_result, can_manage_project, can_run_delete, can_project_delete"

func roleFlagValues(role domain.Role) []any {
	return []any{
		role.CanRead, role.CanCaseCreate, role.CanCaseEdit, role.CanCaseDelete,
		role.CanSectionCreate, role.CanSectionEdit, role.CanSectionDelete, role.CanSuiteCreate, role.CanSuiteEditMembership,
		role.CanRunCreate, role.CanRunRecordResult, role.CanManageProject,
		role.CanRunDelete, role.CanProjectDelete,
	}
}

func roleScanTargets(r *domain.Role) []any {
	return []any{
		&r.ID, &r.Name, &r.Rank, &r.CanRead, &r.CanCaseCreate, &r.CanCaseEdit, &r.CanCaseDelete,
		&r.CanSectionCreate, &r.CanSectionEdit, &r.CanSectionDelete, &r.CanSuiteCreate, &r.CanSuiteEditMembership,
		&r.CanRunCreate, &r.CanRunRecordResult, &r.CanManageProject,
		&r.CanRunDelete, &r.CanProjectDelete, &r.CreatedAt,
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
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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

// ListPage is List, cursor-paginated (add-cursor-pagination). Preserves
// List's existing "rank, created_at" order (the seeded Tester/Contributor/
// Project Admin tiers stay grouped), with id as the final deterministic
// tiebreak — the cursor carries rank too (encodeCursorWithRank), or
// resuming right at a rank boundary would skip or duplicate a row.
func (r *RoleRepo) ListPage(ctx context.Context, cursor string, limit int) ([]domain.Role, string, error) {
	var cursorRank any
	var cursorCreatedAt any
	var cursorID any
	if cursor != "" {
		rank, createdAt, id, err := decodeCursorWithRank(cursor)
		if err != nil {
			return nil, "", err
		}
		cursorRank, cursorCreatedAt, cursorID = rank, createdAt, id
	}
	rows, err := r.pool.Query(ctx,
		`SELECT `+roleColumns+` FROM roles
		 WHERE $1::int IS NULL OR (rank, created_at, id) > ($1, $2, $3)
		 ORDER BY rank ASC, created_at ASC, id ASC
		 LIMIT $4`, cursorRank, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	roles := []domain.Role{}
	for rows.Next() {
		var role domain.Role
		if err := rows.Scan(roleScanTargets(&role)...); err != nil {
			return nil, "", err
		}
		roles = append(roles, role)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(roles) > limit {
		last := roles[limit-1]
		nextCursor = encodeCursorWithRank(last.Rank, last.CreatedAt, last.ID)
		roles = roles[:limit]
	}
	return roles, nextCursor, nil
}

func (r *RoleRepo) Update(ctx context.Context, role domain.Role) (domain.Role, error) {
	row := r.pool.QueryRow(ctx,
		`UPDATE roles SET name = $2, rank = $3, can_read = $4, can_case_create = $5, can_case_edit = $6,
		                   can_case_delete = $7, can_section_create = $8, can_section_edit = $9, can_section_delete = $10,
		                   can_suite_create = $11, can_suite_edit_membership = $12, can_run_create = $13,
		                   can_run_record_result = $14, can_manage_project = $15, can_run_delete = $16,
		                   can_project_delete = $17
		 WHERE id = $1
		 RETURNING `+roleColumns,
		append([]any{role.ID, role.Name, role.Rank}, roleFlagValues(role)...)...,
	)
	return scanRole(row)
}

// ReferenceCounts returns how many users hold this role directly
// (project_members), how many teams hold it (project_team_roles), and how
// many distinct projects either touches — the real numbers shown by the
// delete-role confirmation dialog (redesign-admin-shell), mirroring the
// pattern add-user-deletion already established for deleting a user.
func (r *RoleRepo) ReferenceCounts(ctx context.Context, roleID string) (directUsers, teams, projects int, err error) {
	err = r.pool.QueryRow(ctx,
		`SELECT
		   (SELECT count(*) FROM project_members WHERE role_id = $1),
		   (SELECT count(*) FROM project_team_roles WHERE role_id = $1),
		   (SELECT count(*) FROM (
		      SELECT project_id FROM project_members WHERE role_id = $1
		      UNION
		      SELECT project_id FROM project_team_roles WHERE role_id = $1
		    ) p)`,
		roleID,
	).Scan(&directUsers, &teams, &projects)
	return directUsers, teams, projects, err
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
