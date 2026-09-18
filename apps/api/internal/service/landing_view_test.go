package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

func TestUpdateProjectSetsLandingView(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-landing-set@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "Landing Set"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	if p.LandingView != nil {
		t.Fatalf("LandingView on create = %v, want nil (inherits instance default)", p.LandingView)
	}

	view := "suites"
	updated, err := s.UpdateProject(ctx, p.ID, service.ProjectUpdate{LandingView: &view})
	if err != nil {
		t.Fatalf("UpdateProject: %v", err)
	}
	if updated.LandingView == nil || *updated.LandingView != "suites" {
		t.Errorf("LandingView after update = %v, want \"suites\"", updated.LandingView)
	}
}

func TestUpdateProjectClearsLandingView(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-landing-clear@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "Landing Clear"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	view := "runs"
	if _, err := s.UpdateProject(ctx, p.ID, service.ProjectUpdate{LandingView: &view}); err != nil {
		t.Fatalf("UpdateProject: %v", err)
	}

	clear := true
	updated, err := s.UpdateProject(ctx, p.ID, service.ProjectUpdate{ClearLandingView: &clear})
	if err != nil {
		t.Fatalf("UpdateProject(ClearLandingView): %v", err)
	}
	if updated.LandingView != nil {
		t.Errorf("LandingView after clear = %v, want nil", updated.LandingView)
	}
}

func TestUpdateProjectRejectsUnknownLandingView(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin-landing-bad@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "Landing Bad"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	view := "kanban"
	if _, err := s.UpdateProject(ctx, p.ID, service.ProjectUpdate{LandingView: &view}); err == nil {
		t.Fatal(`UpdateProject(LandingView: "kanban"): want error, got nil`)
	}
}
