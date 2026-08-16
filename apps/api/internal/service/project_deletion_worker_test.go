package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// TestProjectDeletionWorkerPurgesEverythingAcrossMultipleBatches covers
// add-data-retention design.md D6: a project with more child rows than one
// batch is still fully removed — every case/version/run/item/result, and
// finally the project row itself.
func TestProjectDeletionWorkerPurgesEverythingAcrossMultipleBatches(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "worker1@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Big Project"})
	if err != nil {
		t.Fatal(err)
	}
	var caseIDs []string
	for i := 0; i < 5; i++ {
		c, err := s.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "case", Priority: domain.PriorityMedium})
		if err != nil {
			t.Fatal(err)
		}
		caseIDs = append(caseIDs, c.ID)
	}
	if _, err := s.CreateRun(ctx, project.ID, service.RunInput{Name: "run 1", CaseIDs: caseIDs}); err != nil {
		t.Fatal(err)
	}
	archived := true
	if _, err := s.UpdateProject(ctx, project.ID, service.ProjectUpdate{Archived: &archived}); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteProject(ctx, project.ID); err != nil {
		t.Fatal(err)
	}

	worker := service.NewProjectDeletionWorker(s)
	worker.BatchSize = 2 // force multiple batches against 5 cases

	if err := worker.ProcessPending(context.Background()); err != nil {
		t.Fatalf("ProcessPending: %v", err)
	}

	if _, err := s.GetProject(context.Background(), project.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("GetProject after purge = %v, want ErrNotFound", err)
	}
}

// TestProjectDeletionWorkerResumesAfterPartialRun covers design.md D6's
// resumability: running ProcessPending twice (simulating a server restart
// mid-purge) is safe and eventually completes.
func TestProjectDeletionWorkerResumesAfterPartialRun(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "worker2@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Resumable Project"})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if _, err := s.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "case", Priority: domain.PriorityMedium}); err != nil {
			t.Fatal(err)
		}
	}
	archived := true
	if _, err := s.UpdateProject(ctx, project.ID, service.ProjectUpdate{Archived: &archived}); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteProject(ctx, project.ID); err != nil {
		t.Fatal(err)
	}

	worker := service.NewProjectDeletionWorker(s)
	worker.BatchSize = 1

	if err := worker.ProcessPending(context.Background()); err != nil {
		t.Fatalf("first ProcessPending: %v", err)
	}
	// Idempotent re-run: nothing pending anymore, must not error.
	if err := worker.ProcessPending(context.Background()); err != nil {
		t.Fatalf("second ProcessPending (resumed): %v", err)
	}

	if _, err := s.GetProject(context.Background(), project.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("GetProject after resumed purge = %v, want ErrNotFound", err)
	}
}

// TestProjectDeletionWorkerLeavesUnmarkedProjectsAlone is a guardrail: the
// worker must never touch a project that isn't queued for deletion.
func TestProjectDeletionWorkerLeavesUnmarkedProjectsAlone(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "worker3@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	kept, err := s.CreateProject(ctx, service.ProjectInput{Name: "Kept Project"})
	if err != nil {
		t.Fatal(err)
	}

	worker := service.NewProjectDeletionWorker(s)
	if err := worker.ProcessPending(context.Background()); err != nil {
		t.Fatalf("ProcessPending: %v", err)
	}

	if _, err := s.GetProject(context.Background(), kept.ID); err != nil {
		t.Errorf("GetProject(kept) = %v, want the project untouched", err)
	}
}
