package service_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
	"github.com/jackc/pgx/v5/pgxpool"
)

// testServiceWithPool is testService plus direct pool access, for arranging
// state no Service method exposes (backdating a run's created_at — there is
// no create-time-in-the-past API, nor should there be one).
func testServiceWithPool(t *testing.T) (*service.Service, *pgxpool.Pool) {
	t.Helper()
	pool := testutil.Pool(t, "identity_service")
	return service.New(store.New(pool)), pool
}

func backdateRun(t *testing.T, pool *pgxpool.Pool, runID string, ageDays int) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		`UPDATE test_runs SET created_at = now() - make_interval(days => $2) WHERE id = $1`, runID, ageDays); err != nil {
		t.Fatalf("backdate run: %v", err)
	}
}

// TestRunRetentionWorkerNoopWhenThresholdIsZero covers design.md D8: the
// default threshold (0) means the policy is off, so Sweep deletes nothing
// regardless of how old a closed run is.
func TestRunRetentionWorkerNoopWhenThresholdIsZero(t *testing.T) {
	s, pool := testServiceWithPool(t)
	admin := mustCreateUser(t, s, "retention1@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Retention Off"})
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
	backdateRun(t, pool, run.ID, 365)

	worker := service.NewRunRetentionWorker(s)
	deleted, err := worker.Sweep(context.Background())
	if err != nil {
		t.Fatalf("Sweep: %v", err)
	}
	if deleted != 0 {
		t.Errorf("Sweep deleted = %d, want 0 (threshold off)", deleted)
	}
	if _, err := s.GetRun(context.Background(), run.ID); err != nil {
		t.Errorf("GetRun after Sweep = %v, want the run untouched", err)
	}
}

// TestRunRetentionWorkerDeletesOnlyEligibleClosedRuns covers the core rule:
// once a threshold is set, only closed runs older than it are deleted; open
// runs and closed-but-recent runs are left alone.
func TestRunRetentionWorkerDeletesOnlyEligibleClosedRuns(t *testing.T) {
	s, pool := testServiceWithPool(t)
	admin := mustCreateUser(t, s, "retention2@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Retention Eligibility"})
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
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{RunRetentionDays: &days}); err != nil {
		t.Fatal(err)
	}

	worker := service.NewRunRetentionWorker(s)
	deleted, err := worker.Sweep(context.Background())
	if err != nil {
		t.Fatalf("Sweep: %v", err)
	}
	if deleted != 1 {
		t.Errorf("Sweep deleted = %d, want 1", deleted)
	}

	if _, err := s.GetRun(context.Background(), oldClosed.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("GetRun(oldClosed) after Sweep = %v, want ErrNotFound", err)
	}
	if _, err := s.GetRun(context.Background(), recentClosed.ID); err != nil {
		t.Errorf("GetRun(recentClosed) after Sweep = %v, want untouched", err)
	}
	if _, err := s.GetRun(context.Background(), oldOpen.ID); err != nil {
		t.Errorf("GetRun(oldOpen) after Sweep = %v, want untouched (open runs never auto-deleted)", err)
	}
}

// TestRunRetentionWorkerAuditsAsSystemActor covers design.md D8: an
// automatic deletion is audited with actor kind system, distinct from a
// human- or agent-triggered one.
func TestRunRetentionWorkerAuditsAsSystemActor(t *testing.T) {
	s, pool := testServiceWithPool(t)
	admin := mustCreateUser(t, s, "retention3@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Retention Audit"})
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
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{RunRetentionDays: &days}); err != nil {
		t.Fatal(err)
	}

	worker := service.NewRunRetentionWorker(s)
	if _, err := worker.Sweep(context.Background()); err != nil {
		t.Fatalf("Sweep: %v", err)
	}

	history, err := s.AuditHistory(ctx, "run", run.ID)
	if err != nil {
		t.Fatalf("AuditHistory: %v", err)
	}
	// history also carries this run's earlier human-actor "create"/"close"
	// entries (from CreateRun/CloseRun above) — only the "delete" entry
	// should be attributed to the system actor.
	var deleteEntry *domain.AuditEntry
	for i := range history {
		if history[i].Action == "delete" {
			deleteEntry = &history[i]
		}
	}
	if deleteEntry == nil {
		t.Fatalf("audit history = %+v, want a 'delete' entry", history)
	}
	if deleteEntry.ActorKind != domain.ActorKindSystem {
		t.Errorf("ActorKind = %q, want %q", deleteEntry.ActorKind, domain.ActorKindSystem)
	}
	if deleteEntry.ActorID != "retention-worker" {
		t.Errorf("ActorID = %q, want %q", deleteEntry.ActorID, "retention-worker")
	}
}

// TestRunRetentionWorkerLogsSweepFailure covers add-service-request-logging:
// a tick's failure is logged rather than silently discarded. A pre-cancelled
// context is the minimal viable way to force Sweep's first store call to
// fail, and also makes Run return after exactly one tick.
func TestRunRetentionWorkerLogsSweepFailure(t *testing.T) {
	s, _ := testServiceWithPool(t)
	h := &recordingHandler{}
	s = s.WithLogger(slog.New(h))
	worker := service.NewRunRetentionWorker(s)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	worker.Run(ctx)

	if attrs := h.attrs("run retention sweep failed"); attrs == nil {
		t.Fatalf("no failure log line produced; got messages %v", h.messages())
	}
}
