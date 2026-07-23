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

	if len(cases) < 25 {
		t.Errorf("cases = %d, want at least 25", len(cases))
	}

	priorities := map[domain.Priority]bool{}
	var sawTags, sawPlatform, sawTestType, sawAutomated bool
	var multiVersionCount int
	for _, c := range cases {
		priorities[c.Content.Priority] = true
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
			multiVersionCount++
		}
	}
	for _, want := range []domain.Priority{domain.PriorityLow, domain.PriorityMedium, domain.PriorityHigh, domain.PriorityCritical} {
		if !priorities[want] {
			t.Errorf("no case uses priority %q", want)
		}
	}
	if !sawTags || !sawPlatform || !sawTestType || !sawAutomated {
		t.Errorf("classification field coverage missing: tags=%v platform=%v testType=%v automated=%v",
			sawTags, sawPlatform, sawTestType, sawAutomated)
	}
	if multiVersionCount < 2 {
		t.Errorf("cases with currentVersion > 1 = %d, want at least 2", multiVersionCount)
	}

	suites, err := svc.ListSuites(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListSuites: %v", err)
	}
	if len(suites) < 4 {
		t.Errorf("suites = %d, want at least 4", len(suites))
	}

	folders, err := svc.ListFolders(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	var sections int
	for _, f := range folders {
		if f.ParentFolderID != "" {
			sections++
		}
	}
	if sections < 5 {
		t.Errorf("sections (non-root folders) = %d, want at least 5", sections)
	}
}

// TestSeedContentHasAFlakyVersion covers "Sample Project demonstrates the
// flaky-test signal": at least one case's currently-pinned version has
// mixed pass/fail(blocked) executions, which is what VersionDetailDialog's
// real "Flaky" badge is driven by.
func TestSeedContentHasAFlakyVersion(t *testing.T) {
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

	var foundFlaky bool
	for _, c := range cases {
		execs, err := svc.CaseExecutions(actorCtx, c.ID)
		if err != nil {
			t.Fatalf("CaseExecutions(%s): %v", c.Key, err)
		}
		byVersion := map[int]map[domain.Status]bool{}
		for _, e := range execs {
			if byVersion[e.CaseVersion] == nil {
				byVersion[e.CaseVersion] = map[domain.Status]bool{}
			}
			byVersion[e.CaseVersion][e.Status] = true
		}
		for _, statuses := range byVersion {
			if statuses[domain.StatusPass] && (statuses[domain.StatusFailed] || statuses[domain.StatusBlocked]) {
				foundFlaky = true
			}
		}
	}
	if !foundFlaky {
		t.Error("no case has a version with both a pass and a failed/blocked execution — nothing shows as flaky")
	}
}

// TestSeedContentEndsOnAHealthyRun covers the project health-badge
// showcase: the chronologically LAST-created run is the one that
// determines the project's shown pass rate.
func TestSeedContentEndsOnAHealthyRun(t *testing.T) {
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
	if len(runs) == 0 {
		t.Fatal("no runs seeded")
	}
	// ListRuns orders newest first.
	latest := runs[0]

	items, err := svc.RunItems(actorCtx, latest.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items) == 0 {
		t.Fatalf("latest run %q has no items", latest.Name)
	}
	var passCount int
	for _, it := range items {
		if it.CurrentStatus == domain.StatusPass {
			passCount++
		}
	}
	rate := float64(passCount) / float64(len(items)) * 100
	if rate < 85 {
		t.Errorf("latest run %q pass rate = %.0f%%, want at least 85%%", latest.Name, rate)
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

// TestSeedContentShowcasesResultActorLink covers link-result-actor-to-
// identity: the seed must demonstrate both new paths it adds — a result
// that defaults its actor from the seeding actor (real actorKind/ref, no
// client override) and a result with an explicit override display name
// that still carries the real actor link underneath it.
func TestSeedContentShowcasesResultActorLink(t *testing.T) {
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

	users, err := svc.ListUsers(actorCtx)
	if err != nil || len(users) == 0 {
		t.Fatalf("ListUsers: %v, %d users", err, len(users))
	}
	adminEmail := users[0].Email

	var sawDefaulted, sawOverride bool
	for _, r := range runs {
		items, err := svc.RunItems(actorCtx, r.ID, "")
		if err != nil {
			t.Fatalf("RunItems: %v", err)
		}
		for _, item := range items {
			results, err := svc.Results(actorCtx, item.ID)
			if err != nil {
				t.Fatalf("Results: %v", err)
			}
			for _, res := range results {
				if res.ActorKind != domain.ResultActorUser || res.ActorRefID == "" {
					continue
				}
				if res.Actor == adminEmail {
					sawDefaulted = true
				} else {
					sawOverride = true
				}
			}
		}
	}
	if !sawDefaulted {
		t.Error("no seeded result defaults its actor from the seeding actor (real actorKind/ref, no override)")
	}
	if !sawOverride {
		t.Error("no seeded result carries an override display name with the real actor link still populated")
	}
}
