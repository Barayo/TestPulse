package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestProjectSummariesCountsSuitesAndCases(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	mustCase(t, s, p.ID, "one")
	mustCase(t, s, p.ID, "two")
	if _, err := s.Suites.Create(ctx, p.ID, "smoke"); err != nil {
		t.Fatalf("create suite: %v", err)
	}

	summaries, err := s.Projects.Summaries(ctx)
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
	p := mustProject(t, s)
	mustCase(t, s, p.ID, "one")

	summaries, err := s.Projects.Summaries(ctx)
	if err != nil {
		t.Fatalf("Summaries: %v", err)
	}
	if summaries[0].PassRate != nil {
		t.Errorf("PassRate = %v, want nil", summaries[0].PassRate)
	}
}

func TestProjectSummariesPassRateReflectsLatestRunOnly(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
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
		if _, err := s.Runs.AppendResult(ctx, it.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}); err != nil {
			t.Fatal(err)
		}
	}

	// Newer run: both pass (100% pass) — must be what Summaries reports.
	newRun, err := s.Runs.Create(ctx, p.ID, "new run", []string{c1.ID, c2.ID})
	if err != nil {
		t.Fatalf("create new run: %v", err)
	}
	newItems, _ := s.Runs.Items(ctx, newRun.ID, "")
	for _, it := range newItems {
		if _, err := s.Runs.AppendResult(ctx, it.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}); err != nil {
			t.Fatal(err)
		}
	}

	summaries, err := s.Projects.Summaries(ctx)
	if err != nil {
		t.Fatalf("Summaries: %v", err)
	}
	if summaries[0].PassRate == nil || *summaries[0].PassRate != 100 {
		t.Errorf("PassRate = %v, want 100 (from the newer run only)", summaries[0].PassRate)
	}
}

func TestProjectSummariesExcludesArchivedProjects(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	if err := s.Projects.Archive(ctx, p.ID); err != nil {
		t.Fatalf("archive: %v", err)
	}

	summaries, err := s.Projects.Summaries(ctx)
	if err != nil {
		t.Fatalf("Summaries: %v", err)
	}
	if len(summaries) != 0 {
		t.Errorf("Summaries = %+v, want empty (archived project excluded)", summaries)
	}
}
