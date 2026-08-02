package store_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func testStore(t *testing.T) *store.Store {
	t.Helper()
	return store.New(testutil.Pool(t, "store"))
}

func mustProject(t *testing.T, s *store.Store) domain.Project {
	t.Helper()
	p, err := s.Projects.Create(context.Background(), "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	return p
}

func defaultContent(title string) domain.CaseContent {
	return domain.CaseContent{
		Title:    title,
		Steps:    []domain.Step{{Action: "open login page", Expected: "form visible"}},
		Priority: domain.PriorityMedium,
	}
}

// mustCase creates a case with no explicit folder — every existing test
// exercises the "defaults to the project's root folder" behavior for free.
func mustCase(t *testing.T, s *store.Store, projectID, title string) domain.TestCase {
	t.Helper()
	c, err := s.Cases.Create(context.Background(), projectID, "", defaultContent(title))
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	return c
}

// --- Human-readable keys (add-human-readable-keys, task 4.3) ---

func TestCaseRunSuiteKeysAreSequentialAndPrefixed(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p, err := s.Projects.Create(ctx, "Login Service", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	c1 := mustCase(t, s, p.ID, "case one")
	if c1.Key != "LS-1" {
		t.Errorf("first case Key = %q, want %q", c1.Key, "LS-1")
	}
	c2 := mustCase(t, s, p.ID, "case two")
	if c2.Key != "LS-2" {
		t.Errorf("second case Key = %q, want %q", c2.Key, "LS-2")
	}

	run, err := s.Runs.Create(ctx, p.ID, "sprint 1", nil)
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	if run.Key != "LS-R1" {
		t.Errorf("run Key = %q, want %q (not LS-3 — runs count independently of cases)", run.Key, "LS-R1")
	}

	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}
	if suite.Key != "LS-S1" {
		t.Errorf("suite Key = %q, want %q", suite.Key, "LS-S1")
	}
}

func TestConcurrentCaseCreationYieldsDistinctKeys(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p, err := s.Projects.Create(ctx, "Concurrency", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	const n = 10
	keys := make(chan string, n)
	errs := make(chan error, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c, err := s.Cases.Create(ctx, p.ID, "", defaultContent("concurrent case"))
			if err != nil {
				errs <- err
				return
			}
			keys <- c.Key
		}()
	}
	wg.Wait()
	close(keys)
	close(errs)

	for err := range errs {
		t.Fatalf("concurrent create failed: %v", err)
	}
	seen := map[string]bool{}
	for k := range keys {
		if seen[k] {
			t.Errorf("duplicate key %q assigned under concurrent creation", k)
		}
		seen[k] = true
	}
	if len(seen) != n {
		t.Errorf("got %d distinct keys, want %d", len(seen), n)
	}
}

func TestIDByKeyResolvesOrNotFound(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p, err := s.Projects.Create(ctx, "Resolve Me", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	c := mustCase(t, s, p.ID, "a case")
	run, _ := s.Runs.Create(ctx, p.ID, "a run", nil)
	suite, _ := s.Suites.Create(ctx, p.ID, "a suite")

	if id, err := s.Projects.IDByKey(ctx, p.Key); err != nil || id != p.ID {
		t.Errorf("Projects.IDByKey(%q) = %q, %v; want %q, nil", p.Key, id, err, p.ID)
	}
	if id, err := s.Cases.IDByKey(ctx, c.Key); err != nil || id != c.ID {
		t.Errorf("Cases.IDByKey(%q) = %q, %v; want %q, nil", c.Key, id, err, c.ID)
	}
	if id, err := s.Runs.IDByKey(ctx, run.Key); err != nil || id != run.ID {
		t.Errorf("Runs.IDByKey(%q) = %q, %v; want %q, nil", run.Key, id, err, run.ID)
	}
	if id, err := s.Suites.IDByKey(ctx, suite.Key); err != nil || id != suite.ID {
		t.Errorf("Suites.IDByKey(%q) = %q, %v; want %q, nil", suite.Key, id, err, suite.ID)
	}

	if _, err := s.Projects.IDByKey(ctx, "NOPE"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Projects.IDByKey(unknown) = %v, want ErrNotFound", err)
	}
	if _, err := s.Cases.IDByKey(ctx, "NOPE-1"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Cases.IDByKey(unknown) = %v, want ErrNotFound", err)
	}
	if _, err := s.Runs.IDByKey(ctx, "NOPE-R1"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Runs.IDByKey(unknown) = %v, want ErrNotFound", err)
	}
	if _, err := s.Suites.IDByKey(ctx, "NOPE-S1"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Suites.IDByKey(unknown) = %v, want ErrNotFound", err)
	}
}

func TestKeyCountersAreScopedPerProject(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p1, err := s.Projects.Create(ctx, "Alpha", "")
	if err != nil {
		t.Fatalf("create project 1: %v", err)
	}
	p2, err := s.Projects.Create(ctx, "Beta", "")
	if err != nil {
		t.Fatalf("create project 2: %v", err)
	}

	mustCase(t, s, p1.ID, "p1 case")
	c := mustCase(t, s, p2.ID, "p2 first case")
	if c.Key != "BETA-1" {
		t.Errorf("p2's first case Key = %q, want %q (independent of p1's counter)", c.Key, "BETA-1")
	}
}

// --- Projects (task 2.1) ---

func TestProjectCreateAssignsDerivedUniqueKey(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	p1, err := s.Projects.Create(ctx, "Login Service", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	if p1.Key != "LS" {
		t.Errorf("Key = %q, want %q", p1.Key, "LS")
	}

	// A second project whose derived key collides gets a numeric suffix.
	p2, err := s.Projects.Create(ctx, "Loan Servicing", "")
	if err != nil {
		t.Fatalf("create colliding project: %v", err)
	}
	if p2.Key != "LS2" {
		t.Errorf("Key = %q, want %q", p2.Key, "LS2")
	}

	p3, err := s.Projects.Create(ctx, "Lucky Streak", "")
	if err != nil {
		t.Fatalf("create second colliding project: %v", err)
	}
	if p3.Key != "LS3" {
		t.Errorf("Key = %q, want %q", p3.Key, "LS3")
	}
}

func TestProjectLifecycle(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	p := mustProject(t, s)
	list, err := s.Projects.List(ctx)
	if err != nil || len(list) != 1 || list[0].Name != "QA" {
		t.Fatalf("List = %v, %v; want 1 project named QA", list, err)
	}

	if err := s.Projects.Rename(ctx, p.ID, "QA Platform"); err != nil {
		t.Fatalf("rename: %v", err)
	}
	if err := s.Projects.Archive(ctx, p.ID); err != nil {
		t.Fatalf("archive: %v", err)
	}
	list, _ = s.Projects.List(ctx)
	if len(list) != 1 || list[0].Name != "QA Platform" || !list[0].Archived {
		t.Errorf("after rename+archive: %+v", list)
	}
}

// --- Cases and versioning (task 2.2) ---

func TestCaseCreateStartsAtVersionOne(t *testing.T) {
	s := testStore(t)
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	if c.CurrentVersion != 1 {
		t.Errorf("CurrentVersion = %d, want 1", c.CurrentVersion)
	}
	if c.Content.Title != "Login works" {
		t.Errorf("Content.Title = %q", c.Content.Title)
	}
}

func TestEditingCreatesNewVersionAndPreservesOld(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	edited := c.Content
	edited.Steps = []domain.Step{{Action: "changed step"}}
	c2, err := s.Cases.NewVersion(ctx, c.ID, edited)
	if err != nil {
		t.Fatalf("NewVersion: %v", err)
	}
	if c2.CurrentVersion != 2 {
		t.Errorf("CurrentVersion = %d, want 2", c2.CurrentVersion)
	}

	versions, err := s.Cases.Versions(ctx, c.ID)
	if err != nil || len(versions) != 2 {
		t.Fatalf("Versions = %d entries, %v; want 2", len(versions), err)
	}
	if versions[0].Content.Steps[0].Action != "open login page" {
		t.Errorf("v1 content changed: %+v", versions[0].Content.Steps)
	}
	if versions[1].Content.Steps[0].Action != "changed step" {
		t.Errorf("v2 content wrong: %+v", versions[1].Content.Steps)
	}
}

func TestCaseClassificationFieldsDefaultWhenOmitted(t *testing.T) {
	s := testStore(t)
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	if c.Content.Platform != "" || c.Content.TestType != "" || c.Content.Automated {
		t.Errorf("Content = %+v, want empty platform/testType and automated=false", c.Content)
	}
}

func TestCaseClassificationFieldsRoundTripOnCreateAndUpdate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	content := defaultContent("Login works")
	content.Platform = "web"
	content.TestType = "e2e"
	content.Automated = true
	c, err := s.Cases.Create(ctx, p.ID, "", content)
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	if c.Content.Platform != "web" || c.Content.TestType != "e2e" || !c.Content.Automated {
		t.Fatalf("Content after create = %+v, want platform=web testType=e2e automated=true", c.Content)
	}

	got, err := s.Cases.Get(ctx, c.ID)
	if err != nil {
		t.Fatalf("get case: %v", err)
	}
	if got.Content.Platform != "web" || got.Content.TestType != "e2e" || !got.Content.Automated {
		t.Fatalf("Content after Get = %+v, want platform=web testType=e2e automated=true", got.Content)
	}

	edited := got.Content
	edited.Platform = "iOS"
	edited.TestType = "unit"
	edited.Automated = false
	c2, err := s.Cases.NewVersion(ctx, c.ID, edited)
	if err != nil {
		t.Fatalf("new version: %v", err)
	}
	if c2.Content.Platform != "iOS" || c2.Content.TestType != "unit" || c2.Content.Automated {
		t.Fatalf("Content after NewVersion = %+v, want platform=iOS testType=unit automated=false", c2.Content)
	}
}

func TestSoftDeleteHidesFromListKeepsVersions(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	if err := s.Cases.SoftDelete(ctx, c.ID); err != nil {
		t.Fatalf("SoftDelete: %v", err)
	}
	list, _ := s.Cases.List(ctx, p.ID)
	if len(list) != 0 {
		t.Errorf("deleted case still listed: %+v", list)
	}
	versions, err := s.Cases.Versions(ctx, c.ID)
	if err != nil || len(versions) != 1 {
		t.Errorf("versions of deleted case unreadable: %d, %v", len(versions), err)
	}
}

// --- Suites (task 2.3) ---

func TestSuiteMembership(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "case one")
	c2 := mustCase(t, s, p.ID, "case two")

	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}
	for _, id := range []string{c1.ID, c2.ID} {
		if err := s.Suites.AddCase(ctx, suite.ID, id); err != nil {
			t.Fatalf("AddCase: %v", err)
		}
	}
	got, _ := s.Suites.Get(ctx, suite.ID)
	if len(got.CaseIDs) != 2 {
		t.Fatalf("suite has %d cases, want 2", len(got.CaseIDs))
	}

	if err := s.Suites.RemoveCase(ctx, suite.ID, c1.ID); err != nil {
		t.Fatalf("RemoveCase: %v", err)
	}
	got, _ = s.Suites.Get(ctx, suite.ID)
	if len(got.CaseIDs) != 1 || got.CaseIDs[0] != c2.ID {
		t.Errorf("after removal: %+v", got.CaseIDs)
	}
	// Removing from suite must not delete the case.
	cases, _ := s.Cases.List(ctx, p.ID)
	if len(cases) != 2 {
		t.Errorf("case deleted by suite removal: %d cases", len(cases))
	}
}

func TestSuitePassRateNullWithNoRuns(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}

	got, err := s.Suites.Get(ctx, suite.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.PassRate != nil {
		t.Errorf("PassRate = %v, want nil with no runs", got.PassRate)
	}
	if got.LastRunAt != nil {
		t.Errorf("LastRunAt = %v, want nil with no runs", got.LastRunAt)
	}

	list, err := s.Suites.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if list[0].PassRate != nil {
		t.Errorf("List PassRate = %v, want nil", list[0].PassRate)
	}
}

func TestSuitePassRateReflectsLatestRunOnly(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "one")
	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}

	oldRun, err := s.Runs.CreateWithSuite(ctx, p.ID, "old run", suite.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create old run: %v", err)
	}
	oldItems, _ := s.Runs.Items(ctx, oldRun.ID, "")
	if _, err := s.Runs.AppendResult(ctx, oldItems[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatal(err)
	}

	newRun, err := s.Runs.CreateWithSuite(ctx, p.ID, "new run", suite.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create new run: %v", err)
	}
	newItems, _ := s.Runs.Items(ctx, newRun.ID, "")
	if _, err := s.Runs.AppendResult(ctx, newItems[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatal(err)
	}

	got, err := s.Suites.Get(ctx, suite.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.PassRate == nil || *got.PassRate != 100 {
		t.Errorf("Get PassRate = %v, want 100 (from the newer run only)", got.PassRate)
	}

	newRunFull, err := s.Runs.Get(ctx, newRun.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.LastRunAt == nil || !got.LastRunAt.Equal(newRunFull.CreatedAt) {
		t.Errorf("Get LastRunAt = %v, want %v", got.LastRunAt, newRunFull.CreatedAt)
	}

	list, err := s.Suites.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if list[0].PassRate == nil || *list[0].PassRate != 100 {
		t.Errorf("List PassRate = %v, want 100", list[0].PassRate)
	}
}

func TestSuitePassRateIndependentAcrossSuites(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "one")
	suiteA, err := s.Suites.Create(ctx, p.ID, "suite a")
	if err != nil {
		t.Fatalf("create suite a: %v", err)
	}
	suiteB, err := s.Suites.Create(ctx, p.ID, "suite b")
	if err != nil {
		t.Fatalf("create suite b: %v", err)
	}

	runA, err := s.Runs.CreateWithSuite(ctx, p.ID, "run a", suiteA.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create run a: %v", err)
	}
	itemsA, _ := s.Runs.Items(ctx, runA.ID, "")
	if _, err := s.Runs.AppendResult(ctx, itemsA[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatal(err)
	}

	// suiteB has no runs — must stay nil, not pick up suiteA's rate.
	list, err := s.Suites.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	byID := map[string]domain.Suite{}
	for _, sui := range list {
		byID[sui.ID] = sui
	}
	if byID[suiteA.ID].PassRate == nil || *byID[suiteA.ID].PassRate != 100 {
		t.Errorf("suiteA PassRate = %v, want 100", byID[suiteA.ID].PassRate)
	}
	if byID[suiteB.ID].PassRate != nil {
		t.Errorf("suiteB PassRate = %v, want nil (no runs of its own)", byID[suiteB.ID].PassRate)
	}
}

func TestRenameSuite(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}

	renamed, err := s.Suites.Rename(ctx, suite.ID, "smoke v2")
	if err != nil {
		t.Fatalf("Rename: %v", err)
	}
	if renamed.Name != "smoke v2" {
		t.Errorf("Rename returned name %q, want %q", renamed.Name, "smoke v2")
	}

	got, _ := s.Suites.Get(ctx, suite.ID)
	if got.Name != "smoke v2" {
		t.Errorf("suite name after rename: %q, want %q", got.Name, "smoke v2")
	}
}

func TestDeleteSuitePreservesCases(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}
	if err := s.Suites.AddCase(ctx, suite.ID, c.ID); err != nil {
		t.Fatalf("AddCase: %v", err)
	}

	if err := s.Suites.Delete(ctx, suite.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := s.Suites.Get(ctx, suite.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get after delete: err=%v, want ErrNotFound", err)
	}
	cases, _ := s.Cases.List(ctx, p.ID)
	if len(cases) != 1 {
		t.Errorf("case deleted by suite deletion: %d cases", len(cases))
	}
}

func TestDeleteSuiteClearsRunReference(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}
	run, err := s.Runs.CreateWithSuite(ctx, p.ID, "a run", suite.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}

	if err := s.Suites.Delete(ctx, suite.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	got, err := s.Runs.Get(ctx, run.ID)
	if err != nil {
		t.Fatalf("Runs.Get: %v", err)
	}
	if got.SuiteKey != nil {
		t.Errorf("run.SuiteKey after suite delete: %v, want nil", *got.SuiteKey)
	}
}

// --- Runs (task 2.4) ---

func TestRunPinsVersionAtCreation(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	run, err := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}

	// Edit the case after run creation → run item must stay pinned to v1.
	edited := c.Content
	edited.Title = "Login works (edited)"
	if _, err := s.Cases.NewVersion(ctx, c.ID, edited); err != nil {
		t.Fatalf("NewVersion: %v", err)
	}

	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("Items = %d, %v; want 1", len(items), err)
	}
	item := items[0]
	if item.CaseVersion != 1 {
		t.Errorf("pinned version = %d, want 1", item.CaseVersion)
	}
	if item.Content.Title != "Login works" {
		t.Errorf("pinned content = %q, want original", item.Content.Title)
	}
	if item.CaseKey != c.Key {
		t.Errorf("item.CaseKey = %q, want %q", item.CaseKey, c.Key)
	}
	if !item.NewerVersion {
		t.Error("NewerVersion = false, want true after edit")
	}
	if item.CurrentStatus != domain.StatusPending {
		t.Errorf("initial status = %q, want pending", item.CurrentStatus)
	}
}

// TestRunRecordsSourceSuite covers link-runs-to-suite's "A run created from
// a suite records that suite" scenario.
func TestRunRecordsSourceSuite(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}

	run, err := s.Runs.CreateWithSuite(ctx, p.ID, "sprint 1", suite.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	if run.SuiteKey == nil || *run.SuiteKey != suite.Key {
		t.Fatalf("SuiteKey = %v, want %q", run.SuiteKey, suite.Key)
	}

	got, err := s.Runs.Get(ctx, run.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.SuiteKey == nil || *got.SuiteKey != suite.Key {
		t.Fatalf("Get().SuiteKey = %v, want %q", got.SuiteKey, suite.Key)
	}
}

// TestRunWithoutSuiteHasNoSuiteKey covers link-runs-to-suite's "A run
// created without a suite has no suite reference" scenario.
func TestRunWithoutSuiteHasNoSuiteKey(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	run, err := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	if run.SuiteKey != nil {
		t.Errorf("SuiteKey = %v, want nil", run.SuiteKey)
	}

	got, err := s.Runs.Get(ctx, run.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.SuiteKey != nil {
		t.Errorf("Get().SuiteKey = %v, want nil", got.SuiteKey)
	}

	runs, err := s.Runs.List(ctx, p.ID)
	if err != nil || len(runs) != 1 {
		t.Fatalf("List = %d, %v; want 1", len(runs), err)
	}
	if runs[0].SuiteKey != nil {
		t.Errorf("List()[0].SuiteKey = %v, want nil", runs[0].SuiteKey)
	}
}

// TestListRunsIncludesPassRate covers group-runs-by-status's requirement
// that the runs list carries a cheap, server-computed pass rate per run
// (one aggregate query, not a round trip per run) so the UI can render a
// health indicator without N+1 calls.
func TestListRunsIncludesPassRate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "Login works")
	c2 := mustCase(t, s, p.ID, "Checkout works")

	mixed, err := s.Runs.Create(ctx, p.ID, "mixed", []string{c1.ID, c2.ID})
	if err != nil {
		t.Fatalf("create mixed run: %v", err)
	}
	items, _ := s.Runs.Items(ctx, mixed.ID, "")
	if _, err := s.Runs.AppendResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("AppendResult pass: %v", err)
	}
	if _, err := s.Runs.AppendResult(ctx, items[1].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("AppendResult failed: %v", err)
	}

	empty, err := s.Runs.Create(ctx, p.ID, "empty", nil)
	if err != nil {
		t.Fatalf("create empty run: %v", err)
	}

	runs, err := s.Runs.List(ctx, p.ID)
	if err != nil || len(runs) != 2 {
		t.Fatalf("List = %d, %v; want 2", len(runs), err)
	}
	byID := map[string]domain.Run{}
	for _, r := range runs {
		byID[r.ID] = r
	}
	if byID[mixed.ID].PassRate == nil || *byID[mixed.ID].PassRate != 50 {
		t.Errorf("mixed run PassRate = %v, want 50", byID[mixed.ID].PassRate)
	}
	if byID[empty.ID].PassRate != nil {
		t.Errorf("empty run PassRate = %v, want nil (no items)", byID[empty.ID].PassRate)
	}
}

// TestDeletingSuiteClearsRunReference covers link-runs-to-suite's "Deleting
// a suite does not affect runs created from it" scenario.
func TestDeletingSuiteClearsRunReference(t *testing.T) {
	// testutil.Pool resets the schema on every call, so this test must
	// reuse a single pool throughout rather than calling testStore(t)
	// (which would call it once) and testutil.Pool again separately.
	pool := testutil.Pool(t, "store")
	s := store.New(pool)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}
	run, err := s.Runs.CreateWithSuite(ctx, p.ID, "sprint 1", suite.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}

	// No service-level suite-delete exists yet — exercise the FK's
	// ON DELETE SET NULL constraint directly.
	if _, err := pool.Exec(ctx, `DELETE FROM test_suites WHERE id = $1`, suite.ID); err != nil {
		t.Fatalf("delete suite: %v", err)
	}

	got, err := s.Runs.Get(ctx, run.ID)
	if err != nil {
		t.Fatalf("Get after suite deletion: %v", err)
	}
	if got.SuiteKey != nil {
		t.Errorf("SuiteKey after suite deletion = %v, want nil", got.SuiteKey)
	}
	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("run items unaffected: %d, %v; want 1", len(items), err)
	}
}

// TestNewRunStartsOpen covers add-run-lifecycle-status's "New run starts
// open" scenario.
func TestNewRunStartsOpen(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	run, err := s.Runs.Create(ctx, p.ID, "sprint 1", nil)
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	if run.Status != domain.RunStatusOpen {
		t.Errorf("new run status = %q, want %q", run.Status, domain.RunStatusOpen)
	}

	got, err := s.Runs.Get(ctx, run.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Status != domain.RunStatusOpen {
		t.Errorf("Get status = %q, want %q", got.Status, domain.RunStatusOpen)
	}
}

// TestCloseAndReopenRun covers "Closing an open run" and "An actor with
// manageProject reopens a closed run".
func TestCloseAndReopenRun(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", nil)

	if err := s.Runs.Close(ctx, run.ID); err != nil {
		t.Fatalf("Close: %v", err)
	}
	got, _ := s.Runs.Get(ctx, run.ID)
	if got.Status != domain.RunStatusClosed {
		t.Errorf("status after Close = %q, want %q", got.Status, domain.RunStatusClosed)
	}

	if err := s.Runs.Reopen(ctx, run.ID); err != nil {
		t.Fatalf("Reopen: %v", err)
	}
	got, _ = s.Runs.Get(ctx, run.ID)
	if got.Status != domain.RunStatusOpen {
		t.Errorf("status after Reopen = %q, want %q", got.Status, domain.RunStatusOpen)
	}
}

// TestClosedRunRejectsMutations covers the "Closed run rejects ..."
// scenarios: every existing mutating run-item store method refuses once
// the parent run is closed.
func TestClosedRunRejectsMutations(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	c2 := mustCase(t, s, p.ID, "Logout works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	item := items[0]

	if err := s.Runs.Close(ctx, run.ID); err != nil {
		t.Fatalf("Close: %v", err)
	}

	if _, err := s.Runs.AddItem(ctx, run.ID, c2.ID, ""); !errors.Is(err, store.ErrRunClosed) {
		t.Errorf("AddItem on closed run = %v, want ErrRunClosed", err)
	}
	if _, err := s.Runs.AppendResult(ctx, item.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); !errors.Is(err, store.ErrRunClosed) {
		t.Errorf("AppendResult on closed run = %v, want ErrRunClosed", err)
	}
	if err := s.Runs.SetItemStatus(ctx, item.ID, domain.StatusRetest); !errors.Is(err, store.ErrRunClosed) {
		t.Errorf("SetItemStatus on closed run = %v, want ErrRunClosed", err)
	}
	ana := mustUser(t, s, "closed-run-assignee@example.com", false)
	if err := s.Runs.AssignItemToUser(ctx, item.ID, ana.ID); !errors.Is(err, store.ErrRunClosed) {
		t.Errorf("AssignItemToUser on closed run = %v, want ErrRunClosed", err)
	}
}

func TestAddItemToOpenRunPinsThenCurrentVersion(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", nil)

	edited := c.Content
	edited.Title = "v2 title"
	if _, err := s.Cases.NewVersion(ctx, c.ID, edited); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Runs.AddItem(ctx, run.ID, c.ID, ""); err != nil {
		t.Fatalf("AddItem: %v", err)
	}
	items, _ := s.Runs.Items(ctx, run.ID, "")
	if items[0].CaseVersion != 2 {
		t.Errorf("pinned version = %d, want 2 (then-current)", items[0].CaseVersion)
	}
}

// TestRunItemTestNamePersists covers add-execution-import's RunItem.TestName
// field: the literal name an external runner reported, independent of the
// pinned case's own title.
func TestRunItemTestNamePersists(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", nil)

	if _, err := s.Runs.AddItem(ctx, run.ID, c.ID, "tests/test_login.py::test_login"); err != nil {
		t.Fatalf("AddItem: %v", err)
	}
	items, _ := s.Runs.Items(ctx, run.ID, "")
	if items[0].TestName != "tests/test_login.py::test_login" {
		t.Errorf("TestName = %q, want the runner's literal name", items[0].TestName)
	}
}

// Items created together in one run.Create call share a single
// transaction, so a naive `created_at` default (frozen at transaction
// start) makes every item's timestamp identical, leaving their listed
// order undefined. Regression test for that.
func TestRunItemsListedInInsertionOrder(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")
	c2 := mustCase(t, s, p.ID, "two")
	c3 := mustCase(t, s, p.ID, "three")
	run, err := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c1.ID, c2.ID, c3.ID})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil || len(items) != 3 {
		t.Fatalf("Items = %d, %v; want 3", len(items), err)
	}
	if items[0].Content.Title != "one" || items[1].Content.Title != "two" || items[2].Content.Title != "three" {
		t.Errorf("item order = %q, %q, %q; want one, two, three",
			items[0].Content.Title, items[1].Content.Title, items[2].Content.Title)
	}
}

func TestAppendResultUpdatesStatusAndAccumulates(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	item := items[0]

	// failed → retest → pass, per the spec's "Results accumulate" scenario.
	if _, err := s.Runs.AppendResult(ctx, item.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed, Comment: "broken"}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("AppendResult failed: %v", err)
	}
	if err := s.Runs.SetItemStatus(ctx, item.ID, domain.StatusRetest); err != nil {
		t.Fatalf("SetItemStatus retest: %v", err)
	}
	if _, err := s.Runs.AppendResult(ctx, item.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("AppendResult pass: %v", err)
	}

	results, err := s.Runs.Results(ctx, item.ID)
	if err != nil || len(results) != 2 {
		t.Fatalf("Results = %d, %v; want 2", len(results), err)
	}
	if results[0].Verdict != domain.VerdictFailed || results[1].Verdict != domain.VerdictPass {
		t.Errorf("result order wrong: %+v", results)
	}
	items, _ = s.Runs.Items(ctx, run.ID, "")
	if items[0].CurrentStatus != domain.StatusPass {
		t.Errorf("final status = %q, want pass", items[0].CurrentStatus)
	}
}

// TestResultExecutionMetadataPersists covers add-execution-import's optional
// execution metadata on Result: available to both imports and a manually
// recorded verdict.
func TestResultExecutionMetadataPersists(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	item := items[0]

	start := time.Date(2026, 7, 22, 10, 0, 0, 0, time.UTC)
	end := start.Add(2 * time.Second)
	res, err := s.Runs.AppendResult(ctx, item.ID, domain.NewResult{
		Actor:     "ci",
		Verdict:   domain.VerdictPass,
		StartTime: &start,
		EndTime:   &end,
		Platform:  "linux",
		Version:   "1.2.3",
		Tags:      []string{"smoke", "regression"},
	}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("AppendResult: %v", err)
	}
	if res.Platform != "linux" || res.Version != "1.2.3" {
		t.Errorf("AppendResult platform/version = %q/%q, want linux/1.2.3", res.Platform, res.Version)
	}
	if res.StartTime == nil || !res.StartTime.Equal(start) {
		t.Errorf("AppendResult StartTime = %v, want %v", res.StartTime, start)
	}

	results, err := s.Runs.Results(ctx, item.ID)
	if err != nil || len(results) != 1 {
		t.Fatalf("Results = %d, %v; want 1", len(results), err)
	}
	got := results[0]
	if got.EndTime == nil || !got.EndTime.Equal(end) {
		t.Errorf("Results EndTime = %v, want %v", got.EndTime, end)
	}
	if len(got.Tags) != 2 || got.Tags[0] != "smoke" || got.Tags[1] != "regression" {
		t.Errorf("Results Tags = %v, want [smoke regression]", got.Tags)
	}
}

// TestResultExecutionMetadataOptional covers the "omitted, not guessed" rule:
// a result recorded without execution metadata leaves those fields absent.
func TestResultExecutionMetadataOptional(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	res, err := s.Runs.AppendResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("AppendResult: %v", err)
	}
	if res.StartTime != nil || res.EndTime != nil {
		t.Errorf("StartTime/EndTime = %v/%v, want both nil when not supplied", res.StartTime, res.EndTime)
	}
	if res.Platform != "" || res.Version != "" || len(res.Tags) != 0 {
		t.Errorf("Platform/Version/Tags = %q/%q/%v, want all empty when not supplied", res.Platform, res.Version, res.Tags)
	}
}

// TestAppendResultPersistsActorLink covers link-result-actor-to-identity:
// AppendResult takes the resolved actor kind/ref alongside the display name
// and persists/round-trips all three.
func TestAppendResultPersistsActorLink(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	// A result with a real actor link.
	res, err := s.Runs.AppendResult(ctx, items[0].ID,
		domain.NewResult{Actor: "Ana", Verdict: domain.VerdictPass},
		domain.ResultActorUser, "u1")
	if err != nil {
		t.Fatalf("AppendResult: %v", err)
	}
	if res.ActorKind != domain.ResultActorUser || res.ActorRefID != "u1" {
		t.Errorf("ActorKind/ActorRefID = %q/%q, want user/u1", res.ActorKind, res.ActorRefID)
	}

	// A result with an override display name but the real actor link still
	// recorded underneath it (design D2).
	res2, err := s.Runs.AppendResult(ctx, items[0].ID,
		domain.NewResult{Actor: "agent:qa-bot", Verdict: domain.VerdictFailed},
		domain.ResultActorAgent, "tok1")
	if err != nil {
		t.Fatalf("AppendResult override: %v", err)
	}
	if res2.Actor != "agent:qa-bot" || res2.ActorKind != domain.ResultActorAgent || res2.ActorRefID != "tok1" {
		t.Errorf("override result = %+v, want Actor=agent:qa-bot ActorKind=agent ActorRefID=tok1", res2)
	}

	// A pre-existing-style row (no resolved actor) reads back as unknown.
	res3, err := s.Runs.AppendResult(ctx, items[0].ID,
		domain.NewResult{Actor: "legacy", Verdict: domain.VerdictSkipped},
		domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("AppendResult legacy: %v", err)
	}
	if res3.ActorKind != domain.ResultActorUnknown || res3.ActorRefID != "" {
		t.Errorf("legacy result ActorKind/ActorRefID = %q/%q, want unknown/\"\"", res3.ActorKind, res3.ActorRefID)
	}

	results, err := s.Runs.Results(ctx, items[0].ID)
	if err != nil || len(results) != 3 {
		t.Fatalf("Results = %d, %v; want 3", len(results), err)
	}
	if results[0].ActorKind != domain.ResultActorUser || results[1].ActorKind != domain.ResultActorAgent || results[2].ActorKind != domain.ResultActorUnknown {
		t.Errorf("Results actor kinds = %q/%q/%q, want user/agent/unknown",
			results[0].ActorKind, results[1].ActorKind, results[2].ActorKind)
	}
}

// A user assignee's avatarKey resolves live (add-user-profile) — the
// item's assignee reflects whatever the user currently has set, not a
// value pinned at assignment time.
func TestAssigneeAvatarKeyResolvesLive(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "one")
	run, _ := s.Runs.Create(ctx, p.ID, "r", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	ana := mustUser(t, s, "ana@example.com", false)
	if err := s.Runs.AssignItemToUser(ctx, items[0].ID, ana.ID); err != nil {
		t.Fatalf("assign: %v", err)
	}

	before, _ := s.Runs.Items(ctx, run.ID, "")
	if before[0].Assignee.AvatarKey != nil {
		t.Errorf("AvatarKey before set = %v, want nil", before[0].Assignee.AvatarKey)
	}

	avatarKey := "ada-lovelace"
	if _, err := s.Users.UpdateProfile(ctx, ana.ID, domain.UserProfileUpdate{AvatarKey: &avatarKey}); err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}

	after, _ := s.Runs.Items(ctx, run.ID, "")
	if after[0].Assignee.AvatarKey == nil || *after[0].Assignee.AvatarKey != avatarKey {
		t.Errorf("AvatarKey after set = %v, want %q", after[0].Assignee.AvatarKey, avatarKey)
	}
}

func TestAssignAndFilterByAssignee(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")
	c2 := mustCase(t, s, p.ID, "two")
	c3 := mustCase(t, s, p.ID, "three")
	run, _ := s.Runs.Create(ctx, p.ID, "r", []string{c1.ID, c2.ID, c3.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	ana := mustUser(t, s, "ana@example.com", false)
	luis := mustUser(t, s, "luis@example.com", false)
	for i, userID := range []string{ana.ID, ana.ID, luis.ID} {
		if err := s.Runs.AssignItemToUser(ctx, items[i].ID, userID); err != nil {
			t.Fatalf("assign: %v", err)
		}
	}
	anas, err := s.Runs.Items(ctx, run.ID, ana.ID)
	if err != nil || len(anas) != 2 {
		t.Errorf("filter by ana = %d items, %v; want 2", len(anas), err)
	}
	for _, item := range anas {
		if item.Assignee == nil || item.Assignee.Kind != domain.AssigneeKindUser || item.Assignee.ID != ana.ID || item.Assignee.Name != "ana@example.com" {
			t.Errorf("Assignee = %+v, want user ana", item.Assignee)
		}
	}
}

func TestAssignItemToTeam(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")
	run, _ := s.Runs.Create(ctx, p.ID, "r", []string{c1.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	team, err := s.Teams.Create(ctx, "QA Core")
	if err != nil {
		t.Fatalf("create team: %v", err)
	}

	if err := s.Runs.AssignItemToTeam(ctx, items[0].ID, team.ID); err != nil {
		t.Fatalf("assign: %v", err)
	}
	got, _ := s.Runs.Items(ctx, run.ID, "")
	if got[0].Assignee == nil || got[0].Assignee.Kind != domain.AssigneeKindTeam || got[0].Assignee.ID != team.ID || got[0].Assignee.Name != "QA Core" {
		t.Errorf("Assignee = %+v, want team QA Core", got[0].Assignee)
	}
}

func TestAssignItemToUserThenTeamClearsUser(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")
	run, _ := s.Runs.Create(ctx, p.ID, "r", []string{c1.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	ana := mustUser(t, s, "ana2@example.com", false)
	team, _ := s.Teams.Create(ctx, "QA Core 2")

	if err := s.Runs.AssignItemToUser(ctx, items[0].ID, ana.ID); err != nil {
		t.Fatalf("assign user: %v", err)
	}
	if err := s.Runs.AssignItemToTeam(ctx, items[0].ID, team.ID); err != nil {
		t.Fatalf("assign team: %v", err)
	}
	got, _ := s.Runs.Items(ctx, run.ID, "")
	if got[0].Assignee == nil || got[0].Assignee.Kind != domain.AssigneeKindTeam {
		t.Errorf("Assignee = %+v, want team-only after reassignment", got[0].Assignee)
	}
}

// Users are only ever soft-deactivated in this system (no hard-delete
// path exists), so this exercises the ON DELETE SET NULL behavior against
// a team instead — Teams.Delete is a real, exercised hard-delete path.
// The same constraint on assignee_user_id is defensive/future-proofing:
// nothing in the current API can trigger it, but it stays correct if a
// hard user-delete path is ever added.
func TestDeletingAssignedTeamRevertsItemToUnassigned(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")
	run, _ := s.Runs.Create(ctx, p.ID, "r", []string{c1.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	team, _ := s.Teams.Create(ctx, "Temp Assignee Team")
	if err := s.Runs.AssignItemToTeam(ctx, items[0].ID, team.ID); err != nil {
		t.Fatalf("assign: %v", err)
	}

	if err := s.Teams.Delete(ctx, team.ID); err != nil {
		t.Fatalf("delete team: %v", err)
	}

	got, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("Items: %v", err)
	}
	if got[0].Assignee != nil {
		t.Errorf("Assignee = %+v, want nil after assigned team is deleted", got[0].Assignee)
	}
}

func TestRunSummaryCounts(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	var caseIDs []string
	for _, title := range []string{"a", "b", "c", "d"} {
		caseIDs = append(caseIDs, mustCase(t, s, p.ID, title).ID)
	}
	run, _ := s.Runs.Create(ctx, p.ID, "r", caseIDs)
	items, _ := s.Runs.Items(ctx, run.ID, "")

	// 2 pass, 1 failed, 1 pending.
	for _, i := range []int{0, 1} {
		if _, err := s.Runs.AppendResult(ctx, items[i].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Runs.AppendResult(ctx, items[2].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatal(err)
	}

	sum, err := s.Runs.Summary(ctx, run.ID)
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	if sum.Total != 4 || sum.Counts[domain.StatusPass] != 2 ||
		sum.Counts[domain.StatusFailed] != 1 || sum.Counts[domain.StatusPending] != 1 {
		t.Errorf("summary = %+v", sum)
	}
}

// TestSuiteTrendListsClosedRunsOldestFirst covers add-suite-pass-rate-trend's
// "A suite's closed runs appear in the trend, oldest first" scenario.
func TestSuiteTrendListsClosedRunsOldestFirst(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}

	run1, err := s.Runs.CreateWithSuite(ctx, p.ID, "run 1", suite.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create run1: %v", err)
	}
	items1, _ := s.Runs.Items(ctx, run1.ID, "")
	if _, err := s.Runs.AppendResult(ctx, items1[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("append result run1: %v", err)
	}
	if err := s.Runs.Close(ctx, run1.ID); err != nil {
		t.Fatalf("close run1: %v", err)
	}

	run2, err := s.Runs.CreateWithSuite(ctx, p.ID, "run 2", suite.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create run2: %v", err)
	}
	items2, _ := s.Runs.Items(ctx, run2.ID, "")
	if _, err := s.Runs.AppendResult(ctx, items2[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("append result run2: %v", err)
	}
	if err := s.Runs.Close(ctx, run2.ID); err != nil {
		t.Fatalf("close run2: %v", err)
	}

	trend, err := s.Suites.Trend(ctx, suite.ID)
	if err != nil {
		t.Fatalf("Trend: %v", err)
	}
	if trend.SuiteKey != suite.Key {
		t.Errorf("SuiteKey = %q, want %q", trend.SuiteKey, suite.Key)
	}
	if len(trend.Points) != 2 {
		t.Fatalf("Points = %d, want 2", len(trend.Points))
	}
	if trend.Points[0].RunKey != run1.Key || trend.Points[0].Counts[domain.StatusPass] != 1 {
		t.Errorf("Points[0] = %+v, want run1 with 1 pass", trend.Points[0])
	}
	if trend.Points[1].RunKey != run2.Key || trend.Points[1].Counts[domain.StatusFailed] != 1 {
		t.Errorf("Points[1] = %+v, want run2 with 1 failed", trend.Points[1])
	}
}

// TestSuiteTrendExcludesOpenRuns covers add-suite-pass-rate-trend's "An open
// run is excluded from the trend" scenario.
func TestSuiteTrendExcludesOpenRuns(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}

	closedRun, err := s.Runs.CreateWithSuite(ctx, p.ID, "closed run", suite.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create closed run: %v", err)
	}
	if err := s.Runs.Close(ctx, closedRun.ID); err != nil {
		t.Fatalf("close: %v", err)
	}
	if _, err := s.Runs.CreateWithSuite(ctx, p.ID, "open run", suite.ID, []string{c.ID}); err != nil {
		t.Fatalf("create open run: %v", err)
	}

	trend, err := s.Suites.Trend(ctx, suite.ID)
	if err != nil {
		t.Fatalf("Trend: %v", err)
	}
	if len(trend.Points) != 1 || trend.Points[0].RunKey != closedRun.Key {
		t.Errorf("Points = %+v, want only the closed run", trend.Points)
	}
}

// TestSuiteTrendEmptyForNoClosedRuns covers add-suite-pass-rate-trend's "A
// suite with no closed runs has an empty trend" scenario.
func TestSuiteTrendEmptyForNoClosedRuns(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	suite, err := s.Suites.Create(ctx, p.ID, "smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}

	trend, err := s.Suites.Trend(ctx, suite.ID)
	if err != nil {
		t.Fatalf("Trend: %v", err)
	}
	if len(trend.Points) != 0 {
		t.Errorf("Points = %+v, want empty", trend.Points)
	}
}

func TestExecutionsByCaseGroupedByVersion(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	// Two runs pinning v1 (one pass, one failed), then a version bump, then a
	// third run pinning v2.
	run1, _ := s.Runs.Create(ctx, p.ID, "run 1", []string{c.ID})
	run2, _ := s.Runs.Create(ctx, p.ID, "run 2", []string{c.ID})
	items1, _ := s.Runs.Items(ctx, run1.ID, "")
	items2, _ := s.Runs.Items(ctx, run2.ID, "")
	if _, err := s.Runs.AppendResult(ctx, items1[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Runs.AppendResult(ctx, items2[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatal(err)
	}

	edited := c.Content
	edited.Title = "Login works (edited)"
	if _, err := s.Cases.NewVersion(ctx, c.ID, edited); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Runs.Create(ctx, p.ID, "run 3", []string{c.ID}); err != nil {
		t.Fatal(err)
	}

	execs, err := s.Runs.ExecutionsByCase(ctx, c.ID)
	if err != nil {
		t.Fatalf("ExecutionsByCase: %v", err)
	}
	if len(execs) != 3 {
		t.Fatalf("ExecutionsByCase = %d executions, want 3: %+v", len(execs), execs)
	}
	var v1Count, v2Count int
	for _, e := range execs {
		if e.RunName == "" || e.RunID == "" || e.RunItemID == "" || e.RunKey == "" {
			t.Errorf("execution missing identifying fields: %+v", e)
		}
		switch e.CaseVersion {
		case 1:
			v1Count++
		case 2:
			v2Count++
		default:
			t.Errorf("unexpected pinned version %d", e.CaseVersion)
		}
	}
	if v1Count != 2 || v2Count != 1 {
		t.Errorf("v1Count=%d v2Count=%d, want 2 and 1", v1Count, v2Count)
	}

	empty, err := mustCase(t, s, p.ID, "Never run"), error(nil)
	if err != nil {
		t.Fatal(err)
	}
	execs, err = s.Runs.ExecutionsByCase(ctx, empty.ID)
	if err != nil || len(execs) != 0 {
		t.Errorf("ExecutionsByCase for unrun case = %d, %v; want 0, nil", len(execs), err)
	}
}
