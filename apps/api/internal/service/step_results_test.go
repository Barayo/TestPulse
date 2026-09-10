package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func stepResultsTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "step_results_service")))
}

// mustItemWithSteps sets up a project, a run, and a single run item pinned
// to a case with the given number of steps — the common fixture for every
// test below.
func mustItemWithSteps(t *testing.T, s *service.Service, ctx context.Context, steps int) domain.RunItem {
	t.Helper()
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "Step Results"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	content := domain.CaseContent{Title: "Multi-step", Priority: domain.PriorityMedium}
	for i := 0; i < steps; i++ {
		content.Steps = append(content.Steps, domain.Step{Action: "do it"})
	}
	c, err := s.CreateCase(ctx, p.ID, "", content)
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	return items[0]
}

// TestSetStepResultRejectsOutOfBoundsIndex covers tasks.md 4.1.
func TestSetStepResultRejectsOutOfBoundsIndex(t *testing.T) {
	s := stepResultsTestService(t)
	ctx := context.Background()
	item := mustItemWithSteps(t, s, ctx, 3)

	var verr *service.ValidationError
	if _, err := s.SetStepResult(ctx, item.ID, 3, domain.VerdictPass); !errors.As(err, &verr) {
		t.Fatalf("SetStepResult(index 3, 3 steps) = %v, want ValidationError", err)
	}
	if _, err := s.SetStepResult(ctx, item.ID, -1, domain.VerdictPass); !errors.As(err, &verr) {
		t.Fatalf("SetStepResult(negative index) = %v, want ValidationError", err)
	}

	items, err := s.RunItems(ctx, item.RunID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items[0].StepStates) != 0 {
		t.Errorf("StepStates after two rejected SetStepResult calls = %+v, want empty", items[0].StepStates)
	}
}

// TestSetStepResultPersistsAndIsReadable covers tasks.md 4.2.
func TestSetStepResultPersistsAndIsReadable(t *testing.T) {
	s := stepResultsTestService(t)
	ctx := context.Background()
	item := mustItemWithSteps(t, s, ctx, 3)

	if _, err := s.SetStepResult(ctx, item.ID, 1, domain.VerdictFailed); err != nil {
		t.Fatalf("SetStepResult: %v", err)
	}

	items, err := s.RunItems(ctx, item.RunID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items[0].StepStates) != 1 || items[0].StepStates[0].StepIndex != 1 || items[0].StepStates[0].Verdict != domain.VerdictFailed {
		t.Errorf("StepStates = %+v, want [{1 failed}]", items[0].StepStates)
	}
}

// TestRecordResultSnapshotsCurrentLiveStateWhenNotSupplied covers tasks.md
// 4.3: the interactive-UI path — steps already marked incrementally are
// copied into the new Result's snapshot.
func TestRecordResultSnapshotsCurrentLiveStateWhenNotSupplied(t *testing.T) {
	s := stepResultsTestService(t)
	ctx := context.Background()
	item := mustItemWithSteps(t, s, ctx, 3)

	if _, err := s.SetStepResult(ctx, item.ID, 0, domain.VerdictPass); err != nil {
		t.Fatalf("SetStepResult 0: %v", err)
	}
	if _, err := s.SetStepResult(ctx, item.ID, 1, domain.VerdictFailed); err != nil {
		t.Fatalf("SetStepResult 1: %v", err)
	}

	result, err := s.RecordResult(ctx, item.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed})
	if err != nil {
		t.Fatalf("RecordResult: %v", err)
	}
	if len(result.StepResults) != 2 {
		t.Fatalf("result.StepResults = %+v, want 2 entries copied from live state", result.StepResults)
	}
	if result.StepResults[0].Verdict != domain.VerdictPass || result.StepResults[1].Verdict != domain.VerdictFailed {
		t.Errorf("result.StepResults = %+v, want [pass, failed]", result.StepResults)
	}
}

// TestRecordResultWithSuppliedStepResultsSyncsLiveState covers tasks.md 4.4.
func TestRecordResultWithSuppliedStepResultsSyncsLiveState(t *testing.T) {
	s := stepResultsTestService(t)
	ctx := context.Background()
	item := mustItemWithSteps(t, s, ctx, 3)

	// Live state starts with step 0 marked pass, disagreeing with what
	// this RecordResult call is about to supply for it.
	if _, err := s.SetStepResult(ctx, item.ID, 0, domain.VerdictPass); err != nil {
		t.Fatalf("SetStepResult: %v", err)
	}

	supplied := []domain.StepResult{{StepIndex: 0, Verdict: domain.VerdictFailed}, {StepIndex: 2, Verdict: domain.VerdictSkipped}}
	result, err := s.RecordResult(ctx, item.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed, StepResults: supplied})
	if err != nil {
		t.Fatalf("RecordResult: %v", err)
	}
	if len(result.StepResults) != 2 || result.StepResults[0].Verdict != domain.VerdictFailed || result.StepResults[1].Verdict != domain.VerdictSkipped {
		t.Fatalf("result.StepResults = %+v, want the supplied values verbatim", result.StepResults)
	}

	items, err := s.RunItems(ctx, item.RunID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	live := items[0].StepStates
	if len(live) != 2 || live[0].Verdict != domain.VerdictFailed || live[1].Verdict != domain.VerdictSkipped {
		t.Errorf("live StepStates after supplied RecordResult = %+v, want synced to [failed, skipped]", live)
	}
}

// TestStepMarksCarryForwardAfterRecordingOverallVerdict covers tasks.md 4.5:
// the interactive-UI path (no StepResults supplied) must leave live step
// state untouched by RecordResult — no reset logic.
func TestStepMarksCarryForwardAfterRecordingOverallVerdict(t *testing.T) {
	s := stepResultsTestService(t)
	ctx := context.Background()
	item := mustItemWithSteps(t, s, ctx, 2)

	if _, err := s.SetStepResult(ctx, item.ID, 0, domain.VerdictPass); err != nil {
		t.Fatalf("SetStepResult: %v", err)
	}
	if _, err := s.RecordResult(ctx, item.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}); err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	items, err := s.RunItems(ctx, item.RunID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items[0].StepStates) != 1 || items[0].StepStates[0].Verdict != domain.VerdictPass {
		t.Errorf("StepStates after RecordResult = %+v, want unchanged [{0 pass}]", items[0].StepStates)
	}
}
