package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// --- Teams ---

func TestTeamCreateGetRenameDelete(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	team, err := s.Teams.Create(ctx, "QA Core")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if team.Name != "QA Core" || len(team.MemberIDs) != 0 {
		t.Errorf("team = %+v", team)
	}

	if err := s.Teams.Rename(ctx, team.ID, "QA Core Team"); err != nil {
		t.Fatalf("Rename: %v", err)
	}
	got, err := s.Teams.Get(ctx, team.ID)
	if err != nil || got.Name != "QA Core Team" {
		t.Fatalf("Get after rename = %+v, %v", got, err)
	}

	if err := s.Teams.Delete(ctx, team.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Teams.Get(ctx, team.ID); err != store.ErrNotFound {
		t.Errorf("Get after delete = %v, want ErrNotFound", err)
	}
}

func TestTeamAddRemoveMember(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "member1@example.com", false)
	team, _ := s.Teams.Create(ctx, "QA Core")

	if err := s.Teams.AddMember(ctx, team.ID, u.ID); err != nil {
		t.Fatalf("AddMember: %v", err)
	}
	got, err := s.Teams.Get(ctx, team.ID)
	if err != nil || len(got.MemberIDs) != 1 || got.MemberIDs[0] != u.ID {
		t.Fatalf("Get after AddMember = %+v, %v", got, err)
	}

	if err := s.Teams.RemoveMember(ctx, team.ID, u.ID); err != nil {
		t.Fatalf("RemoveMember: %v", err)
	}
	got, _ = s.Teams.Get(ctx, team.ID)
	if len(got.MemberIDs) != 0 {
		t.Errorf("member still present after RemoveMember: %+v", got.MemberIDs)
	}
}

func TestTeamList(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Teams.Create(ctx, "Team A"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Teams.Create(ctx, "Team B"); err != nil {
		t.Fatal(err)
	}
	list, err := s.Teams.List(ctx)
	if err != nil || len(list) != 2 {
		t.Fatalf("List = %d, %v; want 2", len(list), err)
	}
}

// TestTeamReferenceCounts covers add-team-deletion-preview task 1.1: the
// deletion-preview endpoint needs a cheap, DB-side count of a team's members
// and the distinct projects it holds a role on.
func TestTeamReferenceCounts(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	team, err := s.Teams.Create(ctx, "Ref Team")
	if err != nil {
		t.Fatalf("Teams.Create: %v", err)
	}

	memberCount, projectCount, err := s.Teams.TeamReferenceCounts(ctx, team.ID)
	if err != nil {
		t.Fatalf("TeamReferenceCounts (none yet): %v", err)
	}
	if memberCount != 0 || projectCount != 0 {
		t.Errorf("counts = %d/%d, want both zero before any membership or assignment", memberCount, projectCount)
	}

	u1 := mustUser(t, s, "team-ref-user1@example.com", false)
	u2 := mustUser(t, s, "team-ref-user2@example.com", false)
	if err := s.Teams.AddMember(ctx, team.ID, u1.ID); err != nil {
		t.Fatalf("AddMember u1: %v", err)
	}
	if err := s.Teams.AddMember(ctx, team.ID, u2.ID); err != nil {
		t.Fatalf("AddMember u2: %v", err)
	}
	role := mustRole(t, s, domain.Role{Name: "Team Ref Role", CanRead: true})
	p1 := mustProject(t, s)
	p2 := mustProject(t, s)
	if err := s.ProjectMembers.SetTeamRole(ctx, p1.ID, team.ID, role.ID); err != nil {
		t.Fatalf("SetTeamRole p1: %v", err)
	}
	if err := s.ProjectMembers.SetTeamRole(ctx, p2.ID, team.ID, role.ID); err != nil {
		t.Fatalf("SetTeamRole p2: %v", err)
	}

	memberCount, projectCount, err = s.Teams.TeamReferenceCounts(ctx, team.ID)
	if err != nil {
		t.Fatalf("TeamReferenceCounts: %v", err)
	}
	if memberCount != 2 {
		t.Errorf("memberCount = %d, want 2", memberCount)
	}
	if projectCount != 2 {
		t.Errorf("projectCount = %d, want 2", projectCount)
	}
}

// --- Roles ---

func mustRole(t *testing.T, s *store.Store, role domain.Role) domain.Role {
	t.Helper()
	created, err := s.Roles.Create(context.Background(), role)
	if err != nil {
		t.Fatalf("create role %s: %v", role.Name, err)
	}
	return created
}

func TestRoleCreateGetUpdateDelete(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	role := mustRole(t, s, domain.Role{Name: "Reviewer", Rank: 5, CanRead: true, CanCaseCreate: true, CanSectionEdit: true})
	if role.Name != "Reviewer" || !role.CanRead || !role.CanCaseCreate || role.CanCaseDelete || !role.CanSectionEdit {
		t.Errorf("role = %+v", role)
	}

	role.Name = "Senior Reviewer"
	role.CanCaseDelete = true
	role.CanSectionEdit = false
	updated, err := s.Roles.Update(ctx, role)
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != "Senior Reviewer" || !updated.CanCaseDelete || updated.CanSectionEdit {
		t.Errorf("updated = %+v", updated)
	}

	if err := s.Roles.Delete(ctx, role.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Roles.Get(ctx, role.ID); err != store.ErrNotFound {
		t.Errorf("Get after delete = %v, want ErrNotFound", err)
	}
}

func TestRoleList(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	mustRole(t, s, domain.Role{Name: "Role A", Rank: 1})
	mustRole(t, s, domain.Role{Name: "Role B", Rank: 2})

	list, err := s.Roles.List(ctx)
	if err != nil || len(list) < 2 {
		t.Fatalf("List = %d, %v; want at least 2", len(list), err)
	}
}

// TestDirectProjectCountForUser covers add-user-deletion task 4.1: the
// deletion-preview endpoint needs a cheap, DB-side count of a user's direct
// project memberships (never a client-side fan-out over every project).
func TestDirectProjectCountForUser(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "counted@example.com", false)
	role := mustRole(t, s, domain.Role{Name: "Counter Role", CanRead: true})

	count, err := s.ProjectMembers.DirectProjectCountForUser(ctx, u.ID)
	if err != nil {
		t.Fatalf("DirectProjectCountForUser (none yet): %v", err)
	}
	if count != 0 {
		t.Errorf("count = %d, want 0 before any membership", count)
	}

	p1 := mustProject(t, s)
	p2 := mustProject(t, s)
	if err := s.ProjectMembers.SetMember(ctx, p1.ID, u.ID, role.ID); err != nil {
		t.Fatalf("SetMember p1: %v", err)
	}
	if err := s.ProjectMembers.SetMember(ctx, p2.ID, u.ID, role.ID); err != nil {
		t.Fatalf("SetMember p2: %v", err)
	}

	count, err = s.ProjectMembers.DirectProjectCountForUser(ctx, u.ID)
	if err != nil {
		t.Fatalf("DirectProjectCountForUser: %v", err)
	}
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}
}

// TestRoleReferenceCounts covers redesign-admin-shell task 1.1: the
// deletion-preview endpoint needs a cheap, DB-side count of a role's direct
// user assignments, team assignments, and distinct projects touched.
func TestRoleReferenceCounts(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	role := mustRole(t, s, domain.Role{Name: "Counted Role", CanRead: true})

	directUsers, teams, projects, err := s.Roles.ReferenceCounts(ctx, role.ID)
	if err != nil {
		t.Fatalf("ReferenceCounts (none yet): %v", err)
	}
	if directUsers != 0 || teams != 0 || projects != 0 {
		t.Errorf("counts = %d/%d/%d, want all zero before any assignment", directUsers, teams, projects)
	}

	u := mustUser(t, s, "role-ref-user@example.com", false)
	p1 := mustProject(t, s)
	p2 := mustProject(t, s)
	if err := s.ProjectMembers.SetMember(ctx, p1.ID, u.ID, role.ID); err != nil {
		t.Fatalf("SetMember: %v", err)
	}
	team, err := s.Teams.Create(ctx, "Ref Team")
	if err != nil {
		t.Fatalf("Teams.Create: %v", err)
	}
	if err := s.ProjectMembers.SetTeamRole(ctx, p2.ID, team.ID, role.ID); err != nil {
		t.Fatalf("SetTeamRole: %v", err)
	}

	directUsers, teams, projects, err = s.Roles.ReferenceCounts(ctx, role.ID)
	if err != nil {
		t.Fatalf("ReferenceCounts: %v", err)
	}
	if directUsers != 1 {
		t.Errorf("directUsers = %d, want 1", directUsers)
	}
	if teams != 1 {
		t.Errorf("teams = %d, want 1", teams)
	}
	if projects != 2 {
		t.Errorf("projects = %d, want 2 (one via direct membership, one via team)", projects)
	}
}

// --- Project members / effective permission resolution ---

func TestEffectivePermissionsNoMembershipIsNotFound(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "outsider@example.com", false)
	p := mustProject(t, s)

	if _, err := s.ProjectMembers.EffectivePermissions(ctx, u.ID, p.ID); err != store.ErrNotFound {
		t.Errorf("EffectivePermissions = %v, want ErrNotFound", err)
	}
}

func TestEffectivePermissionsDirectAssignment(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "direct@example.com", false)
	p := mustProject(t, s)
	contributor := mustRole(t, s, domain.Role{Name: "Contributor A", CanRead: true, CanRunCreate: true, CanRunRecordResult: true, CanCaseCreate: true})

	if err := s.ProjectMembers.SetMember(ctx, p.ID, u.ID, contributor.ID); err != nil {
		t.Fatalf("SetMember: %v", err)
	}
	perms, err := s.ProjectMembers.EffectivePermissions(ctx, u.ID, p.ID)
	if err != nil || !perms.Read || !perms.RunCreate || !perms.RunRecordResult || !perms.CaseCreate || perms.CaseDelete {
		t.Errorf("EffectivePermissions = %+v, %v; want read+runCreate+runRecordResult+caseCreate only", perms, err)
	}
}

// TestEffectivePermissionsRunDeleteAndProjectDelete covers add-data-retention
// design.md D3: the two new flags round-trip through Create and are
// visible in the resolved bool_or() union, same as every other flag.
func TestEffectivePermissionsRunDeleteAndProjectDelete(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "deleter@example.com", false)
	p := mustProject(t, s)
	projectAdmin := mustRole(t, s, domain.Role{Name: "Project Admin B", CanRead: true, CanRunDelete: true, CanProjectDelete: true})

	if err := s.ProjectMembers.SetMember(ctx, p.ID, u.ID, projectAdmin.ID); err != nil {
		t.Fatalf("SetMember: %v", err)
	}
	perms, err := s.ProjectMembers.EffectivePermissions(ctx, u.ID, p.ID)
	if err != nil || !perms.RunDelete || !perms.ProjectDelete {
		t.Errorf("EffectivePermissions = %+v, %v; want runDelete+projectDelete", perms, err)
	}
}

func TestEffectivePermissionsViaTeam(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "viateam@example.com", false)
	p := mustProject(t, s)
	team, _ := s.Teams.Create(ctx, "Testers")
	if err := s.Teams.AddMember(ctx, team.ID, u.ID); err != nil {
		t.Fatal(err)
	}
	tester := mustRole(t, s, domain.Role{Name: "Tester A", CanRead: true, CanRunCreate: true, CanRunRecordResult: true})
	if err := s.ProjectMembers.SetTeamRole(ctx, p.ID, team.ID, tester.ID); err != nil {
		t.Fatalf("SetTeamRole: %v", err)
	}

	perms, err := s.ProjectMembers.EffectivePermissions(ctx, u.ID, p.ID)
	if err != nil || !perms.Read || !perms.RunCreate || !perms.RunRecordResult || perms.CaseCreate {
		t.Errorf("EffectivePermissions = %+v, %v; want read+runCreate+runRecordResult only", perms, err)
	}
}

func TestEffectivePermissionsDirectAndTeamUnion(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "both@example.com", false)
	p := mustProject(t, s)
	team, _ := s.Teams.Create(ctx, "Admins")
	if err := s.Teams.AddMember(ctx, team.ID, u.ID); err != nil {
		t.Fatal(err)
	}

	// Two non-nested roles: one grants caseDelete but not caseCreate, the
	// other caseCreate but not caseDelete — the union must include both
	// (design.md D10/D11).
	deleteOnly := mustRole(t, s, domain.Role{Name: "Delete Only", CanRead: true, CanCaseDelete: true})
	createOnly := mustRole(t, s, domain.Role{Name: "Create Only", CanRead: true, CanCaseCreate: true})
	if err := s.ProjectMembers.SetMember(ctx, p.ID, u.ID, deleteOnly.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.ProjectMembers.SetTeamRole(ctx, p.ID, team.ID, createOnly.ID); err != nil {
		t.Fatal(err)
	}

	perms, err := s.ProjectMembers.EffectivePermissions(ctx, u.ID, p.ID)
	if err != nil || !perms.CaseDelete || !perms.CaseCreate {
		t.Errorf("EffectivePermissions = %+v, %v; want both caseDelete and caseCreate present (union)", perms, err)
	}
}

func TestEffectivePermissionsLostWhenTeamDeleted(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "teamonly@example.com", false)
	p := mustProject(t, s)
	team, _ := s.Teams.Create(ctx, "Temp")
	if err := s.Teams.AddMember(ctx, team.ID, u.ID); err != nil {
		t.Fatal(err)
	}
	role := mustRole(t, s, domain.Role{Name: "Temp Role", CanRead: true, CanCaseCreate: true})
	if err := s.ProjectMembers.SetTeamRole(ctx, p.ID, team.ID, role.ID); err != nil {
		t.Fatal(err)
	}

	if err := s.Teams.Delete(ctx, team.ID); err != nil {
		t.Fatalf("Delete team: %v", err)
	}
	if _, err := s.ProjectMembers.EffectivePermissions(ctx, u.ID, p.ID); err != store.ErrNotFound {
		t.Errorf("EffectivePermissions after team delete = %v, want ErrNotFound", err)
	}
}

func TestEffectivePermissionsLostWhenRoleDeleted(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "roledeleted@example.com", false)
	p := mustProject(t, s)
	role := mustRole(t, s, domain.Role{Name: "Ephemeral Role", CanRead: true})
	if err := s.ProjectMembers.SetMember(ctx, p.ID, u.ID, role.ID); err != nil {
		t.Fatal(err)
	}

	if err := s.Roles.Delete(ctx, role.ID); err != nil {
		t.Fatalf("Delete role: %v", err)
	}
	if _, err := s.ProjectMembers.EffectivePermissions(ctx, u.ID, p.ID); err != store.ErrNotFound {
		t.Errorf("EffectivePermissions after role delete = %v, want ErrNotFound", err)
	}
}

func TestProjectMembershipListing(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "listed@example.com", false)
	p := mustProject(t, s)
	team, _ := s.Teams.Create(ctx, "Listed Team")
	tester := mustRole(t, s, domain.Role{Name: "Tester B", CanRead: true})
	contributor := mustRole(t, s, domain.Role{Name: "Contributor B", CanRead: true, CanCaseCreate: true})

	if err := s.ProjectMembers.SetMember(ctx, p.ID, u.ID, tester.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.ProjectMembers.SetTeamRole(ctx, p.ID, team.ID, contributor.ID); err != nil {
		t.Fatal(err)
	}

	m, err := s.ProjectMembers.Membership(ctx, p.ID)
	if err != nil {
		t.Fatalf("Membership: %v", err)
	}
	if len(m.Users) != 1 || m.Users[0].UserID != u.ID || m.Users[0].RoleID != tester.ID {
		t.Errorf("Users = %+v", m.Users)
	}
	if len(m.Teams) != 1 || m.Teams[0].TeamID != team.ID || m.Teams[0].RoleID != contributor.ID {
		t.Errorf("Teams = %+v", m.Teams)
	}
}

func TestProjectMemberRemove(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "removable@example.com", false)
	p := mustProject(t, s)
	role := mustRole(t, s, domain.Role{Name: "Removable Role", CanRead: true})

	if err := s.ProjectMembers.SetMember(ctx, p.ID, u.ID, role.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.ProjectMembers.RemoveMember(ctx, p.ID, u.ID); err != nil {
		t.Fatalf("RemoveMember: %v", err)
	}
	if _, err := s.ProjectMembers.EffectivePermissions(ctx, u.ID, p.ID); err != store.ErrNotFound {
		t.Errorf("EffectivePermissions after removal = %v, want ErrNotFound", err)
	}
}

// --- Project-ID resolvers (task 3.3) ---

func TestProjectIDResolvers(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatal(err)
	}
	run, err := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	if err != nil {
		t.Fatal(err)
	}
	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatal(err)
	}
	root, err := s.Folders.Root(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}

	if got, err := s.Cases.ProjectID(ctx, c.ID); err != nil || got != p.ID {
		t.Errorf("Cases.ProjectID = %q, %v; want %q", got, err, p.ID)
	}
	if got, err := s.Suites.ProjectID(ctx, suite.ID); err != nil || got != p.ID {
		t.Errorf("Suites.ProjectID = %q, %v; want %q", got, err, p.ID)
	}
	if got, err := s.Runs.ProjectID(ctx, run.ID); err != nil || got != p.ID {
		t.Errorf("Runs.ProjectID = %q, %v; want %q", got, err, p.ID)
	}
	if got, err := s.Runs.ItemProjectID(ctx, items[0].ID); err != nil || got != p.ID {
		t.Errorf("Runs.ItemProjectID = %q, %v; want %q", got, err, p.ID)
	}
	if got, err := s.Folders.ProjectID(ctx, root.ID); err != nil || got != p.ID {
		t.Errorf("Folders.ProjectID = %q, %v; want %q", got, err, p.ID)
	}
}

// --- Projects.ListForMember (task 3.5) ---

func TestProjectsListForMember(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "scoped@example.com", false)

	memberProject, err := s.Projects.Create(ctx, "Member Project", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Projects.Create(ctx, "Other Project", ""); err != nil {
		t.Fatal(err)
	}
	tester := mustRole(t, s, domain.Role{Name: "Tester (list-for-member)", CanRead: true})
	if err := s.ProjectMembers.SetMember(ctx, memberProject.ID, u.ID, tester.ID); err != nil {
		t.Fatal(err)
	}

	list, err := s.Projects.ListForMember(ctx, u.ID)
	if err != nil {
		t.Fatalf("ListForMember: %v", err)
	}
	if len(list) != 1 || list[0].ID != memberProject.ID {
		t.Errorf("ListForMember = %+v, want only %q", list, memberProject.ID)
	}
}

func TestProjectsListForMemberViaTeam(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "teammember@example.com", false)
	team, _ := s.Teams.Create(ctx, "Via Team")
	if err := s.Teams.AddMember(ctx, team.ID, u.ID); err != nil {
		t.Fatal(err)
	}
	p, err := s.Projects.Create(ctx, "Team Project", "")
	if err != nil {
		t.Fatal(err)
	}
	contributor := mustRole(t, s, domain.Role{Name: "Contributor (list-for-member-via-team)", CanRead: true, CanCaseCreate: true})
	if err := s.ProjectMembers.SetTeamRole(ctx, p.ID, team.ID, contributor.ID); err != nil {
		t.Fatal(err)
	}

	list, err := s.Projects.ListForMember(ctx, u.ID)
	if err != nil || len(list) != 1 || list[0].ID != p.ID {
		t.Errorf("ListForMember = %+v, %v; want only %q", list, err, p.ID)
	}
}
