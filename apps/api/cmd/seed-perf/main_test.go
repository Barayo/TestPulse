package main

import (
	"context"
	"strings"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/sampledata"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func seededService(t *testing.T) *service.Service {
	t.Helper()
	svc := service.New(store.New(testutil.Pool(t, "seedperf")))
	if err := svc.BootstrapAdmin(context.Background(), "admin@example.com", "correcthorse1"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	return svc
}

// adminActorCtx mirrors what a real HTTP request from the bootstrap admin
// would carry, for read calls the test makes directly (seedPerfFixture
// constructs its own internally).
func adminActorCtx(t *testing.T, svc *service.Service) context.Context {
	t.Helper()
	admin, err := sampledata.TenantAdmin(context.Background(), svc)
	if err != nil {
		t.Fatalf("TenantAdmin: %v", err)
	}
	return domain.WithActor(context.Background(), domain.Actor{
		ID: admin.ID, Kind: domain.ActorKindUser, DisplayName: admin.Email,
		EffectiveUserID: admin.ID, IsTenantAdmin: admin.IsTenantAdmin,
	})
}

func TestSeedPerfFixtureCreatesSixtyProjects(t *testing.T) {
	svc := seededService(t)
	if err := seedPerfFixture(context.Background(), svc); err != nil {
		t.Fatalf("seedPerfFixture: %v", err)
	}

	ctx := adminActorCtx(t, svc)
	projects, err := svc.ListProjects(ctx)
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	perfLoadCount := 0
	for _, p := range projects {
		if strings.HasPrefix(p.Name, "Perf Load ") {
			perfLoadCount++
		}
	}
	// Hardcoded, not ProjectCount — this test exists to catch a drift
	// between the constant and reality, so it must not share the
	// constant with the implementation it's checking.
	const wantProjects = 60
	if perfLoadCount != wantProjects {
		t.Fatalf("expected %d 'Perf Load' projects, got %d", wantProjects, perfLoadCount)
	}
}

func TestSeedPerfFixtureIsIdempotent(t *testing.T) {
	svc := seededService(t)
	if err := seedPerfFixture(context.Background(), svc); err != nil {
		t.Fatalf("seedPerfFixture (1st run): %v", err)
	}
	if err := seedPerfFixture(context.Background(), svc); err != nil {
		t.Fatalf("seedPerfFixture (2nd run): %v", err)
	}

	ctx := adminActorCtx(t, svc)
	projects, err := svc.ListProjects(ctx)
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	perfLoadCount := 0
	for _, p := range projects {
		if strings.HasPrefix(p.Name, "Perf Load ") {
			perfLoadCount++
		}
	}
	const wantProjects = 60
	if perfLoadCount != wantProjects {
		t.Fatalf("expected %d 'Perf Load' projects after running seedPerfFixture twice, got %d", wantProjects, perfLoadCount)
	}
}

func TestSeedPerfFixtureCreatesWriteLoadProject(t *testing.T) {
	svc := seededService(t)
	if err := seedPerfFixture(context.Background(), svc); err != nil {
		t.Fatalf("seedPerfFixture: %v", err)
	}

	ctx := adminActorCtx(t, svc)
	projects, err := svc.ListProjects(ctx)
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	var target string
	for _, p := range projects {
		if p.Name == "Perf Write Load" {
			target = p.ID
		}
	}
	if target == "" {
		t.Fatal("'Perf Write Load' project not found")
	}

	cases, err := svc.ListCases(ctx, target)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	const wantCases = 500
	if len(cases) != wantCases {
		t.Fatalf("expected %d cases in 'Perf Write Load', got %d", wantCases, len(cases))
	}

	runs, err := svc.ListRuns(ctx, target)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 0 {
		t.Fatalf("expected 0 runs in 'Perf Write Load', got %d", len(runs))
	}
}

func TestSeedPerfFixtureWriteLoadProjectIsIdempotent(t *testing.T) {
	svc := seededService(t)
	if err := seedPerfFixture(context.Background(), svc); err != nil {
		t.Fatalf("seedPerfFixture (1st run): %v", err)
	}
	if err := seedPerfFixture(context.Background(), svc); err != nil {
		t.Fatalf("seedPerfFixture (2nd run): %v", err)
	}

	ctx := adminActorCtx(t, svc)
	projects, err := svc.ListProjects(ctx)
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	writeLoadCount := 0
	for _, p := range projects {
		if p.Name == "Perf Write Load" {
			writeLoadCount++
		}
	}
	if writeLoadCount != 1 {
		t.Fatalf("expected exactly 1 'Perf Write Load' project after running seedPerfFixture twice, got %d", writeLoadCount)
	}
}

func TestSeedPerfFixtureLastRunProjectHas120Items(t *testing.T) {
	svc := seededService(t)
	if err := seedPerfFixture(context.Background(), svc); err != nil {
		t.Fatalf("seedPerfFixture: %v", err)
	}

	ctx := adminActorCtx(t, svc)
	projects, err := svc.ListProjects(ctx)
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	var target string
	for _, p := range projects {
		if p.Name == "Perf Load 10" {
			target = p.ID
		}
	}
	if target == "" {
		t.Fatal("Perf Load 10 project not found")
	}

	runs, err := svc.ListRuns(ctx, target)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("expected 1 run for Perf Load 10, got %d", len(runs))
	}

	items, err := svc.RunItems(ctx, runs[0].ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items) != 120 {
		t.Fatalf("expected 120 run items for Perf Load 10's run, got %d", len(items))
	}
}
