package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// TestFlakyCasesMixedResultsOnCurrentVersion covers add-flaky-test-detection's
// "Mixed results on the current version are flaky" scenario.
func TestFlakyCasesMixedResultsOnCurrentVersion(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	// A case's mixed results come from separate runs — a single run item
	// can only carry one status, so "pass in one run, fail in another"
	// (the same shape ExecutionsByCase already handles) is how flakiness
	// actually arises, not two items in the same run.
	run1, err := s.Runs.Create(ctx, p.ID, "run 1", []string{c.ID})
	if err != nil {
		t.Fatalf("create run1: %v", err)
	}
	items1, _ := s.Runs.Items(ctx, run1.ID, "")
	if _, err := s.Runs.AppendResult(ctx, items1[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("append pass: %v", err)
	}

	run2, err := s.Runs.Create(ctx, p.ID, "run 2", []string{c.ID})
	if err != nil {
		t.Fatalf("create run2: %v", err)
	}
	items2, _ := s.Runs.Items(ctx, run2.ID, "")
	if _, err := s.Runs.AppendResult(ctx, items2[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("append failed: %v", err)
	}

	flaky, err := s.Cases.FlakyCases(ctx, p.ID)
	if err != nil {
		t.Fatalf("FlakyCases: %v", err)
	}
	if len(flaky) != 1 {
		t.Fatalf("flaky = %+v, want exactly one flaky case", flaky)
	}
	if flaky[0].CaseKey != c.Key || flaky[0].Rate != 50 {
		t.Errorf("flaky[0] = %+v, want key %q rate 50 (1 pass, 1 fail => min(1,1)/(1+1) = 50%%)", flaky[0], c.Key)
	}
}

// TestFlakyCasesAllPassNotFlaky covers "All-pass current version is not flaky".
func TestFlakyCasesAllPassNotFlaky(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	run, err := s.Runs.Create(ctx, p.ID, "run", []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	items, _ := s.Runs.Items(ctx, run.ID, "")
	if _, err := s.Runs.AppendResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("append pass: %v", err)
	}

	flaky, err := s.Cases.FlakyCases(ctx, p.ID)
	if err != nil {
		t.Fatalf("FlakyCases: %v", err)
	}
	if len(flaky) != 0 {
		t.Errorf("flaky = %+v, want empty (all-pass is not flaky)", flaky)
	}
}

// TestFlakyCasesNeverExecutedNotFlaky covers "A case with no executions on
// its current version is not flaky".
func TestFlakyCasesNeverExecutedNotFlaky(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	mustCase(t, s, p.ID, "Never run")

	flaky, err := s.Cases.FlakyCases(ctx, p.ID)
	if err != nil {
		t.Fatalf("FlakyCases: %v", err)
	}
	if len(flaky) != 0 {
		t.Errorf("flaky = %+v, want empty", flaky)
	}
}

// TestFlakyCasesResetsOnNewVersion covers "Flakiness resets when a new
// version is created" — a case flaky on v1 has zero executions on v2, so it
// no longer counts as currently flaky.
func TestFlakyCasesResetsOnNewVersion(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	run1, err := s.Runs.Create(ctx, p.ID, "run 1", []string{c.ID})
	if err != nil {
		t.Fatalf("create run1: %v", err)
	}
	items1, _ := s.Runs.Items(ctx, run1.ID, "")
	if _, err := s.Runs.AppendResult(ctx, items1[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("append pass: %v", err)
	}

	run2, err := s.Runs.Create(ctx, p.ID, "run 2", []string{c.ID})
	if err != nil {
		t.Fatalf("create run2: %v", err)
	}
	items2, _ := s.Runs.Items(ctx, run2.ID, "")
	if _, err := s.Runs.AppendResult(ctx, items2[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("append failed: %v", err)
	}

	// Sanity: flaky on v1 before the edit.
	flaky, err := s.Cases.FlakyCases(ctx, p.ID)
	if err != nil || len(flaky) != 1 {
		t.Fatalf("expected flaky on v1, got %+v, err=%v", flaky, err)
	}

	if _, err := s.Cases.NewVersion(ctx, c.ID, defaultContent("Login works v2"), domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("new version: %v", err)
	}

	flaky, err = s.Cases.FlakyCases(ctx, p.ID)
	if err != nil {
		t.Fatalf("FlakyCases: %v", err)
	}
	if len(flaky) != 0 {
		t.Errorf("flaky = %+v, want empty — new version has no executions yet", flaky)
	}
}

// TestFlakyCasesEmptyForNoFlakyCases covers "A project with no flaky cases
// returns an empty list".
func TestFlakyCasesEmptyForNoFlakyCases(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	flaky, err := s.Cases.FlakyCases(ctx, p.ID)
	if err != nil {
		t.Fatalf("FlakyCases: %v", err)
	}
	if len(flaky) != 0 {
		t.Errorf("flaky = %+v, want empty", flaky)
	}
}
