package service_test

import (
	"context"
	"log/slog"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// TestRunAutoArchiveWorkerNoopWhenThresholdIsZero covers design.md D1: the
// default threshold (0) means the policy is off, so Sweep archives nothing
// regardless of how old a closed run is.
func TestRunAutoArchiveWorkerNoopWhenThresholdIsZero(t *testing.T) {
	s, pool := testServiceWithPool(t)
	admin := mustCreateUser(t, s, "runautoarchive1@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Run Auto Archive Off"})
	if err != nil {
		t.Fatal(err)
	}
	run, err := s.CreateRun(ctx, project.ID, service.RunInput{Name: "old closed run"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.CloseRun(ctx, run.ID); err != nil {
		t.Fatal(err)
	}
	backdateRun(t, pool, run.ID, 100)

	worker := service.NewRunAutoArchiveWorker(s)
	archived, err := worker.Sweep(context.Background())
	if err != nil {
		t.Fatalf("Sweep: %v", err)
	}
	if archived != 0 {
		t.Errorf("Sweep archived = %d, want 0 (threshold off)", archived)
	}
	got, err := s.GetRun(context.Background(), run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Archived {
		t.Error("run was archived while threshold is 0, want untouched")
	}
}

// TestRunAutoArchiveWorkerArchivesOnlyEligibleRuns covers the core rule:
// once a threshold is set, only old closed runs are archived — an open run
// and a recently-closed run are both left alone.
func TestRunAutoArchiveWorkerArchivesOnlyEligibleRuns(t *testing.T) {
	s, pool := testServiceWithPool(t)
	admin := mustCreateUser(t, s, "runautoarchive2@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Run Auto Archive Eligibility"})
	if err != nil {
		t.Fatal(err)
	}

	oldClosed, err := s.CreateRun(ctx, project.ID, service.RunInput{Name: "old closed"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.CloseRun(ctx, oldClosed.ID); err != nil {
		t.Fatal(err)
	}
	backdateRun(t, pool, oldClosed.ID, 40)

	recentClosed, err := s.CreateRun(ctx, project.ID, service.RunInput{Name: "recent closed"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.CloseRun(ctx, recentClosed.ID); err != nil {
		t.Fatal(err)
	}
	backdateRun(t, pool, recentClosed.ID, 5)

	oldOpen, err := s.CreateRun(ctx, project.ID, service.RunInput{Name: "old open"})
	if err != nil {
		t.Fatal(err)
	}
	backdateRun(t, pool, oldOpen.ID, 40)

	days := 30
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{RunAutoArchiveInactiveDays: &days}); err != nil {
		t.Fatal(err)
	}

	worker := service.NewRunAutoArchiveWorker(s)
	archived, err := worker.Sweep(context.Background())
	if err != nil {
		t.Fatalf("Sweep: %v", err)
	}
	if archived != 1 {
		t.Errorf("Sweep archived = %d, want 1", archived)
	}

	got, err := s.GetRun(context.Background(), oldClosed.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Archived {
		t.Error("old closed run was not archived, want archived")
	}
	got, err = s.GetRun(context.Background(), recentClosed.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Archived {
		t.Error("recently-closed run was archived, want untouched")
	}
	got, err = s.GetRun(context.Background(), oldOpen.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Archived {
		t.Error("old open run was archived, want untouched (open runs never auto-archived)")
	}
}

// TestRunAutoArchiveWorkerAuditsAsSystemActor covers design.md D4: an
// automatic archive is audited with actor kind system, using a distinct
// worker id from both RunRetentionWorker's and ProjectAutoArchiveWorker's.
func TestRunAutoArchiveWorkerAuditsAsSystemActor(t *testing.T) {
	s, pool := testServiceWithPool(t)
	admin := mustCreateUser(t, s, "runautoarchive3@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Run Auto Archive Audited"})
	if err != nil {
		t.Fatal(err)
	}
	run, err := s.CreateRun(ctx, project.ID, service.RunInput{Name: "old closed run"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.CloseRun(ctx, run.ID); err != nil {
		t.Fatal(err)
	}
	backdateRun(t, pool, run.ID, 40)

	days := 30
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{RunAutoArchiveInactiveDays: &days}); err != nil {
		t.Fatal(err)
	}

	worker := service.NewRunAutoArchiveWorker(s)
	if _, err := worker.Sweep(context.Background()); err != nil {
		t.Fatalf("Sweep: %v", err)
	}

	history, err := s.AuditHistory(ctx, "run", run.ID)
	if err != nil {
		t.Fatalf("AuditHistory: %v", err)
	}
	var archiveEntry *domain.AuditEntry
	for i := range history {
		if history[i].Action == "archive" {
			archiveEntry = &history[i]
		}
	}
	if archiveEntry == nil {
		t.Fatalf("audit history = %+v, want an 'archive' entry", history)
	}
	if archiveEntry.ActorKind != domain.ActorKindSystem {
		t.Errorf("ActorKind = %q, want %q", archiveEntry.ActorKind, domain.ActorKindSystem)
	}
	if archiveEntry.ActorID != "run-auto-archive-worker" {
		t.Errorf("ActorID = %q, want %q", archiveEntry.ActorID, "run-auto-archive-worker")
	}
}

// TestRunAutoArchiveWorkerLogsSweepFailure covers add-service-request-
// logging: a tick's failure is logged rather than silently discarded. A
// pre-cancelled context is the minimal viable way to force Sweep's first
// store call to fail, and also makes Run return after exactly one tick.
func TestRunAutoArchiveWorkerLogsSweepFailure(t *testing.T) {
	s, _ := testServiceWithPool(t)
	h := &recordingHandler{}
	s = s.WithLogger(slog.New(h))
	worker := service.NewRunAutoArchiveWorker(s)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	worker.Run(ctx)

	if attrs := h.attrs("run auto-archive sweep failed"); attrs == nil {
		t.Fatalf("no failure log line produced; got messages %v", h.messages())
	}
}
