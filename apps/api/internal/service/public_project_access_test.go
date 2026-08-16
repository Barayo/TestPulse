package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// setPublicProjectsEnabled is a thin test helper over UpdateInstanceSettings
// for tests that only care about the public-projects kill switch.
func setPublicProjectsEnabled(t *testing.T, s *service.Service, ctx context.Context, enabled bool) {
	t.Helper()
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{PublicProjectsEnabled: &enabled}); err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}
}

func TestUpdateProjectSetsPublicAccess(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "Public Me"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	if p.PublicAccess {
		t.Fatalf("PublicAccess on create = %v, want false", p.PublicAccess)
	}

	public := true
	updated, err := s.UpdateProject(ctx, p.ID, service.ProjectUpdate{PublicAccess: &public})
	if err != nil {
		t.Fatalf("UpdateProject: %v", err)
	}
	if !updated.PublicAccess {
		t.Errorf("PublicAccess after update = %v, want true", updated.PublicAccess)
	}
}

func TestIsProjectPubliclyAccessibleRequiresBothFlags(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "Gate Me"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	// Neither flag set: not accessible.
	ok, err := s.IsProjectPubliclyAccessible(ctx, p.ID)
	if err != nil {
		t.Fatalf("IsProjectPubliclyAccessible: %v", err)
	}
	if ok {
		t.Error("accessible with both flags off, want false")
	}

	// Only the project's own flag set, instance flag defaults true: accessible.
	public := true
	if _, err := s.UpdateProject(ctx, p.ID, service.ProjectUpdate{PublicAccess: &public}); err != nil {
		t.Fatalf("UpdateProject: %v", err)
	}
	ok, err = s.IsProjectPubliclyAccessible(ctx, p.ID)
	if err != nil {
		t.Fatalf("IsProjectPubliclyAccessible: %v", err)
	}
	if !ok {
		t.Error("accessible with project flag on and instance flag on, want true")
	}

	// Instance-wide switch off overrides the project's own flag: not accessible.
	setPublicProjectsEnabled(t, s, ctx, false)
	ok, err = s.IsProjectPubliclyAccessible(ctx, p.ID)
	if err != nil {
		t.Fatalf("IsProjectPubliclyAccessible: %v", err)
	}
	if ok {
		t.Error("accessible with instance flag off, want false (kill switch wins)")
	}

	// Re-enabling the instance switch restores access without touching the
	// project's own flag.
	setPublicProjectsEnabled(t, s, ctx, true)
	ok, err = s.IsProjectPubliclyAccessible(ctx, p.ID)
	if err != nil {
		t.Fatalf("IsProjectPubliclyAccessible: %v", err)
	}
	if !ok {
		t.Error("accessible after re-enabling instance flag, want true (project flag was untouched)")
	}
}

// TestListPublicProjectsRespectsInstanceSwitch covers
// add-public-project-discovery D2: ListPublicProjects returns public
// projects when the instance-wide switch is on, and an empty slice when
// it's off regardless of any project's own flag.
func TestListPublicProjectsRespectsInstanceSwitch(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "Discoverable"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	public := true
	if _, err := s.UpdateProject(ctx, p.ID, service.ProjectUpdate{PublicAccess: &public}); err != nil {
		t.Fatalf("UpdateProject: %v", err)
	}

	list, err := s.ListPublicProjects(ctx)
	if err != nil {
		t.Fatalf("ListPublicProjects: %v", err)
	}
	if len(list) != 1 || list[0].ID != p.ID {
		t.Errorf("ListPublicProjects = %+v, want only %q", list, p.ID)
	}

	setPublicProjectsEnabled(t, s, ctx, false)
	list, err = s.ListPublicProjects(ctx)
	if err != nil {
		t.Fatalf("ListPublicProjects with switch off: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("ListPublicProjects with instance switch off = %+v, want empty", list)
	}
}

func TestIsProjectPubliclyAccessibleFalseForUnknownProject(t *testing.T) {
	s := testService(t)
	ok, err := s.IsProjectPubliclyAccessible(context.Background(), "nonexistent-id")
	if err != nil {
		t.Fatalf("IsProjectPubliclyAccessible: %v", err)
	}
	if ok {
		t.Error("accessible for unknown project, want false")
	}
}
