package store

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ProjectMemberRepo struct {
	pool *pgxpool.Pool
}

func (r *ProjectMemberRepo) SetMember(ctx context.Context, projectID, userID, roleID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO project_members (project_id, user_id, role_id) VALUES ($1, $2, $3)
		 ON CONFLICT (project_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
		projectID, userID, roleID)
	return err
}

func (r *ProjectMemberRepo) RemoveMember(ctx context.Context, projectID, userID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, projectID, userID)
	return err
}

func (r *ProjectMemberRepo) SetTeamRole(ctx context.Context, projectID, teamID, roleID string) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO project_team_roles (project_id, team_id, role_id) VALUES ($1, $2, $3)
		 ON CONFLICT (project_id, team_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
		projectID, teamID, roleID)
	return err
}

func (r *ProjectMemberRepo) RemoveTeamRole(ctx context.Context, projectID, teamID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM project_team_roles WHERE project_id = $1 AND team_id = $2`, projectID, teamID)
	return err
}

// Membership lists a project's directly-assigned users and assigned teams,
// each with their role (the "project-membership" spec's listing requirement).
func (r *ProjectMemberRepo) Membership(ctx context.Context, projectID string) (domain.ProjectMembership, error) {
	m := domain.ProjectMembership{Users: []domain.ProjectMember{}, Teams: []domain.ProjectTeamRole{}}

	userRows, err := r.pool.Query(ctx,
		`SELECT user_id, role_id FROM project_members WHERE project_id = $1`, projectID)
	if err != nil {
		return domain.ProjectMembership{}, err
	}
	for userRows.Next() {
		var pm domain.ProjectMember
		if err := userRows.Scan(&pm.UserID, &pm.RoleID); err != nil {
			userRows.Close()
			return domain.ProjectMembership{}, err
		}
		m.Users = append(m.Users, pm)
	}
	userRows.Close()
	if err := userRows.Err(); err != nil {
		return domain.ProjectMembership{}, err
	}

	teamRows, err := r.pool.Query(ctx,
		`SELECT team_id, role_id FROM project_team_roles WHERE project_id = $1`, projectID)
	if err != nil {
		return domain.ProjectMembership{}, err
	}
	for teamRows.Next() {
		var pt domain.ProjectTeamRole
		if err := teamRows.Scan(&pt.TeamID, &pt.RoleID); err != nil {
			teamRows.Close()
			return domain.ProjectMembership{}, err
		}
		m.Teams = append(m.Teams, pt)
	}
	teamRows.Close()
	return m, teamRows.Err()
}

// DirectProjectCountForUser counts a user's direct project memberships —
// used by the user-deletion confirmation preview (add-user-deletion). Team-
// derived project access isn't counted: deleting a user never touches team
// membership rows for anyone else, so it isn't part of "what deleting this
// account removes."
func (r *ProjectMemberRepo) DirectProjectCountForUser(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx,
		`SELECT count(*) FROM project_members WHERE user_id = $1`, userID,
	).Scan(&count)
	return count, err
}

// EffectivePermissions resolves userID's effective permissions on
// projectID: the union (OR) of every role's flags reachable via direct
// assignment and/or team membership (design.md D3/D10). Returns
// ErrNotFound when no role is reachable at all — the caller has no access,
// not even read.
func (r *ProjectMemberRepo) EffectivePermissions(ctx context.Context, userID, projectID string) (domain.Permissions, error) {
	var perms domain.Permissions
	var count int
	err := r.pool.QueryRow(ctx, `
		SELECT count(*),
		       COALESCE(bool_or(rl.can_read), false),
		       COALESCE(bool_or(rl.can_case_create), false),
		       COALESCE(bool_or(rl.can_case_edit), false),
		       COALESCE(bool_or(rl.can_case_delete), false),
		       COALESCE(bool_or(rl.can_section_create), false),
		       COALESCE(bool_or(rl.can_section_delete), false),
		       COALESCE(bool_or(rl.can_suite_create), false),
		       COALESCE(bool_or(rl.can_suite_edit_membership), false),
		       COALESCE(bool_or(rl.can_run_create), false),
		       COALESCE(bool_or(rl.can_run_record_result), false),
		       COALESCE(bool_or(rl.can_manage_project), false)
		FROM roles rl
		WHERE rl.id IN (
			SELECT role_id FROM project_members WHERE project_id = $1 AND user_id = $2
			UNION
			SELECT ptr.role_id FROM project_team_roles ptr
			JOIN team_members tm ON tm.team_id = ptr.team_id
			WHERE ptr.project_id = $1 AND tm.user_id = $2
		)`, projectID, userID,
	).Scan(&count, &perms.Read, &perms.CaseCreate, &perms.CaseEdit, &perms.CaseDelete,
		&perms.SectionCreate, &perms.SectionDelete, &perms.SuiteCreate, &perms.SuiteEditMembership,
		&perms.RunCreate, &perms.RunRecordResult, &perms.ManageProject)
	if err != nil {
		return domain.Permissions{}, err
	}
	if count == 0 {
		return domain.Permissions{}, ErrNotFound
	}
	return perms, nil
}
