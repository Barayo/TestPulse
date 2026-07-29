package service_test

import (
	"context"
	"errors"
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

	assignee := "ana"
	err = s.UpdateItem(ctx, item.ID, service.ItemUpdate{Assignee: &assignee})
	wantConflict(t, "UpdateItem(assignee)", err)
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

	trend, err := s.SuiteTrend(ctx, suite.ID)
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
