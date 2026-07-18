package store_test

import (
	"context"
	"testing"

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

// --- Projects (task 2.1) ---

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
	if !item.NewerVersion {
		t.Error("NewerVersion = false, want true after edit")
	}
	if item.CurrentStatus != domain.StatusPending {
		t.Errorf("initial status = %q, want pending", item.CurrentStatus)
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
	if _, err := s.Runs.AddItem(ctx, run.ID, c.ID); err != nil {
		t.Fatalf("AddItem: %v", err)
	}
	items, _ := s.Runs.Items(ctx, run.ID, "")
	if items[0].CaseVersion != 2 {
		t.Errorf("pinned version = %d, want 2 (then-current)", items[0].CaseVersion)
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
	if _, err := s.Runs.AppendResult(ctx, item.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed, Comment: "broken"}); err != nil {
		t.Fatalf("AppendResult failed: %v", err)
	}
	if err := s.Runs.SetItemStatus(ctx, item.ID, domain.StatusRetest); err != nil {
		t.Fatalf("SetItemStatus retest: %v", err)
	}
	if _, err := s.Runs.AppendResult(ctx, item.ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}); err != nil {
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

func TestAssignAndFilterByAssignee(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")
	c2 := mustCase(t, s, p.ID, "two")
	c3 := mustCase(t, s, p.ID, "three")
	run, _ := s.Runs.Create(ctx, p.ID, "r", []string{c1.ID, c2.ID, c3.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	for i, assignee := range []string{"ana", "ana", "luis"} {
		if err := s.Runs.AssignItem(ctx, items[i].ID, assignee); err != nil {
			t.Fatalf("assign: %v", err)
		}
	}
	anas, err := s.Runs.Items(ctx, run.ID, "ana")
	if err != nil || len(anas) != 2 {
		t.Errorf("filter by ana = %d items, %v; want 2", len(anas), err)
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
		if _, err := s.Runs.AppendResult(ctx, items[i].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Runs.AppendResult(ctx, items[2].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictFailed}); err != nil {
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
