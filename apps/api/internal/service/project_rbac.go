package service

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// --- Permission resolution (used by requirePermission middleware) ---

// EffectivePermissions resolves actor's effective permissions on projectID
// via direct membership and team membership (design.md D3/D10). Callers
// that need the Tenant Admin bypass check it themselves before calling
// this — it always performs the real per-project lookup.
func (s *Service) EffectivePermissions(ctx context.Context, actor domain.Actor, projectID string) (domain.Permissions, error) {
	return s.store.ProjectMembers.EffectivePermissions(ctx, actor.EffectiveUserID, projectID)
}

// --- Roles (add-project-rbac design.md D10 — fully custom, instance-wide) ---

func (s *Service) CreateRole(ctx context.Context, actor domain.Actor, role domain.Role) (domain.Role, error) {
	if !actor.IsTenantAdmin {
		return domain.Role{}, forbidden("only a Tenant Admin can manage roles")
	}
	if err := domain.ValidateRoleName(role.Name); err != nil {
		return domain.Role{}, invalid("%s", err)
	}
	created, err := s.store.Roles.Create(ctx, role)
	if err != nil {
		return domain.Role{}, err
	}
	s.audit(ctx, "create", "role", created.ID)
	return created, nil
}

func (s *Service) ListRoles(ctx context.Context) ([]domain.Role, error) {
	return s.store.Roles.List(ctx)
}

func (s *Service) UpdateRole(ctx context.Context, actor domain.Actor, role domain.Role) (domain.Role, error) {
	if !actor.IsTenantAdmin {
		return domain.Role{}, forbidden("only a Tenant Admin can manage roles")
	}
	if err := domain.ValidateRoleName(role.Name); err != nil {
		return domain.Role{}, invalid("%s", err)
	}
	updated, err := s.store.Roles.Update(ctx, role)
	if err != nil {
		return domain.Role{}, err
	}
	s.audit(ctx, "update", "role", updated.ID)
	return updated, nil
}

func (s *Service) DeleteRole(ctx context.Context, actor domain.Actor, roleID string) error {
	if !actor.IsTenantAdmin {
		return forbidden("only a Tenant Admin can manage roles")
	}
	if err := s.store.Roles.Delete(ctx, roleID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "role", roleID)
	return nil
}

// defaultRoles mirrors the seed data in migration 00003_identity.sql exactly
// — keep both in sync. Used by ResetRolesToDefaults below.
var defaultRoles = []domain.Role{
	{Name: "Tester", Rank: 1, CanRead: true, CanRunCreate: true, CanRunRecordResult: true},
	{
		Name: "Contributor", Rank: 2, CanRead: true,
		CanCaseCreate: true, CanCaseEdit: true, CanSectionCreate: true, CanSuiteCreate: true, CanSuiteEditMembership: true,
		CanRunCreate: true, CanRunRecordResult: true,
	},
	{
		Name: "Project Admin", Rank: 3, CanRead: true,
		CanCaseCreate: true, CanCaseEdit: true, CanCaseDelete: true, CanSectionCreate: true, CanSectionDelete: true,
		CanSuiteCreate: true, CanSuiteEditMembership: true, CanRunCreate: true, CanRunRecordResult: true, CanManageProject: true,
	},
}

// ResetRolesToDefaults restores Tester/Contributor/Project Admin to their
// factory permission flags (design.md D12) — selectively, not a full wipe:
// an existing role with one of these three names is updated *in place*
// (same id, so every project/team assignment referencing it stays valid),
// and a missing one is recreated. Every other role, and every assignment
// anywhere in the instance, is left completely untouched.
func (s *Service) ResetRolesToDefaults(ctx context.Context, actor domain.Actor) ([]domain.Role, error) {
	if !actor.IsTenantAdmin {
		return nil, forbidden("only a Tenant Admin can reset roles")
	}
	existing, err := s.store.Roles.List(ctx)
	if err != nil {
		return nil, err
	}
	byName := make(map[string]domain.Role, len(existing))
	for _, r := range existing {
		byName[r.Name] = r
	}

	result := make([]domain.Role, 0, len(defaultRoles))
	for _, def := range defaultRoles {
		if current, ok := byName[def.Name]; ok {
			def.ID = current.ID
			updated, err := s.store.Roles.Update(ctx, def)
			if err != nil {
				return nil, err
			}
			result = append(result, updated)
			continue
		}
		created, err := s.store.Roles.Create(ctx, def)
		if err != nil {
			return nil, err
		}
		result = append(result, created)
	}
	s.audit(ctx, "reset", "role", "defaults")
	return result, nil
}

func (s *Service) ProjectIDForCase(ctx context.Context, caseID string) (string, error) {
	return s.store.Cases.ProjectID(ctx, caseID)
}

func (s *Service) ProjectIDForSuite(ctx context.Context, suiteID string) (string, error) {
	return s.store.Suites.ProjectID(ctx, suiteID)
}

func (s *Service) ProjectIDForRun(ctx context.Context, runID string) (string, error) {
	return s.store.Runs.ProjectID(ctx, runID)
}

func (s *Service) ProjectIDForFolder(ctx context.Context, folderID string) (string, error) {
	return s.store.Folders.ProjectID(ctx, folderID)
}

func (s *Service) ProjectIDForItem(ctx context.Context, itemID string) (string, error) {
	return s.store.Runs.ItemProjectID(ctx, itemID)
}

// --- Human-readable key resolution (add-human-readable-keys D4) ---
// Resolves a client-supplied key to its internal id, once, at the API
// boundary — everything below this point (RBAC resolvers, other service
// methods, every store method) keeps operating on the internal id
// unchanged.

func (s *Service) ProjectIDByKey(ctx context.Context, key string) (string, error) {
	return s.store.Projects.IDByKey(ctx, key)
}

func (s *Service) CaseIDByKey(ctx context.Context, key string) (string, error) {
	return s.store.Cases.IDByKey(ctx, key)
}

func (s *Service) RunIDByKey(ctx context.Context, key string) (string, error) {
	return s.store.Runs.IDByKey(ctx, key)
}

func (s *Service) SuiteIDByKey(ctx context.Context, key string) (string, error) {
	return s.store.Suites.IDByKey(ctx, key)
}

// --- Teams ---

func (s *Service) CreateTeam(ctx context.Context, actor domain.Actor, name string) (domain.Team, error) {
	if !actor.IsTenantAdmin {
		return domain.Team{}, forbidden("only a Tenant Admin can manage teams")
	}
	if err := domain.ValidateTeamName(name); err != nil {
		return domain.Team{}, invalid("%s", err)
	}
	team, err := s.store.Teams.Create(ctx, name)
	if err != nil {
		return domain.Team{}, err
	}
	s.audit(ctx, "create", "team", team.ID)
	return team, nil
}

func (s *Service) ListTeams(ctx context.Context) ([]domain.Team, error) {
	return s.store.Teams.List(ctx)
}

func (s *Service) RenameTeam(ctx context.Context, actor domain.Actor, teamID, name string) (domain.Team, error) {
	if !actor.IsTenantAdmin {
		return domain.Team{}, forbidden("only a Tenant Admin can manage teams")
	}
	if err := domain.ValidateTeamName(name); err != nil {
		return domain.Team{}, invalid("%s", err)
	}
	if err := s.store.Teams.Rename(ctx, teamID, name); err != nil {
		return domain.Team{}, err
	}
	s.audit(ctx, "rename", "team", teamID)
	return s.store.Teams.Get(ctx, teamID)
}

func (s *Service) DeleteTeam(ctx context.Context, actor domain.Actor, teamID string) error {
	if !actor.IsTenantAdmin {
		return forbidden("only a Tenant Admin can manage teams")
	}
	if err := s.store.Teams.Delete(ctx, teamID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "team", teamID)
	return nil
}

func (s *Service) AddTeamMember(ctx context.Context, actor domain.Actor, teamID, userID string) (domain.Team, error) {
	if !actor.IsTenantAdmin {
		return domain.Team{}, forbidden("only a Tenant Admin can manage teams")
	}
	if err := s.store.Teams.AddMember(ctx, teamID, userID); err != nil {
		return domain.Team{}, err
	}
	s.audit(ctx, "add_member", "team", teamID)
	return s.store.Teams.Get(ctx, teamID)
}

func (s *Service) RemoveTeamMember(ctx context.Context, actor domain.Actor, teamID, userID string) (domain.Team, error) {
	if !actor.IsTenantAdmin {
		return domain.Team{}, forbidden("only a Tenant Admin can manage teams")
	}
	if err := s.store.Teams.RemoveMember(ctx, teamID, userID); err != nil {
		return domain.Team{}, err
	}
	s.audit(ctx, "remove_member", "team", teamID)
	return s.store.Teams.Get(ctx, teamID)
}

// --- Project membership ---

func (s *Service) SetProjectMember(ctx context.Context, actor domain.Actor, projectID, userID, roleID string) error {
	if !actor.IsTenantAdmin {
		return forbidden("only a Tenant Admin can assign project membership")
	}
	if _, err := s.store.Roles.Get(ctx, roleID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return invalid("roleId does not reference an existing role")
		}
		return err
	}
	if err := s.store.ProjectMembers.SetMember(ctx, projectID, userID, roleID); err != nil {
		return err
	}
	s.audit(ctx, "set_member", "project", projectID)
	return nil
}

func (s *Service) RemoveProjectMember(ctx context.Context, actor domain.Actor, projectID, userID string) error {
	if !actor.IsTenantAdmin {
		return forbidden("only a Tenant Admin can assign project membership")
	}
	if err := s.store.ProjectMembers.RemoveMember(ctx, projectID, userID); err != nil {
		return err
	}
	s.audit(ctx, "remove_member", "project", projectID)
	return nil
}

func (s *Service) SetProjectTeamRole(ctx context.Context, actor domain.Actor, projectID, teamID, roleID string) error {
	if !actor.IsTenantAdmin {
		return forbidden("only a Tenant Admin can assign project membership")
	}
	if _, err := s.store.Roles.Get(ctx, roleID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return invalid("roleId does not reference an existing role")
		}
		return err
	}
	if err := s.store.ProjectMembers.SetTeamRole(ctx, projectID, teamID, roleID); err != nil {
		return err
	}
	s.audit(ctx, "set_team_role", "project", projectID)
	return nil
}

func (s *Service) RemoveProjectTeamRole(ctx context.Context, actor domain.Actor, projectID, teamID string) error {
	if !actor.IsTenantAdmin {
		return forbidden("only a Tenant Admin can assign project membership")
	}
	if err := s.store.ProjectMembers.RemoveTeamRole(ctx, projectID, teamID); err != nil {
		return err
	}
	s.audit(ctx, "remove_team_role", "project", projectID)
	return nil
}

func (s *Service) ProjectMembership(ctx context.Context, projectID string) (domain.ProjectMembership, error) {
	return s.store.ProjectMembers.Membership(ctx, projectID)
}
