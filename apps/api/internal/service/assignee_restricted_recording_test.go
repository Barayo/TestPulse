package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

func TestUpdateProjectSetsAssigneeRestrictedRecording(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "Owned Items"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	if p.AssigneeRestrictedRecording {
		t.Fatalf("AssigneeRestrictedRecording on create = %v, want false", p.AssigneeRestrictedRecording)
	}

	restricted := true
	updated, err := s.UpdateProject(ctx, p.ID, service.ProjectUpdate{AssigneeRestrictedRecording: &restricted})
	if err != nil {
		t.Fatalf("UpdateProject: %v", err)
	}
	if !updated.AssigneeRestrictedRecording {
		t.Errorf("AssigneeRestrictedRecording after update = %v, want true", updated.AssigneeRestrictedRecording)
	}
}
