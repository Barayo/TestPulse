package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

func TestNonTenantAdminCannotManageTeams(t *testing.T) {
	s := testService(t)
	member := actorFor(mustCreateUser(t, s, "member@example.com", "correcthorse", false))
	ctx := context.Background()

	var ferr *service.ForbiddenError
	if _, err := s.CreateTeam(ctx, member, "QA Core"); !asForbidden(err, &ferr) {
		t.Errorf("CreateTeam err = %v, want ForbiddenError", err)
	}
	if _, err := s.RenameTeam(ctx, member, "team-1", "New Name"); !asForbidden(err, &ferr) {
		t.Errorf("RenameTeam err = %v, want ForbiddenError", err)
	}
	if err := s.DeleteTeam(ctx, member, "team-1"); !asForbidden(err, &ferr) {
		t.Errorf("DeleteTeam err = %v, want ForbiddenError", err)
	}
	if _, err := s.AddTeamMember(ctx, member, "team-1", "user-1"); !asForbidden(err, &ferr) {
		t.Errorf("AddTeamMember err = %v, want ForbiddenError", err)
	}
	if _, err := s.RemoveTeamMember(ctx, member, "team-1", "user-1"); !asForbidden(err, &ferr) {
		t.Errorf("RemoveTeamMember err = %v, want ForbiddenError", err)
	}
}

func TestTenantAdminManagesTeamLifecycle(t *testing.T) {
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "admin@example.com", "correcthorse", true))
	member := mustCreateUser(t, s, "member@example.com", "correcthorse", false)
	ctx := context.Background()

	team, err := s.CreateTeam(ctx, admin, "QA Core")
	if err != nil {
		t.Fatalf("CreateTeam: %v", err)
	}
	if team.Name != "QA Core" {
		t.Errorf("team = %+v", team)
	}

	team, err = s.AddTeamMember(ctx, admin, team.ID, member.ID)
	if err != nil || len(team.MemberIDs) != 1 {
		t.Fatalf("AddTeamMember: %+v, %v", team, err)
	}

	team, err = s.RenameTeam(ctx, admin, team.ID, "QA Core Team")
	if err != nil || team.Name != "QA Core Team" {
		t.Fatalf("RenameTeam: %+v, %v", team, err)
	}

	team, err = s.RemoveTeamMember(ctx, admin, team.ID, member.ID)
	if err != nil || len(team.MemberIDs) != 0 {
		t.Fatalf("RemoveTeamMember: %+v, %v", team, err)
	}

	if err := s.DeleteTeam(ctx, admin, team.ID); err != nil {
		t.Fatalf("DeleteTeam: %v", err)
	}
	teams, err := s.ListTeams(ctx)
	if err != nil || len(teams) != 0 {
		t.Errorf("ListTeams after delete = %+v, %v", teams, err)
	}
}

func TestNonTenantAdminCannotAssignProjectMembership(t *testing.T) {
	s := testService(t)
	member := actorFor(mustCreateUser(t, s, "member@example.com", "correcthorse", false))
	ctx := context.Background()

	var ferr *service.ForbiddenError
	if err := s.SetProjectMember(ctx, member, "p1", "u1", "tester"); !asForbidden(err, &ferr) {
		t.Errorf("SetProjectMember err = %v, want ForbiddenError", err)
	}
	if err := s.RemoveProjectMember(ctx, member, "p1", "u1"); !asForbidden(err, &ferr) {
		t.Errorf("RemoveProjectMember err = %v, want ForbiddenError", err)
	}
	if err := s.SetProjectTeamRole(ctx, member, "p1", "t1", "tester"); !asForbidden(err, &ferr) {
		t.Errorf("SetProjectTeamRole err = %v, want ForbiddenError", err)
	}
	if err := s.RemoveProjectTeamRole(ctx, member, "p1", "t1"); !asForbidden(err, &ferr) {
		t.Errorf("RemoveProjectTeamRole err = %v, want ForbiddenError", err)
	}
}

func TestTenantAdminAssignsProjectMembership(t *testing.T) {
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "admin@example.com", "correcthorse", true))
	member := mustCreateUser(t, s, "member@example.com", "correcthorse", false)
	ctx := context.Background()

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Project"})
	if err != nil {
		t.Fatal(err)
	}

	contributor, err := s.CreateRole(ctx, admin, domain.Role{Name: "Contributor (assign-membership-test)", CanRead: true, CanCaseCreate: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}

	if err := s.SetProjectMember(ctx, admin, project.ID, member.ID, contributor.ID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}
	perms, err := s.EffectivePermissions(ctx, domain.Actor{ID: member.ID, EffectiveUserID: member.ID}, project.ID)
	if err != nil || !perms.Has(domain.PermRead) || !perms.Has(domain.PermCaseCreate) {
		t.Fatalf("EffectivePermissions = %+v, %v; want read+caseCreate", perms, err)
	}

	m, err := s.ProjectMembership(ctx, project.ID)
	if err != nil || len(m.Users) != 1 || m.Users[0].UserID != member.ID {
		t.Fatalf("ProjectMembership = %+v, %v", m, err)
	}

	if err := s.RemoveProjectMember(ctx, admin, project.ID, member.ID); err != nil {
		t.Fatalf("RemoveProjectMember: %v", err)
	}
	if _, err := s.EffectivePermissions(ctx, domain.Actor{ID: member.ID, EffectiveUserID: member.ID}, project.ID); err == nil {
		t.Error("member still has effective permissions after removal")
	}
}

func TestTenantAdminUpdatesAndDeletesRole(t *testing.T) {
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "admin@example.com", "correcthorse", true))
	ctx := context.Background()

	role, err := s.CreateRole(ctx, admin, domain.Role{Name: "Reviewer (update-delete-test)", CanRead: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}

	role.Name = "Senior Reviewer (update-delete-test)"
	role.CanCaseCreate = true
	updated, err := s.UpdateRole(ctx, admin, role)
	if err != nil {
		t.Fatalf("UpdateRole: %v", err)
	}
	if updated.Name != "Senior Reviewer (update-delete-test)" || !updated.CanCaseCreate {
		t.Errorf("UpdateRole = %+v, want renamed with CanCaseCreate", updated)
	}

	if err := s.DeleteRole(ctx, admin, updated.ID); err != nil {
		t.Fatalf("DeleteRole: %v", err)
	}
	roles, err := s.ListRoles(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range roles {
		if r.ID == updated.ID {
			t.Errorf("role %q still present after DeleteRole", r.Name)
		}
	}
}

func TestNonTenantAdminCannotUpdateOrDeleteRole(t *testing.T) {
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "admin@example.com", "correcthorse", true))
	member := actorFor(mustCreateUser(t, s, "member@example.com", "correcthorse", false))
	ctx := context.Background()

	role, err := s.CreateRole(ctx, admin, domain.Role{Name: "Reviewer (forbidden-test)", CanRead: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}

	var ferr *service.ForbiddenError
	if _, err := s.UpdateRole(ctx, member, role); !asForbidden(err, &ferr) {
		t.Errorf("UpdateRole err = %v, want ForbiddenError", err)
	}
	if err := s.DeleteRole(ctx, member, role.ID); !asForbidden(err, &ferr) {
		t.Errorf("DeleteRole err = %v, want ForbiddenError", err)
	}
}

func TestResetRolesToDefaultsRestoresFactoryFlagsInPlace(t *testing.T) {
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "admin@example.com", "correcthorse", true))
	member := mustCreateUser(t, s, "member@example.com", "correcthorse", false)
	ctx := context.Background()

	roles, err := s.ListRoles(ctx)
	if err != nil {
		t.Fatal(err)
	}
	var contributor domain.Role
	for _, r := range roles {
		if r.Name == "Contributor" {
			contributor = r
		}
	}
	if contributor.ID == "" {
		t.Fatal("seeded Contributor role not found")
	}

	// A project member assigned the seeded Contributor role, to prove the
	// assignment survives the reset (same role id — design.md D12).
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Reset Test Project"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetProjectMember(ctx, admin, project.ID, member.ID, contributor.ID); err != nil {
		t.Fatal(err)
	}

	// Tenant Admin customizes Contributor to also grant manageProject.
	contributor.CanManageProject = true
	if _, err := s.UpdateRole(ctx, admin, contributor); err != nil {
		t.Fatalf("UpdateRole: %v", err)
	}

	reset, err := s.ResetRolesToDefaults(ctx, admin)
	if err != nil {
		t.Fatalf("ResetRolesToDefaults: %v", err)
	}

	var resetContributor domain.Role
	for _, r := range reset {
		if r.Name == "Contributor" {
			resetContributor = r
		}
	}
	if resetContributor.ID != contributor.ID {
		t.Errorf("Contributor id changed: %s -> %s, want same id (in-place restore)", contributor.ID, resetContributor.ID)
	}
	if resetContributor.CanManageProject {
		t.Error("Contributor still has the custom manageProject flag after reset, want factory default (false)")
	}
	if !resetContributor.CanCaseCreate {
		t.Error("Contributor lost its factory caseCreate flag after reset")
	}

	// The member's assignment (by role id) still resolves — reset restores
	// the role's flags in place, it does not delete/recreate the row.
	perms, err := s.EffectivePermissions(ctx, domain.Actor{ID: member.ID, EffectiveUserID: member.ID}, project.ID)
	if err != nil || !perms.Has(domain.PermCaseCreate) {
		t.Errorf("member's Contributor assignment did not survive reset: %+v, %v", perms, err)
	}
}

func TestResetRolesToDefaultsLeavesCustomRolesAndAssignmentsUntouched(t *testing.T) {
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "admin@example.com", "correcthorse", true))
	member := mustCreateUser(t, s, "member@example.com", "correcthorse", false)
	ctx := context.Background()

	custom, err := s.CreateRole(ctx, admin, domain.Role{Name: "QA Lead (reset-untouched-test)", CanRead: true, CanManageProject: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Custom Role Project"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetProjectMember(ctx, admin, project.ID, member.ID, custom.ID); err != nil {
		t.Fatal(err)
	}

	if _, err := s.ResetRolesToDefaults(ctx, admin); err != nil {
		t.Fatalf("ResetRolesToDefaults: %v", err)
	}

	roles, err := s.ListRoles(ctx)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, r := range roles {
		if r.ID == custom.ID {
			found = true
			if !r.CanManageProject {
				t.Error("custom role's flags were altered by reset")
			}
		}
	}
	if !found {
		t.Error("custom role was removed by reset, want untouched")
	}

	perms, err := s.EffectivePermissions(ctx, domain.Actor{ID: member.ID, EffectiveUserID: member.ID}, project.ID)
	if err != nil || !perms.Has(domain.PermManageProject) {
		t.Errorf("member's custom-role assignment did not survive reset: %+v, %v", perms, err)
	}
}

func TestNonTenantAdminCannotResetRolesToDefaults(t *testing.T) {
	s := testService(t)
	member := actorFor(mustCreateUser(t, s, "member@example.com", "correcthorse", false))
	ctx := context.Background()

	var ferr *service.ForbiddenError
	if _, err := s.ResetRolesToDefaults(ctx, member); !asForbidden(err, &ferr) {
		t.Errorf("ResetRolesToDefaults err = %v, want ForbiddenError", err)
	}
}

func TestSetProjectMemberValidatesRole(t *testing.T) {
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "admin@example.com", "correcthorse", true))
	ctx := context.Background()

	err := s.SetProjectMember(ctx, admin, "p1", "u1", "00000000-0000-0000-0000-000000000000")
	var verr *service.ValidationError
	if err == nil || !errors.As(err, &verr) {
		t.Fatalf("err = %v, want ValidationError", err)
	}
}
