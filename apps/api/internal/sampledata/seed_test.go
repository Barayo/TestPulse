package sampledata_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/sampledata"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func seededService(t *testing.T) *service.Service {
	t.Helper()
	svc := service.New(store.New(testutil.Pool(t, "sampledata")))
	if err := svc.BootstrapAdmin(context.Background(), "admin@example.com", "correcthorse1"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	return svc
}

// adminActorCtx mirrors what a real HTTP request from the bootstrap admin
// would carry, for read calls the test makes directly (Seed constructs its
// own internally).
func adminActorCtx(t *testing.T, svc *service.Service) context.Context {
	t.Helper()
	users, err := svc.ListUsers(context.Background())
	if err != nil || len(users) == 0 {
		t.Fatalf("ListUsers: %v, %d users", err, len(users))
	}
	u := users[0]
	return domain.WithActor(context.Background(), domain.Actor{
		ID: u.ID, Kind: domain.ActorKindUser, DisplayName: u.Email,
		EffectiveUserID: u.ID, IsTenantAdmin: u.IsTenantAdmin,
	})
}

func TestSeedCreatesExactlyOneSampleProject(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()

	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}

	actorCtx := adminActorCtx(t, svc)
	projects, err := svc.ListProjects(actorCtx)
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(projects) != 1 {
		t.Fatalf("projects = %d, want 1", len(projects))
	}
	p := projects[0]
	if !p.IsSample {
		t.Error("seeded project IsSample = false, want true")
	}
	if p.Name != "Sample Project" {
		t.Errorf("seeded project Name = %q, want %q", p.Name, "Sample Project")
	}
}

func TestSeedContentCoversClassificationFieldsAndVersioning(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	cases, err := svc.ListCases(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("no cases seeded")
	}

	var sawPriority, sawTags, sawPlatform, sawTestType, sawAutomated, sawMultiVersion bool
	for _, c := range cases {
		if c.Content.Priority != "" {
			sawPriority = true
		}
		if len(c.Content.Tags) > 0 {
			sawTags = true
		}
		if c.Content.Platform != "" {
			sawPlatform = true
		}
		if c.Content.TestType != "" {
			sawTestType = true
		}
		if c.Content.Automated {
			sawAutomated = true
		}
		if c.CurrentVersion > 1 {
			sawMultiVersion = true
		}
	}
	if !sawPriority || !sawTags || !sawPlatform || !sawTestType || !sawAutomated {
		t.Errorf("classification field coverage missing: priority=%v tags=%v platform=%v testType=%v automated=%v",
			sawPriority, sawTags, sawPlatform, sawTestType, sawAutomated)
	}
	if !sawMultiVersion {
		t.Error("no case has currentVersion > 1 — version history has nothing to show")
	}

	suites, err := svc.ListSuites(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListSuites: %v", err)
	}
	if len(suites) < 2 {
		t.Errorf("suites = %d, want at least 2", len(suites))
	}
}

func TestSeedContentCoversRunLifecycleAndImport(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	runs, err := svc.ListRuns(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	var sawOpen, sawClosed bool
	for _, r := range runs {
		switch r.Status {
		case domain.RunStatusOpen:
			sawOpen = true
		case domain.RunStatusClosed:
			sawClosed = true
		}
	}
	if !sawOpen {
		t.Error("no open run seeded")
	}
	if !sawClosed {
		t.Error("no closed run seeded")
	}
	if len(runs) < 3 {
		t.Errorf("runs = %d, want at least 3 (open, closed, imported)", len(runs))
	}

	// At least one run must have items carrying a testName (the importer's
	// signature) and at least one recorded result must have a nonempty
	// platform/version — the import's execution metadata.
	var sawTestName, sawExecutionMetadata bool
	for _, r := range runs {
		items, err := svc.RunItems(actorCtx, r.ID, "")
		if err != nil {
			t.Fatalf("RunItems: %v", err)
		}
		for _, item := range items {
			if item.TestName != "" {
				sawTestName = true
			}
			results, err := svc.Results(actorCtx, item.ID)
			if err != nil {
				t.Fatalf("Results: %v", err)
			}
			for _, res := range results {
				if res.Platform != "" || res.Version != "" {
					sawExecutionMetadata = true
				}
			}
		}
	}
	if !sawTestName {
		t.Error("no run item carries a testName — the imported run isn't distinguishable")
	}
	if !sawExecutionMetadata {
		t.Error("no result carries platform/version — the import's execution metadata isn't visible")
	}
}
