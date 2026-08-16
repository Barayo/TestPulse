package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// TestProjectAutoArchiveWorkerNoopWhenThresholdIsZero covers design.md D9:
// the default threshold (0) means the policy is off, so Sweep archives
// nothing regardless of how inactive a project is.
func TestProjectAutoArchiveWorkerNoopWhenThresholdIsZero(t *testing.T) {
	s, pool := testServiceWithPool(t)
	admin := mustCreateUser(t, s, "autoarchive1@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Inactive Off"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(),
		`UPDATE projects SET created_at = now() - make_interval(days => 100) WHERE id = $1`, project.ID); err != nil {
		t.Fatalf("backdate: %v", err)
	}

	worker := service.NewProjectAutoArchiveWorker(s)
	archived, err := worker.Sweep(context.Background())
	if err != nil {
		t.Fatalf("Sweep: %v", err)
	}
	if archived != 0 {
		t.Errorf("Sweep archived = %d, want 0 (threshold off)", archived)
	}
	got, err := s.GetProject(context.Background(), project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Archived {
		t.Error("project was archived while threshold is 0, want untouched")
	}
}

// TestProjectAutoArchiveWorkerArchivesOnlyEligibleProjects covers the core
// rule: once a threshold is set, only inactive, non-exempt, non-archived
// projects are archived; active ones are left alone.
func TestProjectAutoArchiveWorkerArchivesOnlyEligibleProjects(t *testing.T) {
	s, pool := testServiceWithPool(t)
	admin := mustCreateUser(t, s, "autoarchive2@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	inactive, err := s.CreateProject(ctx, service.ProjectInput{Name: "Inactive"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(),
		`UPDATE projects SET created_at = now() - make_interval(days => 100) WHERE id = $1`, inactive.ID); err != nil {
		t.Fatalf("backdate: %v", err)
	}

	active, err := s.CreateProject(ctx, service.ProjectInput{Name: "Active"})
	if err != nil {
		t.Fatal(err)
	}

	days := 30
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{AutoArchiveInactiveDays: &days}); err != nil {
		t.Fatal(err)
	}

	worker := service.NewProjectAutoArchiveWorker(s)
	archived, err := worker.Sweep(context.Background())
	if err != nil {
		t.Fatalf("Sweep: %v", err)
	}
	if archived != 1 {
		t.Errorf("Sweep archived = %d, want 1", archived)
	}

	got, err := s.GetProject(context.Background(), inactive.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.Archived {
		t.Error("inactive project was not archived, want archived")
	}
	got, err = s.GetProject(context.Background(), active.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Archived {
		t.Error("active project was archived, want untouched")
	}
}

// TestProjectAutoArchiveWorkerRespectsExemption covers design.md D9: an
// exempted project is never auto-archived, no matter how inactive.
func TestProjectAutoArchiveWorkerRespectsExemption(t *testing.T) {
	s, pool := testServiceWithPool(t)
	admin := mustCreateUser(t, s, "autoarchive3@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	exempt, err := s.CreateProject(ctx, service.ProjectInput{Name: "Exempt"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(),
		`UPDATE projects SET created_at = now() - make_interval(days => 100) WHERE id = $1`, exempt.ID); err != nil {
		t.Fatalf("backdate: %v", err)
	}
	exemptFlag := true
	if _, err := s.UpdateProject(ctx, exempt.ID, service.ProjectUpdate{AutoArchiveExempt: &exemptFlag}); err != nil {
		t.Fatal(err)
	}

	days := 30
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{AutoArchiveInactiveDays: &days}); err != nil {
		t.Fatal(err)
	}

	worker := service.NewProjectAutoArchiveWorker(s)
	archived, err := worker.Sweep(context.Background())
	if err != nil {
		t.Fatalf("Sweep: %v", err)
	}
	if archived != 0 {
		t.Errorf("Sweep archived = %d, want 0 (exempt)", archived)
	}
	got, err := s.GetProject(context.Background(), exempt.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Archived {
		t.Error("exempt project was archived, want untouched")
	}
}

// TestProjectAutoArchiveWorkerAuditsAsSystemActor covers design.md D9: an
// automatic archive is audited with actor kind system, using a distinct
// worker id from RunRetentionWorker's own.
func TestProjectAutoArchiveWorkerAuditsAsSystemActor(t *testing.T) {
	s, pool := testServiceWithPool(t)
	admin := mustCreateUser(t, s, "autoarchive4@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Inactive Audited"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(),
		`UPDATE projects SET created_at = now() - make_interval(days => 100) WHERE id = $1`, project.ID); err != nil {
		t.Fatalf("backdate: %v", err)
	}

	days := 30
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{AutoArchiveInactiveDays: &days}); err != nil {
		t.Fatal(err)
	}

	worker := service.NewProjectAutoArchiveWorker(s)
	if _, err := worker.Sweep(context.Background()); err != nil {
		t.Fatalf("Sweep: %v", err)
	}

	history, err := s.AuditHistory(ctx, "project", project.ID)
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
	if archiveEntry.ActorID != "auto-archive-worker" {
		t.Errorf("ActorID = %q, want %q", archiveEntry.ActorID, "auto-archive-worker")
	}
}
