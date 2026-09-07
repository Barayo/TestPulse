package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func assigneeRestrictionTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "assignee_restriction_service")))
}

// assigneeRestrictionFixture is a project with assigneeRestrictedRecording
// enabled and one unassigned run item, plus a Tenant Admin actor to arrange
// state with.
type assigneeRestrictionFixture struct {
	s       *service.Service
	ctx     context.Context
	admin   domain.Actor
	project domain.Project
	item    domain.RunItem
}

func newAssigneeRestrictionFixture(t *testing.T) assigneeRestrictionFixture {
	t.Helper()
	s := assigneeRestrictionTestService(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin@example.com", "correcthorse", true))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Owned Items"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := s.CreateCase(ctx, project.ID, "", domain.CaseContent{
		Title: "case", Steps: []domain.Step{{Action: "do it"}}, Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := s.CreateRun(ctx, project.ID, service.RunInput{Name: "r1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("RunItems: %d, %v", len(items), err)
	}

	restricted := true
	project, err = s.UpdateProject(ctx, project.ID, service.ProjectUpdate{AssigneeRestrictedRecording: &restricted})
	if err != nil {
		t.Fatalf("UpdateProject: %v", err)
	}

	return assigneeRestrictionFixture{s: s, ctx: ctx, admin: admin, project: project, item: items[0]}
}

// addProjectMember creates a user holding runRecordResult (and manageProject
// if requested) on the fixture's project, without assigning them to the item.
func (f assigneeRestrictionFixture) addProjectMember(t *testing.T, email string, manageProject bool) domain.Actor {
	t.Helper()
	user := mustCreateUser(t, f.s, email, "correcthorse", false)
	role, err := f.s.CreateRole(f.ctx, f.admin, domain.Role{
		Name: "Recorder " + email, CanRead: true, CanRunRecordResult: true, CanManageProject: manageProject,
	})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := f.s.SetProjectMember(f.ctx, f.admin, f.project.ID, user.ID, role.ID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}
	return actorFor(user)
}

func (f assigneeRestrictionFixture) assignItemTo(t *testing.T, userID string) {
	t.Helper()
	if err := f.s.UpdateItem(f.ctx, f.item.ID, service.ItemUpdate{AssigneeUserID: &userID}); err != nil {
		t.Fatalf("UpdateItem (assign): %v", err)
	}
}

func TestAssigneeRestrictedRecordingAllowsMatchingAssignee(t *testing.T) {
	f := newAssigneeRestrictionFixture(t)
	ana := f.addProjectMember(t, "ana@example.com", false)
	f.assignItemTo(t, ana.ID)
	ctx := domain.WithActor(context.Background(), ana)

	if _, err := f.s.RecordResult(ctx, f.item.ID, domain.NewResult{Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult by assignee = %v, want success", err)
	}
}

func TestAssigneeRestrictedRecordingRejectsNonAssignee(t *testing.T) {
	f := newAssigneeRestrictionFixture(t)
	ana := f.addProjectMember(t, "ana@example.com", false)
	f.assignItemTo(t, ana.ID)
	bob := f.addProjectMember(t, "bob@example.com", false)
	ctx := domain.WithActor(context.Background(), bob)

	_, err := f.s.RecordResult(ctx, f.item.ID, domain.NewResult{Verdict: domain.VerdictPass})
	var ferr *service.ForbiddenError
	if err == nil || !asForbidden(err, &ferr) {
		t.Fatalf("RecordResult by non-assignee = %v, want ForbiddenError", err)
	}
}

func TestAssigneeRestrictedRecordingAllowsManageProjectHolderRegardlessOfAssignee(t *testing.T) {
	f := newAssigneeRestrictionFixture(t)
	ana := f.addProjectMember(t, "ana@example.com", false)
	f.assignItemTo(t, ana.ID)
	pm := f.addProjectMember(t, "pm@example.com", true)
	ctx := domain.WithActor(context.Background(), pm)

	if _, err := f.s.RecordResult(ctx, f.item.ID, domain.NewResult{Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult by manageProject holder = %v, want success", err)
	}
}

func TestAssigneeRestrictedRecordingAllowsTenantAdminRegardlessOfAssignee(t *testing.T) {
	f := newAssigneeRestrictionFixture(t)
	ana := f.addProjectMember(t, "ana@example.com", false)
	f.assignItemTo(t, ana.ID)
	ctx := domain.WithActor(context.Background(), f.admin)

	if _, err := f.s.RecordResult(ctx, f.item.ID, domain.NewResult{Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult by Tenant Admin = %v, want success", err)
	}
}

func TestAssigneeRestrictedRecordingPermissiveWhenItemUnassigned(t *testing.T) {
	f := newAssigneeRestrictionFixture(t)
	carol := f.addProjectMember(t, "carol@example.com", false)
	ctx := domain.WithActor(context.Background(), carol)

	if _, err := f.s.RecordResult(ctx, f.item.ID, domain.NewResult{Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult on unassigned item = %v, want success", err)
	}
}

func TestAssigneeRestrictedRecordingIgnoresActorOverride(t *testing.T) {
	f := newAssigneeRestrictionFixture(t)
	ana := f.addProjectMember(t, "ana@example.com", false)
	f.assignItemTo(t, ana.ID)
	bob := f.addProjectMember(t, "bob@example.com", false)
	ctx := domain.WithActor(context.Background(), bob)

	// bob claims to be "ana" via the display-name override — must not bypass the real actor check.
	_, err := f.s.RecordResult(ctx, f.item.ID, domain.NewResult{Actor: "ana@example.com", Verdict: domain.VerdictPass})
	var ferr *service.ForbiddenError
	if err == nil || !asForbidden(err, &ferr) {
		t.Fatalf("RecordResult with spoofed actor override = %v, want ForbiddenError", err)
	}
}

func TestAssigneeRestrictedRecordingAppliesToUpdateItemStatus(t *testing.T) {
	f := newAssigneeRestrictionFixture(t)
	ana := f.addProjectMember(t, "ana@example.com", false)
	f.assignItemTo(t, ana.ID)
	bob := f.addProjectMember(t, "bob@example.com", false)
	ctx := domain.WithActor(context.Background(), bob)

	retest := "retest"
	err := f.s.UpdateItem(ctx, f.item.ID, service.ItemUpdate{Status: &retest})
	var ferr *service.ForbiddenError
	if err == nil || !asForbidden(err, &ferr) {
		t.Fatalf("UpdateItem status by non-assignee = %v, want ForbiddenError", err)
	}
}

func TestAssigneeRestrictedRecordingAllowsTeamMember(t *testing.T) {
	f := newAssigneeRestrictionFixture(t)
	team, err := f.s.CreateTeam(f.ctx, f.admin, "QA Core")
	if err != nil {
		t.Fatalf("CreateTeam: %v", err)
	}
	member := mustCreateUser(t, f.s, "dana@example.com", "correcthorse", false)
	if _, err := f.s.AddTeamMember(f.ctx, f.admin, team.ID, member.ID); err != nil {
		t.Fatalf("AddTeamMember: %v", err)
	}
	role, err := f.s.CreateRole(f.ctx, f.admin, domain.Role{Name: "Team Recorder", CanRead: true, CanRunRecordResult: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := f.s.SetProjectTeamRole(f.ctx, f.admin, f.project.ID, team.ID, role.ID); err != nil {
		t.Fatalf("SetProjectTeamRole: %v", err)
	}
	if err := f.s.UpdateItem(f.ctx, f.item.ID, service.ItemUpdate{AssigneeTeamID: &team.ID}); err != nil {
		t.Fatalf("UpdateItem (assign team): %v", err)
	}
	ctx := domain.WithActor(context.Background(), actorFor(member))

	if _, err := f.s.RecordResult(ctx, f.item.ID, domain.NewResult{Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult by team member = %v, want success", err)
	}
}

// #177: a scoped agent token must be evaluated on its own
// ScopedPermissions, never the creator's broader access — the same
// scoped-token-first order every other enforcement path in this codebase
// uses (Authorize, requirePermission). Before the fix, checkAssigneeRestriction
// called EffectivePermissions directly, which resolves via the token
// creator's own user id, so a CI token scoped to runRecordResult-only could
// still bypass AssigneeRestrictedRecording on items assigned to someone
// else just because its creator happened to hold manageProject.
func TestAssigneeRestrictedRecordingRejectsScopedTokenWithoutManageProject(t *testing.T) {
	f := newAssigneeRestrictionFixture(t)
	ana := f.addProjectMember(t, "ana@example.com", false)
	f.assignItemTo(t, ana.ID)

	// pm holds manageProject directly (not via Tenant Admin) and creates a
	// CI token scoped to a role granting only runRecordResult.
	pm := f.addProjectMember(t, "pm@example.com", true)
	pmCtx := domain.WithActor(context.Background(), pm)
	recorderOnly, err := f.s.CreateRole(f.ctx, f.admin, domain.Role{
		Name: "CI Recorder (scoped assignee-restriction test)", CanRead: true, CanRunRecordResult: true,
	})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	full, _, err := f.s.CreateToken(pmCtx, pm, "ci-agent", &f.project.ID, &recorderOnly.ID)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	tokenActor, err := f.s.AuthenticateToken(context.Background(), full)
	if err != nil {
		t.Fatalf("AuthenticateToken: %v", err)
	}
	ctx := domain.WithActor(context.Background(), tokenActor)

	_, err = f.s.RecordResult(ctx, f.item.ID, domain.NewResult{Verdict: domain.VerdictPass})
	var ferr *service.ForbiddenError
	if err == nil || !asForbidden(err, &ferr) {
		t.Fatalf("RecordResult by scoped token whose creator holds manageProject but whose own role doesn't = %v, want ForbiddenError", err)
	}
}

func TestAssigneeRestrictedRecordingOffPreservesCurrentBehavior(t *testing.T) {
	f := newAssigneeRestrictionFixture(t)
	ana := f.addProjectMember(t, "ana@example.com", false)
	f.assignItemTo(t, ana.ID)
	bob := f.addProjectMember(t, "bob@example.com", false)

	off := false
	if _, err := f.s.UpdateProject(f.ctx, f.project.ID, service.ProjectUpdate{AssigneeRestrictedRecording: &off}); err != nil {
		t.Fatalf("UpdateProject: %v", err)
	}
	ctx := domain.WithActor(context.Background(), bob)

	if _, err := f.s.RecordResult(ctx, f.item.ID, domain.NewResult{Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult with setting off = %v, want success", err)
	}
}
