package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestProjectSummariesCountsSuitesAndCases(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	caller := mustUser(t, s, "stats-caller-1@b.com", false)
	p := mustProject(t, s)
	mustCase(t, s, p.ID, "one")
	mustCase(t, s, p.ID, "two")
	if _, err := s.Suites.Create(ctx, p.ID, "smoke"); err != nil {
		t.Fatalf("create suite: %v", err)
	}

	summaries, err := s.Projects.Summaries(ctx, caller.ID)
	if err != nil {
		t.Fatalf("Summaries: %v", err)
	}
	if len(summaries) != 1 {
		t.Fatalf("Summaries = %d entries, want 1", len(summaries))
	}
	got := summaries[0]
	if got.ProjectID != p.ID || got.SuiteCount != 1 || got.CaseCount != 2 {
		t.Errorf("summary = %+v", got)
	}
}

func TestProjectSummariesPassRateNullWithNoRuns(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	caller := mustUser(t, s, "stats-caller-2@b.com", false)
	p := mustProject(t, s)
	mustCase(t, s, p.ID, "one")

	summaries, err := s.Projects.Summaries(ctx, caller.ID)
	if err != nil {
		t.Fatalf("Summaries: %v", err)
	}
	if summaries[0].PassRate != nil {
		t.Errorf("PassRate = %v, want nil", summaries[0].PassRate)
	}
	if summaries[0].LastRunAt != nil {
		t.Errorf("LastRunAt = %v, want nil with no runs", summaries[0].LastRunAt)
	}
}

func TestProjectSummariesLastRunAtReflectsLatestRun(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	caller := mustUser(t, s, "stats-caller-5@b.com", false)
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")

	if _, err := s.Runs.Create(ctx, p.ID, "old run", []string{c1.ID}); err != nil {
		t.Fatalf("create old run: %v", err)
	}
	newRun, err := s.Runs.Create(ctx, p.ID, "new run", []string{c1.ID})
	if err != nil {
		t.Fatalf("create new run: %v", err)
	}

	summaries, err := s.Projects.Summaries(ctx, caller.ID)
	if err != nil {
		t.Fatalf("Summaries: %v", err)
	}
	if summaries[0].LastRunAt == nil {
		t.Fatal("LastRunAt = nil, want the newer run's timestamp")
	}
	newRunFull, err := s.Runs.Get(ctx, newRun.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !summaries[0].LastRunAt.Equal(newRunFull.CreatedAt) {
		t.Errorf("LastRunAt = %v, want %v (the newer run)", summaries[0].LastRunAt, newRunFull.CreatedAt)
	}
}

// TestProjectSummariesPassRateAggregatesAcrossAllRuns: reversed from its
// original intent (fix-project-landing-pass-rate-aggregation, #221) — the
// landing summary strip's own label says "Pass rate across all suites,"
// but the query behind it previously computed the rate from only the
// single most recently created run, which could (and did, on the real
// Sample Project) show a misleading badge that contradicted the Reports
// panel's genuinely-aggregated number two inches below it on the same
// page. PassRate must now aggregate every run's items for the project,
// matching ProjectStatusSummary's (the Reports teaser's) semantics.
func TestProjectSummariesPassRateAggregatesAcrossAllRuns(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	caller := mustUser(t, s, "stats-caller-3@b.com", false)
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")
	c2 := mustCase(t, s, p.ID, "two")

	// Older run: both fail (0% pass).
	oldRun, err := s.Runs.Create(ctx, p.ID, "old run", []string{c1.ID, c2.ID})
	if err != nil {
		t.Fatalf("create old run: %v", err)
	}
	oldItems, _ := s.Runs.Items(ctx, oldRun.ID, "")
	for _, it := range oldItems {
		if _, err := s.Runs.AppendResult(ctx, it.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, ""); err != nil {
			t.Fatal(err)
		}
	}

	// Newer run: both pass (100% pass) — the old buggy query reported this
	// run alone; the correct aggregate across both runs is 2/4 = 50%.
	newRun, err := s.Runs.Create(ctx, p.ID, "new run", []string{c1.ID, c2.ID})
	if err != nil {
		t.Fatalf("create new run: %v", err)
	}
	newItems, _ := s.Runs.Items(ctx, newRun.ID, "")
	for _, it := range newItems {
		if _, err := s.Runs.AppendResult(ctx, it.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
			t.Fatal(err)
		}
	}

	summaries, err := s.Projects.Summaries(ctx, caller.ID)
	if err != nil {
		t.Fatalf("Summaries: %v", err)
	}
	if summaries[0].PassRate == nil || *summaries[0].PassRate != 50 {
		t.Errorf("PassRate = %v, want 50 (aggregated across both runs, not just the newer one)", summaries[0].PassRate)
	}
}

// TestProjectSummariesIncludesArchivedProjects: reversed from its original
// intent (add-data-retention design.md D7) — the delete-project
// confirmation dialog needs real counts for a project that IS archived
// (deletion requires archiving first), so Summaries no longer excludes
// archived projects; it marks them via the new Archived field instead.
func TestProjectSummariesIncludesArchivedProjects(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	caller := mustUser(t, s, "stats-caller-4@b.com", false)
	p := mustProject(t, s)
	if err := s.Projects.Archive(ctx, p.ID); err != nil {
		t.Fatalf("archive: %v", err)
	}

	summaries, err := s.Projects.Summaries(ctx, caller.ID)
	if err != nil {
		t.Fatalf("Summaries: %v", err)
	}
	if len(summaries) != 1 || summaries[0].ProjectID != p.ID || !summaries[0].Archived {
		t.Errorf("Summaries = %+v, want one entry for the archived project with Archived: true", summaries)
	}
}
