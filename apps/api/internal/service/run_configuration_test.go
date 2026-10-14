package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func TestCreateRunWithConfiguration(t *testing.T) {
	s := service.New(store.New(testutil.Pool(t, "run_configuration_service")))
	ctx := context.Background()
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "cross-browser", Configuration: "Chrome"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	if run.Configuration == nil || *run.Configuration != "Chrome" {
		t.Fatalf("Configuration = %v, want \"Chrome\"", run.Configuration)
	}

	got, err := s.GetRun(ctx, run.ID)
	if err != nil {
		t.Fatalf("GetRun: %v", err)
	}
	if got.Configuration == nil || *got.Configuration != "Chrome" {
		t.Fatalf("GetRun Configuration = %v, want \"Chrome\"", got.Configuration)
	}
}

func TestCreateRunWithoutConfiguration(t *testing.T) {
	s := service.New(store.New(testutil.Pool(t, "run_configuration_service")))
	ctx := context.Background()
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "no-config"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	if run.Configuration != nil {
		t.Fatalf("Configuration = %v, want nil", *run.Configuration)
	}
}
