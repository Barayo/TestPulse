package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func comparisonTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "run_comparison_service")))
}

func mustComparisonProject(t *testing.T, s *service.Service) domain.Project {
	t.Helper()
	p, err := s.CreateProject(context.Background(), service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	return p
}

func mustComparisonCase(t *testing.T, s *service.Service, projectID, title string) domain.TestCase {
	t.Helper()
	c, err := s.CreateCase(context.Background(), projectID, "", domain.CaseContent{
		Title:    title,
		Steps:    []domain.Step{{Action: "do it"}},
		Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	return c
}

// closedRunWithVerdicts creates a run over the given cases, records the
// given verdict for each (by index, matching caseIDs), and closes it.
func closedRunWithVerdicts(t *testing.T, s *service.Service, projectID, name string, caseIDs []string, verdicts []domain.Verdict) domain.Run {
	t.Helper()
	ctx := context.Background()
	run, err := s.CreateRun(ctx, projectID, service.RunInput{Name: name, CaseIDs: caseIDs})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) != len(caseIDs) {
		t.Fatalf("RunItems: %d, %v, want %d", len(items), err, len(caseIDs))
	}
	// Match items back to caseIDs by CaseID, since RunItems order isn't guaranteed.
	byCaseID := map[string]domain.RunItem{}
	for _, it := range items {
		byCaseID[it.CaseID] = it
	}
	for i, caseID := range caseIDs {
		item, ok := byCaseID[caseID]
		if !ok {
			t.Fatalf("no run item for case %s", caseID)
		}
		if _, err := s.RecordResult(ctx, item.ID, domain.NewResult{Actor: "ana", Verdict: verdicts[i]}); err != nil {
			t.Fatalf("RecordResult: %v", err)
		}
	}
	if err := s.CloseRun(ctx, run.ID); err != nil {
		t.Fatalf("CloseRun: %v", err)
	}
	got, err := s.GetRun(ctx, run.ID)
	if err != nil {
		t.Fatalf("GetRun: %v", err)
	}
	return got
}

// TestCompareRunsCategorizesTransitions covers the five categorization
// rules in one pass: a case that regressed (pass -> failed), one that
// improved (failed -> pass), one unchanged (pass -> pass), one added (only
// in the newer run), and one removed (only in the older run).
func TestCompareRunsCategorizesTransitions(t *testing.T) {
	s := comparisonTestService(t)
	ctx := context.Background()
	p := mustComparisonProject(t, s)

	regressCase := mustComparisonCase(t, s, p.ID, "regresses")
	improveCase := mustComparisonCase(t, s, p.ID, "improves")
	stableCase := mustComparisonCase(t, s, p.ID, "stable")
	removedCase := mustComparisonCase(t, s, p.ID, "removed")
	addedCase := mustComparisonCase(t, s, p.ID, "added")

	older := closedRunWithVerdicts(t, s, p.ID, "older",
		[]string{regressCase.ID, improveCase.ID, stableCase.ID, removedCase.ID},
		[]domain.Verdict{domain.VerdictPass, domain.VerdictFailed, domain.VerdictPass, domain.VerdictPass},
	)
	newer := closedRunWithVerdicts(t, s, p.ID, "newer",
		[]string{regressCase.ID, improveCase.ID, stableCase.ID, addedCase.ID},
		[]domain.Verdict{domain.VerdictFailed, domain.VerdictPass, domain.VerdictPass, domain.VerdictPass},
	)

	cmp, err := s.CompareRuns(ctx, older.ID, newer.ID)
	if err != nil {
		t.Fatalf("CompareRuns: %v", err)
	}

	if len(cmp.Regressed) != 1 || cmp.Regressed[0].CaseKey != regressCase.Key {
		t.Errorf("Regressed = %+v, want [%s]", cmp.Regressed, regressCase.Key)
	}
	if len(cmp.Improved) != 1 || cmp.Improved[0].CaseKey != improveCase.Key {
		t.Errorf("Improved = %+v, want [%s]", cmp.Improved, improveCase.Key)
	}
	if len(cmp.Unchanged) != 1 || cmp.Unchanged[0].CaseKey != stableCase.Key {
		t.Errorf("Unchanged = %+v, want [%s]", cmp.Unchanged, stableCase.Key)
	}
	if len(cmp.Added) != 1 || cmp.Added[0].CaseKey != addedCase.Key {
		t.Errorf("Added = %+v, want [%s]", cmp.Added, addedCase.Key)
	}
	if cmp.Added[0].StatusOlder != nil {
		t.Errorf("Added item StatusOlder = %v, want nil", cmp.Added[0].StatusOlder)
	}
	if len(cmp.Removed) != 1 || cmp.Removed[0].CaseKey != removedCase.Key {
		t.Errorf("Removed = %+v, want [%s]", cmp.Removed, removedCase.Key)
	}
	if cmp.Removed[0].StatusNewer != nil {
		t.Errorf("Removed item StatusNewer = %v, want nil", cmp.Removed[0].StatusNewer)
	}
}

// TestCompareRunsOrderIndependent covers design.md's rule: older/newer is
// resolved by creation time, not by which run key the caller supplies first.
func TestCompareRunsOrderIndependent(t *testing.T) {
	s := comparisonTestService(t)
	ctx := context.Background()
	p := mustComparisonProject(t, s)
	c := mustComparisonCase(t, s, p.ID, "case")

	older := closedRunWithVerdicts(t, s, p.ID, "older", []string{c.ID}, []domain.Verdict{domain.VerdictPass})
	newer := closedRunWithVerdicts(t, s, p.ID, "newer", []string{c.ID}, []domain.Verdict{domain.VerdictFailed})

	forward, err := s.CompareRuns(ctx, older.ID, newer.ID)
	if err != nil {
		t.Fatalf("CompareRuns(older, newer): %v", err)
	}
	backward, err := s.CompareRuns(ctx, newer.ID, older.ID)
	if err != nil {
		t.Fatalf("CompareRuns(newer, older): %v", err)
	}

	if forward.OlderRun.RunKey != older.Key || forward.NewerRun.RunKey != newer.Key {
		t.Errorf("forward: OlderRun=%s NewerRun=%s, want older=%s newer=%s", forward.OlderRun.RunKey, forward.NewerRun.RunKey, older.Key, newer.Key)
	}
	if backward.OlderRun.RunKey != older.Key || backward.NewerRun.RunKey != newer.Key {
		t.Errorf("backward: OlderRun=%s NewerRun=%s, want older=%s newer=%s", backward.OlderRun.RunKey, backward.NewerRun.RunKey, older.Key, newer.Key)
	}
	if len(forward.Regressed) != 1 || len(backward.Regressed) != 1 {
		t.Errorf("both directions should categorize the same regression: forward=%+v backward=%+v", forward.Regressed, backward.Regressed)
	}
}

// TestCompareRunsRejectsOpenRun covers design.md's closed-runs-only rule.
func TestCompareRunsRejectsOpenRun(t *testing.T) {
	s := comparisonTestService(t)
	ctx := context.Background()
	p := mustComparisonProject(t, s)
	c := mustComparisonCase(t, s, p.ID, "case")

	closed := closedRunWithVerdicts(t, s, p.ID, "closed", []string{c.ID}, []domain.Verdict{domain.VerdictPass})
	open, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "open", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	if _, err := s.CompareRuns(ctx, closed.ID, open.ID); err == nil {
		t.Error("CompareRuns with an open run: want error, got nil")
	}
}

// TestCompareRunsRejectsCrossProject covers design.md's same-project-only rule.
func TestCompareRunsRejectsCrossProject(t *testing.T) {
	s := comparisonTestService(t)
	p1 := mustComparisonProject(t, s)
	p2 := mustComparisonProject(t, s)
	c1 := mustComparisonCase(t, s, p1.ID, "case1")
	c2 := mustComparisonCase(t, s, p2.ID, "case2")

	run1 := closedRunWithVerdicts(t, s, p1.ID, "run1", []string{c1.ID}, []domain.Verdict{domain.VerdictPass})
	run2 := closedRunWithVerdicts(t, s, p2.ID, "run2", []string{c2.ID}, []domain.Verdict{domain.VerdictPass})

	if _, err := s.CompareRuns(context.Background(), run1.ID, run2.ID); err == nil {
		t.Error("CompareRuns across projects: want error, got nil")
	}
}

// TestCompareRunsIncludesTotalDurationWhenTimed covers
// add-run-comparison-timing: a run with at least one fully-timed result
// reports a non-nil TotalDurationMs on its comparison summary.
func TestCompareRunsIncludesTotalDurationWhenTimed(t *testing.T) {
	s := comparisonTestService(t)
	ctx := context.Background()
	p := mustComparisonProject(t, s)
	c := mustComparisonCase(t, s, p.ID, "timed case")

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "timed run", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("RunItems: %d, %v", len(items), err)
	}
	start := time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC)
	end := start.Add(4 * time.Second)
	if _, err := s.RecordResult(ctx, items[0].ID, domain.NewResult{
		Actor: "ci", Verdict: domain.VerdictPass, StartTime: &start, EndTime: &end,
	}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}
	if err := s.CloseRun(ctx, run.ID); err != nil {
		t.Fatalf("CloseRun: %v", err)
	}
	timed, err := s.GetRun(ctx, run.ID)
	if err != nil {
		t.Fatalf("GetRun: %v", err)
	}

	other := closedRunWithVerdicts(t, s, p.ID, "other run", []string{c.ID}, []domain.Verdict{domain.VerdictPass})

	cmp, err := s.CompareRuns(ctx, timed.ID, other.ID)
	if err != nil {
		t.Fatalf("CompareRuns: %v", err)
	}
	var summary domain.RunComparisonSummary
	if cmp.OlderRun.RunKey == timed.Key {
		summary = cmp.OlderRun
	} else {
		summary = cmp.NewerRun
	}
	if summary.TotalDurationMs == nil {
		t.Fatal("TotalDurationMs = nil, want a value (run has a timed result)")
	}
	want := int64(4 * time.Second / time.Millisecond)
	if *summary.TotalDurationMs != want {
		t.Errorf("TotalDurationMs = %d, want %d", *summary.TotalDurationMs, want)
	}
}

// TestCompareRunsTotalDurationNilWhenUntimed covers the "no timing data"
// state: a run whose results carry no start/end time reports a nil
// TotalDurationMs, not 0.
func TestCompareRunsTotalDurationNilWhenUntimed(t *testing.T) {
	s := comparisonTestService(t)
	ctx := context.Background()
	p := mustComparisonProject(t, s)
	c := mustComparisonCase(t, s, p.ID, "untimed case")

	older := closedRunWithVerdicts(t, s, p.ID, "older", []string{c.ID}, []domain.Verdict{domain.VerdictPass})
	newer := closedRunWithVerdicts(t, s, p.ID, "newer", []string{c.ID}, []domain.Verdict{domain.VerdictPass})

	cmp, err := s.CompareRuns(ctx, older.ID, newer.ID)
	if err != nil {
		t.Fatalf("CompareRuns: %v", err)
	}
	if cmp.OlderRun.TotalDurationMs != nil {
		t.Errorf("OlderRun.TotalDurationMs = %v, want nil", *cmp.OlderRun.TotalDurationMs)
	}
	if cmp.NewerRun.TotalDurationMs != nil {
		t.Errorf("NewerRun.TotalDurationMs = %v, want nil", *cmp.NewerRun.TotalDurationMs)
	}
}
