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
