package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func bootstrapTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "project_bootstrap_service")))
}

// TestHasAnyProjectReflectsInstanceState covers add-sample-project's
// startup gate: HasAnyProject bypasses RBAC entirely (no actor exists yet
// at server startup) and just reflects whether any project exists.
func TestHasAnyProjectReflectsInstanceState(t *testing.T) {
	s := bootstrapTestService(t)
	ctx := context.Background()

	has, err := s.HasAnyProject(ctx)
	if err != nil {
		t.Fatalf("HasAnyProject on empty instance: %v", err)
	}
	if has {
		t.Error("HasAnyProject = true on an empty instance, want false")
	}

	if _, err := s.CreateProject(ctx, service.ProjectInput{Name: "QA"}); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	has, err = s.HasAnyProject(ctx)
	if err != nil {
		t.Fatalf("HasAnyProject after create: %v", err)
	}
	if !has {
		t.Error("HasAnyProject = false after a project was created, want true")
	}
}

func TestMarkSampleReflectedByGetProject(t *testing.T) {
	s := bootstrapTestService(t)
	ctx := context.Background()

	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "Sample Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	if p.IsSample {
		t.Fatal("newly created project already IsSample, want false before MarkSample")
	}

	if err := s.MarkSample(ctx, p.ID); err != nil {
		t.Fatalf("MarkSample: %v", err)
	}

	got, err := s.GetProject(ctx, p.ID)
	if err != nil {
		t.Fatalf("GetProject: %v", err)
	}
	if !got.IsSample {
		t.Error("GetProject IsSample = false after MarkSample, want true")
	}
}
