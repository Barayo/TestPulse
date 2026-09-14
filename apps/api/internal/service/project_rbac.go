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

// scopedProjectPermissions returns actor's permissions restricted to a
// single project, honoring a scoped agent token's own
// ScopedProjectID/ScopedPermissions before ever falling back to
// EffectivePermissions — which resolves via actor.EffectiveUserID, the
// token *creator's* own id, not the token's own scope. isScoped is true
// whenever actor is a scoped agent token at all, whether or not projectID
// matches its scope, so callers never fall through to EffectivePermissions
// (the creator's broader access) for a scoped token by mistake. This is
// the exact check every enforcement path in this codebase must run first
// (see requirePermission, server/middleware.go) — a shared helper closes
// the recurring bug shape where a new call site (checkAssigneeRestriction,
// MyPermissions) called EffectivePermissions directly and skipped it (#177).
func scopedProjectPermissions(actor domain.Actor, projectID string) (perms domain.Permissions, isScoped bool) {
	if actor.ScopedProjectID == nil {
		return domain.Permissions{}, false
	}
	if *actor.ScopedProjectID != projectID {
		return domain.Permissions{}, true
	}
	return *actor.ScopedPermissions, true
}

// Authorize enforces perm on projectID for ctx's Actor, mirroring
// requirePermission's REST enforcement (server/middleware.go) exactly —
// Tenant Admin bypass, then a scoped agent token's own
// ScopedProjectID/ScopedPermissions, then EffectivePermissions for
// everyone else. Used by callers that sit outside chi's per-route
// middleware: the MCP tool layer (add-mcp-server) handles every operation
// through one JSON-RPC endpoint instead of per-resource routes, so each
// tool calls this itself before delegating to a service method — the same
// way every REST route calls requirePermission before its handler.
func (s *Service) Authorize(ctx context.Context, perm domain.Permission, projectID string) error {
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return unauthorized("authentication required")
	}
	if actor.IsTenantAdmin {
		return nil
	}
	if perms, ok := scopedProjectPermissions(actor, projectID); ok {
		if !perms.Has(perm) {
			return forbidden("insufficient permissions")
		}
		return nil
	}
	perms, err := s.EffectivePermissions(ctx, actor, projectID)
	if err != nil || !perms.Has(perm) {
		return forbidden("insufficient permissions")
	}
	return nil
}

// AccessibleProjects returns every project ctx's Actor may read: a Tenant
// Admin sees all, a project-scoped agent token sees only its one scoped
// project (never the creator's broader access), everyone else sees their
// membership set via ListProjects. Backs the MCP list_projects and search
// tools (add-mcp-server) — REST's own GET /projects has no equivalent
// scoped-token narrowing today (it predates scoped tokens' project-only
// intent), so this is deliberately new, MCP-specific logic rather than a
// change to ListProjects' existing REST-facing behavior.
func (s *Service) AccessibleProjects(ctx context.Context) ([]domain.Project, error) {
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return nil, unauthorized("authentication required")
	}
	if actor.ScopedProjectID != nil {
		p, err := s.GetProject(ctx, *actor.ScopedProjectID)
		if err != nil {
			return nil, err
		}
		return []domain.Project{p}, nil
	}
	return s.ListProjects(ctx)
}

// AccessibleProjectIDs is AccessibleProjects, mapped to ids — the form
// Search needs.
func (s *Service) AccessibleProjectIDs(ctx context.Context) ([]string, error) {
	projects, err := s.AccessibleProjects(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(projects))
	for i, p := range projects {
		ids[i] = p.ID
	}
	return ids, nil
}

// MyPermissions is EffectivePermissions with the Tenant Admin bypass
// applied and "no membership" turned into an ordinary all-false result
// instead of an error — built for the frontend to ask "what can I do here"
// so it can hide permission-gated controls entirely rather than just
// disabling them (add-delete-mode).
func (s *Service) MyPermissions(ctx context.Context, actor domain.Actor, projectID string) (domain.Permissions, error) {
	if actor.IsTenantAdmin {
		return domain.Permissions{
			Read: true, CaseCreate: true, CaseEdit: true, CaseDelete: true,
			SectionCreate: true, SectionEdit: true, SectionDelete: true, SuiteCreate: true, SuiteEditMembership: true,
			RunCreate: true, RunRecordResult: true, ManageProject: true,
			RunDelete: true, ProjectDelete: true,
		}, nil
	}
	if perms, ok := scopedProjectPermissions(actor, projectID); ok {
		return perms, nil
	}
	perms, err := s.EffectivePermissions(ctx, actor, projectID)
	if errors.Is(err, store.ErrNotFound) {
		return domain.Permissions{}, nil
	}
	return perms, err
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

// ListRolesPage is ListRoles, cursor-paginated (add-cursor-pagination) —
// backs GET /roles. ListRoles itself is untouched and keeps serving
// ResetRolesToDefaults, which needs the complete set.
func (s *Service) ListRolesPage(ctx context.Context, cursor string, limit int) ([]domain.Role, string, error) {
	return s.store.Roles.ListPage(ctx, cursor, limit)
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

// RoleDeletionPreview returns real reference counts for the delete-role
// confirmation dialog (redesign-admin-shell), mirroring the pattern
// UserDeletionPreview already established.
func (s *Service) RoleDeletionPreview(ctx context.Context, actor domain.Actor, roleID string) (domain.RoleDeletionPreview, error) {
	if !actor.IsTenantAdmin {
		return domain.RoleDeletionPreview{}, forbidden("only a Tenant Admin can manage roles")
	}
	directUsers, teams, projects, err := s.store.Roles.ReferenceCounts(ctx, roleID)
	if err != nil {
		return domain.RoleDeletionPreview{}, err
	}
	return domain.RoleDeletionPreview{DirectUserCount: directUsers, TeamCount: teams, ProjectCount: projects}, nil
}

// defaultRoles mirrors the seed data in the baseline migration exactly —
// keep both in sync. Used by ResetRolesToDefaults below.
var defaultRoles = []domain.Role{
	{Name: "Tester", Rank: 1, CanRead: true, CanRunCreate: true, CanRunRecordResult: true},
	{
		Name: "Contributor", Rank: 2, CanRead: true,
		CanCaseCreate: true, CanCaseEdit: true, CanSectionCreate: true, CanSectionEdit: true, CanSuiteCreate: true, CanSuiteEditMembership: true,
		CanRunCreate: true, CanRunRecordResult: true,
	},
	{
		Name: "Project Admin", Rank: 3, CanRead: true,
		CanCaseCreate: true, CanCaseEdit: true, CanCaseDelete: true, CanSectionCreate: true, CanSectionEdit: true, CanSectionDelete: true,
		CanSuiteCreate: true, CanSuiteEditMembership: true, CanRunCreate: true, CanRunRecordResult: true, CanManageProject: true,
		CanRunDelete: true, CanProjectDelete: true,
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

func (s *Service) ProjectIDForResult(ctx context.Context, resultID string) (string, error) {
	return s.store.Runs.ResultProjectID(ctx, resultID)
}

func (s *Service) ProjectIDForAttachment(ctx context.Context, attachmentID string) (string, error) {
	return s.store.Attachments.ProjectID(ctx, attachmentID)
}

func (s *Service) ProjectIDForCustomField(ctx context.Context, fieldID string) (string, error) {
	return s.store.CustomFields.ProjectID(ctx, fieldID)
}

func (s *Service) ProjectIDForRelease(ctx context.Context, releaseID string) (string, error) {
	return s.store.Releases.ProjectID(ctx, releaseID)
}

func (s *Service) ProjectIDForTestPlan(ctx context.Context, testPlanID string) (string, error) {
	return s.store.TestPlans.ProjectID(ctx, testPlanID)
}

func (s *Service) ProjectIDForRequirement(ctx context.Context, requirementID string) (string, error) {
	return s.store.Requirements.ProjectID(ctx, requirementID)
}

func (s *Service) ProjectIDForImportJob(ctx context.Context, jobID string) (string, error) {
	return s.store.ImportJobs.ProjectID(ctx, jobID)
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

// CaseIDsByKeys resolves every one of keys to its internal id in one
// batched store call rather than one round trip per key (#180). Order and
// length match keys exactly; a key with no matching case returns
// ErrNotFound, the same as a single CaseIDByKey miss would.
func (s *Service) CaseIDsByKeys(ctx context.Context, keys []string) ([]string, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	byKey, err := s.store.Cases.IDsByKeys(ctx, keys)
	if err != nil {
		return nil, err
	}
	ids := make([]string, len(keys))
	for i, key := range keys {
		id, ok := byKey[key]
		if !ok {
			return nil, store.ErrNotFound
		}
		ids[i] = id
	}
	return ids, nil
}

func (s *Service) RunIDByKey(ctx context.Context, key string) (string, error) {
	return s.store.Runs.IDByKey(ctx, key)
}

func (s *Service) SuiteIDByKey(ctx context.Context, key string) (string, error) {
	return s.store.Suites.IDByKey(ctx, key)
}

func (s *Service) ReleaseIDByKey(ctx context.Context, key string) (string, error) {
	return s.store.Releases.IDByKey(ctx, key)
}

func (s *Service) TestPlanIDByKey(ctx context.Context, key string) (string, error) {
	return s.store.TestPlans.IDByKey(ctx, key)
}

func (s *Service) RequirementIDByKey(ctx context.Context, key string) (string, error) {
	return s.store.Requirements.IDByKey(ctx, key)
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

// ListTeamsPage is ListTeams, cursor-paginated (add-cursor-pagination) —
// backs GET /teams. ListTeams itself is untouched.
func (s *Service) ListTeamsPage(ctx context.Context, cursor string, limit int) ([]domain.Team, string, error) {
	return s.store.Teams.ListPage(ctx, cursor, limit)
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

// TeamDeletionPreview returns real reference counts for the delete-team
// confirmation dialog (add-team-deletion-preview), mirroring the pattern
// UserDeletionPreview and RoleDeletionPreview already established.
func (s *Service) TeamDeletionPreview(ctx context.Context, actor domain.Actor, teamID string) (domain.TeamDeletionPreview, error) {
	if !actor.IsTenantAdmin {
		return domain.TeamDeletionPreview{}, forbidden("only a Tenant Admin can manage teams")
	}
	members, projects, err := s.store.Teams.TeamReferenceCounts(ctx, teamID)
	if err != nil {
		return domain.TeamDeletionPreview{}, err
	}
	return domain.TeamDeletionPreview{MemberCount: members, ProjectCount: projects}, nil
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
