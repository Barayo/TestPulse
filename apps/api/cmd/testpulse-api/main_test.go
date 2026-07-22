package main

import (
	"context"
	"log/slog"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func TestSeedSampleProjectIfEmptySeedsOnceOnEmptyInstance(t *testing.T) {
	svc := service.New(store.New(testutil.Pool(t, "testpulse_api_main")))
	ctx := context.Background()
	logger := slog.New(slog.DiscardHandler)

	if err := svc.BootstrapAdmin(ctx, "admin@example.com", "correcthorse1"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}

	has, err := svc.HasAnyProject(ctx)
	if err != nil || has {
		t.Fatalf("HasAnyProject before seeding = %v, %v; want false, nil", has, err)
	}

	seedSampleProjectIfEmpty(ctx, logger, svc)

	has, err = svc.HasAnyProject(ctx)
	if err != nil || !has {
		t.Fatalf("HasAnyProject after seeding = %v, %v; want true, nil", has, err)
	}
}

func TestSeedSampleProjectIfEmptySkipsWhenNotEmpty(t *testing.T) {
	svc := service.New(store.New(testutil.Pool(t, "testpulse_api_main")))
	ctx := context.Background()
	logger := slog.New(slog.DiscardHandler)

	admin, err := svc.CreateUser(ctx, "admin@example.com", "correcthorse1", true)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	if _, err := svc.CreateProject(ctx, service.ProjectInput{Name: "Existing"}); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	seedSampleProjectIfEmpty(ctx, logger, svc)

	actorCtx := domain.WithActor(ctx, domain.Actor{
		ID: admin.ID, Kind: domain.ActorKindUser, DisplayName: admin.Email,
		EffectiveUserID: admin.ID, IsTenantAdmin: true,
	})
	projects, err := svc.ListProjects(actorCtx)
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(projects) != 1 {
		t.Fatalf("projects = %d, want 1 (no sample project should be added)", len(projects))
	}
	if projects[0].IsSample {
		t.Error("the pre-existing project was marked sample, want untouched")
	}
}
