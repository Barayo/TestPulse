package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

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
	if err := s.SetPublicProjectsEnabled(ctx, false); err != nil {
		t.Fatalf("SetPublicProjectsEnabled: %v", err)
	}
	ok, err = s.IsProjectPubliclyAccessible(ctx, p.ID)
	if err != nil {
		t.Fatalf("IsProjectPubliclyAccessible: %v", err)
	}
	if ok {
		t.Error("accessible with instance flag off, want false (kill switch wins)")
	}

	// Re-enabling the instance switch restores access without touching the
	// project's own flag.
	if err := s.SetPublicProjectsEnabled(ctx, true); err != nil {
		t.Fatalf("SetPublicProjectsEnabled: %v", err)
	}
	ok, err = s.IsProjectPubliclyAccessible(ctx, p.ID)
	if err != nil {
		t.Fatalf("IsProjectPubliclyAccessible: %v", err)
	}
	if !ok {
		t.Error("accessible after re-enabling instance flag, want true (project flag was untouched)")
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
