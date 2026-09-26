package service_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func lifecycleTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "run_lifecycle_service")))
}

func mustLifecycleProject(t *testing.T, s *service.Service) domain.Project {
	t.Helper()
	p, err := s.CreateProject(context.Background(), service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	return p
}

func mustLifecycleCase(t *testing.T, s *service.Service, projectID string) domain.TestCase {
	t.Helper()
	c, err := s.CreateCase(context.Background(), projectID, "", domain.CaseContent{
		Title:    "case",
		Steps:    []domain.Step{{Action: "do it"}},
		Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	return c
}

func TestCloseRunThenReopen(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	if err := s.CloseRun(ctx, run.ID); err != nil {
		t.Fatalf("CloseRun: %v", err)
	}
	got, err := s.GetRun(ctx, run.ID)
	if err != nil || got.Status != domain.RunStatusClosed {
		t.Fatalf("after CloseRun, status = %q, %v; want closed", got.Status, err)
	}

	if err := s.ReopenRun(ctx, run.ID); err != nil {
		t.Fatalf("ReopenRun: %v", err)
	}
	got, err = s.GetRun(ctx, run.ID)
	if err != nil || got.Status != domain.RunStatusOpen {
		t.Fatalf("after ReopenRun, status = %q, %v; want open", got.Status, err)
	}
}

// TestArchiveRunAudited covers auto-archive-runs design.md D2/D3: manual
// archive sets the flag and is audited, mirroring CloseRun's own shape.
func TestArchiveRunAudited(t *testing.T) {
	s := lifecycleTestService(t)
	admin := mustCreateUser(t, s, "archiver1@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	p := mustLifecycleProject(t, s)
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	if err := s.ArchiveRun(ctx, run.ID); err != nil {
		t.Fatalf("ArchiveRun: %v", err)
	}
	got, err := s.GetRun(ctx, run.ID)
	if err != nil || !got.Archived {
		t.Fatalf("after ArchiveRun, archived = %v, %v; want true", got.Archived, err)
	}

	history, err := s.AuditHistory(ctx, "run", run.ID)
	if err != nil {
		t.Fatalf("AuditHistory: %v", err)
	}
	var found bool
	for _, e := range history {
		if e.Action == "archive" {
			found = true
		}
	}
	if !found {
		t.Errorf("audit history = %+v, want an 'archive' entry", history)
	}
}

// TestUnarchiveRunAudited covers the inverse of TestArchiveRunAudited.
func TestUnarchiveRunAudited(t *testing.T) {
	s := lifecycleTestService(t)
	admin := mustCreateUser(t, s, "archiver2@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	p := mustLifecycleProject(t, s)
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	if err := s.ArchiveRun(ctx, run.ID); err != nil {
		t.Fatalf("ArchiveRun: %v", err)
	}

	if err := s.UnarchiveRun(ctx, run.ID); err != nil {
		t.Fatalf("UnarchiveRun: %v", err)
	}
	got, err := s.GetRun(ctx, run.ID)
	if err != nil || got.Archived {
		t.Fatalf("after UnarchiveRun, archived = %v, %v; want false", got.Archived, err)
	}

	history, err := s.AuditHistory(ctx, "run", run.ID)
	if err != nil {
		t.Fatalf("AuditHistory: %v", err)
	}
	var found bool
	for _, e := range history {
		if e.Action == "unarchive" {
			found = true
		}
	}
	if !found {
		t.Errorf("audit history = %+v, want an 'unarchive' entry", history)
	}
}

// An imported run is created closed (collapse-duplicate-ci-runs); confirm
// the existing reopen capability generalizes to it unmodified.
// TestDeleteRunRemovesIt covers add-data-retention design.md D1: a plain,
// thin passthrough to the store — no permission check here (that's the
// HTTP middleware's job, not the service's).
func TestDeleteRunRemovesIt(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	if err := s.DeleteRun(ctx, run.ID); err != nil {
		t.Fatalf("DeleteRun: %v", err)
	}
	if _, err := s.GetRun(ctx, run.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("GetRun after delete = %v, want ErrNotFound", err)
	}
}

func TestReopenImportedRun(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	importActorCtx := domain.WithActor(ctx, domain.Actor{
		ID: "agent-1", Kind: domain.ActorKindAgent, DisplayName: "ci-bot", EffectiveUserID: "agent-1",
	})
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)

	result, err := s.Import(importActorCtx, p.ID, service.ImportInput{
		Format: "junit-xml",
		Report: fmt.Sprintf(`<testsuites><testsuite name="pytest"><testcase name="test_it"><properties><property name="testpulse_case_key" value="%s"/></properties></testcase></testsuite></testsuites>`, c.Key),
	})
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if result.Run.Status != domain.RunStatusClosed {
		t.Fatalf("Run.Status = %q, want closed", result.Run.Status)
	}

	if err := s.ReopenRun(ctx, result.Run.ID); err != nil {
		t.Fatalf("ReopenRun: %v", err)
	}
	got, err := s.GetRun(ctx, result.Run.ID)
	if err != nil || got.Status != domain.RunStatusOpen {
		t.Fatalf("after ReopenRun, status = %q, %v; want open", got.Status, err)
	}
}

func TestClosedRunMutationsReturnConflictError(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("RunItems: %d, %v", len(items), err)
	}
	item := items[0]

	if err := s.CloseRun(ctx, run.ID); err != nil {
		t.Fatalf("CloseRun: %v", err)
	}

	wantConflict := func(t *testing.T, label string, err error) {
		t.Helper()
		var cerr *service.ConflictError
		if !errors.As(err, &cerr) {
			t.Errorf("%s error = %v, want ConflictError", label, err)
		}
	}

	c2 := mustLifecycleCase(t, s, p.ID)
	_, err = s.AddRunItem(ctx, run.ID, c2.ID)
	wantConflict(t, "AddRunItem", err)

	_, err = s.RecordResult(ctx, item.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass})
	wantConflict(t, "RecordResult", err)

	status := string(domain.StatusRetest)
	err = s.UpdateItem(ctx, item.ID, service.ItemUpdate{Status: &status})
	wantConflict(t, "UpdateItem(status)", err)

	admin := actorFor(mustCreateUser(t, s, "admin-closed-run@example.com", "correcthorse", true))
	member := mustCreateUser(t, s, "member-closed-run@example.com", "correcthorse", false)
	role, err := s.CreateRole(ctx, admin, domain.Role{Name: "Tester (closed-run-test)", CanRead: true, CanRunRecordResult: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := s.SetProjectMember(ctx, admin, p.ID, member.ID, role.ID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}
	memberID := member.ID
	err = s.UpdateItem(ctx, item.ID, service.ItemUpdate{AssigneeUserID: &memberID})
	wantConflict(t, "UpdateItem(assignee)", err)
}

// TestAssignItemRequiresProjectMembership covers
// link-run-item-assignee-to-identity: assignment can only reference a
// real user who is actually a member of the item's project.
func TestAssignItemRequiresProjectMembership(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("RunItems: %d, %v", len(items), err)
	}
	item := items[0]

	admin := actorFor(mustCreateUser(t, s, "admin-membership@example.com", "correcthorse", true))
	outsider := mustCreateUser(t, s, "outsider@example.com", "correcthorse", false)

	outsiderID := outsider.ID
	err = s.UpdateItem(ctx, item.ID, service.ItemUpdate{AssigneeUserID: &outsiderID})
	if !errors.Is(err, store.ErrNotFound) {
		t.Errorf("assigning a non-member user: err = %v, want ErrNotFound", err)
	}

	role, err := s.CreateRole(ctx, admin, domain.Role{Name: "Tester (membership-test)", CanRead: true, CanRunRecordResult: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := s.SetProjectMember(ctx, admin, p.ID, outsider.ID, role.ID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}
	if err := s.UpdateItem(ctx, item.ID, service.ItemUpdate{AssigneeUserID: &outsiderID}); err != nil {
		t.Fatalf("assigning a project member: %v", err)
	}
	got, err := s.RunItems(ctx, run.ID, "")
	if err != nil || got[0].Assignee == nil || got[0].Assignee.ID != outsider.ID {
		t.Errorf("Assignee = %+v, %v, want %s", got[0].Assignee, err, outsider.ID)
	}
}

// TestAssignItemRejectsNonMemberTeam covers the same rule for teams.
func TestAssignItemRejectsNonMemberTeam(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, _ := s.RunItems(ctx, run.ID, "")
	item := items[0]

	admin := actorFor(mustCreateUser(t, s, "admin-team-membership@example.com", "correcthorse", true))
	team, err := s.CreateTeam(ctx, admin, "Unrelated Team")
	if err != nil {
		t.Fatalf("CreateTeam: %v", err)
	}

	teamID := team.ID
	err = s.UpdateItem(ctx, item.ID, service.ItemUpdate{AssigneeTeamID: &teamID})
	if !errors.Is(err, store.ErrNotFound) {
		t.Errorf("assigning a non-member team: err = %v, want ErrNotFound", err)
	}

	role, err := s.CreateRole(ctx, admin, domain.Role{Name: "Tester (team-membership-test)", CanRead: true, CanRunRecordResult: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := s.SetProjectTeamRole(ctx, admin, p.ID, team.ID, role.ID); err != nil {
		t.Fatalf("SetProjectTeamRole: %v", err)
	}
	if err := s.UpdateItem(ctx, item.ID, service.ItemUpdate{AssigneeTeamID: &teamID}); err != nil {
		t.Fatalf("assigning a member team: %v", err)
	}
}

// TestSuiteTrendResolvesFromSuiteID covers add-suite-pass-rate-trend's
// service-layer resolution: Service.SuiteTrend surfaces a suite's closed
// runs via the store's aggregation query.
func TestSuiteTrendResolvesFromSuiteID(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)
	suite, err := s.CreateSuite(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1", SuiteID: suite.ID, CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("RunItems: %d, %v", len(items), err)
	}
	if _, err := s.RecordResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}
	if err := s.CloseRun(ctx, run.ID); err != nil {
		t.Fatalf("CloseRun: %v", err)
	}

	trend, err := s.SuiteTrend(ctx, suite.ID, false)
	if err != nil {
		t.Fatalf("SuiteTrend: %v", err)
	}
	if trend.SuiteKey != suite.Key {
		t.Errorf("SuiteKey = %q, want %q", trend.SuiteKey, suite.Key)
	}
	if len(trend.Points) != 1 || trend.Points[0].Counts[domain.StatusPass] != 1 {
		t.Errorf("Points = %+v, want one point with 1 pass", trend.Points)
	}
}

func TestGetSuiteResolvesByID(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	created, err := s.CreateSuite(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}

	got, err := s.GetSuite(ctx, created.ID)
	if err != nil {
		t.Fatalf("GetSuite: %v", err)
	}
	if got.Name != "smoke" {
		t.Errorf("GetSuite name = %q, want %q", got.Name, "smoke")
	}
}

func TestRenameSuiteUpdatesName(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	created, err := s.CreateSuite(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}

	renamed, err := s.RenameSuite(ctx, created.ID, "smoke v2")
	if err != nil {
		t.Fatalf("RenameSuite: %v", err)
	}
	if renamed.Name != "smoke v2" {
		t.Errorf("RenameSuite name = %q, want %q", renamed.Name, "smoke v2")
	}
}

func TestDeleteSuiteRemovesIt(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	created, err := s.CreateSuite(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}

	if err := s.DeleteSuite(ctx, created.ID); err != nil {
		t.Fatalf("DeleteSuite: %v", err)
	}
	if _, err := s.GetSuite(ctx, created.ID); err == nil {
		t.Error("GetSuite after delete: want error, got nil")
	}
}

// TestFlakyCasesResolvesFromProjectID covers add-flaky-test-detection's
// service-layer resolution: Service.FlakyCases surfaces a project's
// currently-flaky cases via the store's aggregation query.
func TestFlakyCasesResolvesFromProjectID(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)

	run1, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "run 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun run1: %v", err)
	}
	items1, err := s.RunItems(ctx, run1.ID, "")
	if err != nil || len(items1) != 1 {
		t.Fatalf("RunItems run1: %d, %v", len(items1), err)
	}
	if _, err := s.RecordResult(ctx, items1[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult run1: %v", err)
	}

	run2, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "run 2", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun run2: %v", err)
	}
	items2, err := s.RunItems(ctx, run2.ID, "")
	if err != nil || len(items2) != 1 {
		t.Fatalf("RunItems run2: %d, %v", len(items2), err)
	}
	if _, err := s.RecordResult(ctx, items2[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}); err != nil {
		t.Fatalf("RecordResult run2: %v", err)
	}

	flaky, err := s.FlakyCases(ctx, p.ID)
	if err != nil {
		t.Fatalf("FlakyCases: %v", err)
	}
	if len(flaky) != 1 || flaky[0].CaseKey != c.Key {
		t.Errorf("FlakyCases = %+v, want exactly case %q", flaky, c.Key)
	}
}

// TestProjectStatusSummaryIsAThinPassthrough covers
// add-project-reports-page's service-layer resolution: Service.
// ProjectStatusSummary is a thin passthrough to the store's aggregation
// query, mirroring Service.FlakyCases.
func TestProjectStatusSummaryIsAThinPassthrough(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "run 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("RunItems: %d, %v", len(items), err)
	}
	if _, err := s.RecordResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	sum, err := s.ProjectStatusSummary(ctx, p.ID)
	if err != nil {
		t.Fatalf("ProjectStatusSummary: %v", err)
	}
	if sum.Total != 1 || sum.Counts[domain.StatusPass] != 1 {
		t.Errorf("ProjectStatusSummary = %+v, want total 1, pass 1", sum)
	}
}

// TestRecentCaseExecutionsIsAThinPassthrough covers add-case-result-history's
// bounded recency query at the service layer: a thin wrapper over the store
// call, no aggregation logic here.
func TestRecentCaseExecutionsIsAThinPassthrough(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "run 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("RunItems: %d, %v", len(items), err)
	}
	if _, err := s.RecordResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	execs, err := s.RecentCaseExecutions(ctx, c.ID, 5)
	if err != nil {
		t.Fatalf("RecentCaseExecutions: %v", err)
	}
	if len(execs) != 1 || execs[0].RunID != run.ID {
		t.Errorf("RecentCaseExecutions = %+v, want the single execution from %q", execs, run.ID)
	}
}

// TestRecentCaseExecutionsValidatesLimit covers the "rejects an unbounded or
// excessive limit" scenario: limit <= 0 or limit > 50 is rejected before
// ever reaching the store, so the param can never become an unbounded-fetch
// escape hatch.
func TestRecentCaseExecutionsValidatesLimit(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)

	for _, limit := range []int{0, -1, 51, 1000} {
		_, err := s.RecentCaseExecutions(ctx, c.ID, limit)
		var verr *service.ValidationError
		if !errors.As(err, &verr) {
			t.Errorf("RecentCaseExecutions(limit=%d) error = %v (%T), want *ValidationError", limit, err, err)
		}
	}
}
