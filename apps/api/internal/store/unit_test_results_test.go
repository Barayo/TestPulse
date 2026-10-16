package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestUnitTestResultsImportCreatesNewIdentity(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	now := time.Now().UTC().Truncate(time.Millisecond)
	result, err := s.UnitTestResults.Import(ctx, p.ID, []store.UnitTestResultItem{
		{ClassName: "tests.test_login", Name: "test_login", Verdict: domain.VerdictPass, OccurredAt: now},
	})
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if result.Created != 1 || result.Updated != 0 {
		t.Errorf("Import result = %+v, want Created=1 Updated=0", result)
	}

	tests, _, err := s.UnitTestResults.List(ctx, p.ID, nil, "", 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(tests) != 1 {
		t.Fatalf("List = %d tests, want 1", len(tests))
	}
	got := tests[0]
	if got.ClassName != "tests.test_login" || got.Name != "test_login" {
		t.Errorf("identity = %q/%q, want tests.test_login/test_login", got.ClassName, got.Name)
	}
	if got.LastVerdict != domain.VerdictPass {
		t.Errorf("LastVerdict = %q, want pass", got.LastVerdict)
	}
}

func TestUnitTestResultsImportUpdatesExistingIdentityNotDuplicate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	first := time.Now().UTC().Add(-time.Hour).Truncate(time.Millisecond)
	second := time.Now().UTC().Truncate(time.Millisecond)

	if _, err := s.UnitTestResults.Import(ctx, p.ID, []store.UnitTestResultItem{
		{ClassName: "tests.test_login", Name: "test_login", Verdict: domain.VerdictPass, OccurredAt: first},
	}); err != nil {
		t.Fatalf("first Import: %v", err)
	}
	secondResult, err := s.UnitTestResults.Import(ctx, p.ID, []store.UnitTestResultItem{
		{ClassName: "tests.test_login", Name: "test_login", Verdict: domain.VerdictFailed, OccurredAt: second},
	})
	if err != nil {
		t.Fatalf("second Import: %v", err)
	}
	if secondResult.Created != 0 || secondResult.Updated != 1 {
		t.Errorf("second Import result = %+v, want Created=0 Updated=1", secondResult)
	}

	tests, _, err := s.UnitTestResults.List(ctx, p.ID, nil, "", 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(tests) != 1 {
		t.Fatalf("List = %d tests, want 1 (no duplicate identity)", len(tests))
	}
	if tests[0].LastVerdict != domain.VerdictFailed {
		t.Errorf("LastVerdict = %q, want failed (most recent result)", tests[0].LastVerdict)
	}

	history, err := s.UnitTestResults.History(ctx, p.ID, "tests.test_login", "test_login")
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	if len(history) != 2 {
		t.Fatalf("History = %d results, want 2", len(history))
	}
	if history[0].Verdict != domain.VerdictFailed {
		t.Errorf("History[0].Verdict = %q, want failed (newest first)", history[0].Verdict)
	}
}

func TestUnitTestResultsHistoryIsBoundedToRetentionLimit(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	const retention = 3
	// Truncated to millisecond, matching every other test in this file —
	// Postgres timestamptz only stores microsecond precision, so an
	// un-truncated time.Now() can round differently on round-trip and
	// fail an exact .Equal() comparison nondeterministically.
	base := time.Now().UTC().Add(-time.Hour).Truncate(time.Millisecond)
	for i := 0; i < retention+2; i++ {
		_, err := s.UnitTestResults.ImportWithRetention(ctx, p.ID, []store.UnitTestResultItem{
			{ClassName: "tests.test_flaky", Name: "test_flaky", Verdict: domain.VerdictPass, OccurredAt: base.Add(time.Duration(i) * time.Minute)},
		}, retention)
		if err != nil {
			t.Fatalf("Import %d: %v", i, err)
		}
	}

	history, err := s.UnitTestResults.History(ctx, p.ID, "tests.test_flaky", "test_flaky")
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	if len(history) != retention {
		t.Fatalf("History = %d results, want %d (bounded to retention)", len(history), retention)
	}
	// Oldest two results (i=0, i=1) must have been pruned; the newest
	// `retention` results survive.
	oldestSurviving := base.Add(2 * time.Minute)
	if !history[len(history)-1].OccurredAt.Equal(oldestSurviving) {
		t.Errorf("oldest surviving result OccurredAt = %v, want %v (earlier results pruned)", history[len(history)-1].OccurredAt, oldestSurviving)
	}
}

func TestUnitTestResultsImportBatchHandlesMultipleItemsInOneCall(t *testing.T) {
	// A single ingested report can carry thousands of <testcase> entries,
	// including the same (classname, name) reported more than once (a
	// rerun within one report). One Import call must handle this
	// correctly in a fixed number of round trips, not one per item.
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	earlier := time.Now().UTC().Add(-time.Minute).Truncate(time.Millisecond)
	later := time.Now().UTC().Truncate(time.Millisecond)

	result, err := s.UnitTestResults.Import(ctx, p.ID, []store.UnitTestResultItem{
		{ClassName: "tests.test_a", Name: "test_a", Verdict: domain.VerdictPass, OccurredAt: earlier},
		{ClassName: "tests.test_b", Name: "test_b", Verdict: domain.VerdictPass, OccurredAt: earlier},
		// test_a reported twice in the same batch — the later OccurredAt
		// must win for the cached last_* fields, and both results must
		// still appear in history.
		{ClassName: "tests.test_a", Name: "test_a", Verdict: domain.VerdictFailed, OccurredAt: later},
	})
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if result.Created != 2 || result.Updated != 0 {
		t.Errorf("Import result = %+v, want Created=2 Updated=0 (test_a counted once despite appearing twice)", result)
	}

	tests, _, err := s.UnitTestResults.List(ctx, p.ID, nil, "", 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(tests) != 2 {
		t.Fatalf("List = %d tests, want 2 (no duplicate identity within one batch)", len(tests))
	}
	byName := map[string]domain.UnitTest{}
	for _, ut := range tests {
		byName[ut.Name] = ut
	}
	if byName["test_a"].LastVerdict != domain.VerdictFailed {
		t.Errorf("test_a LastVerdict = %q, want failed (latest OccurredAt within the batch wins)", byName["test_a"].LastVerdict)
	}
	if byName["test_b"].LastVerdict != domain.VerdictPass {
		t.Errorf("test_b LastVerdict = %q, want pass", byName["test_b"].LastVerdict)
	}

	history, err := s.UnitTestResults.History(ctx, p.ID, "tests.test_a", "test_a")
	if err != nil {
		t.Fatalf("History: %v", err)
	}
	if len(history) != 2 {
		t.Fatalf("History(test_a) = %d results, want 2 (both batch occurrences recorded)", len(history))
	}
}

func TestUnitTestResultsListFiltersByVerdict(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	now := time.Now().UTC()

	_, err := s.UnitTestResults.Import(ctx, p.ID, []store.UnitTestResultItem{
		{ClassName: "tests.test_a", Name: "test_a", Verdict: domain.VerdictPass, OccurredAt: now},
		{ClassName: "tests.test_b", Name: "test_b", Verdict: domain.VerdictFailed, OccurredAt: now},
	})
	if err != nil {
		t.Fatalf("Import: %v", err)
	}

	failed := domain.VerdictFailed
	tests, _, err := s.UnitTestResults.List(ctx, p.ID, &failed, "", 0)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(tests) != 1 || tests[0].Name != "test_b" {
		t.Fatalf("List(verdict=failed) = %+v, want only test_b", tests)
	}
}
