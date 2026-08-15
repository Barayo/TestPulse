package sampledata_test

import (
	"context"
	"strings"
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
	if !p.PublicAccess {
		t.Error("seeded project PublicAccess = false, want true (enable-public-project-access showcase)")
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
	// The Suites index/detail pages (rework-suites-landing-ux) show a
	// pass-rate health bar per suite, or "Never run" for one with none — the
	// Sample Project should demonstrate both states, not just never-run.
	var sawSuiteWithPassRate, sawNeverRunSuite bool
	for _, s := range suites {
		if s.PassRate != nil {
			sawSuiteWithPassRate = true
		} else {
			sawNeverRunSuite = true
		}
	}
	if !sawSuiteWithPassRate {
		t.Error("no suite has a pass rate — the health bar has nothing real to render")
	}
	if !sawNeverRunSuite {
		t.Error("no suite is never-run — the \"Never run\" empty state has nothing to demonstrate")
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

// TestSeedContentHasARealNestedSubsection covers add-delete-mode's showcase
// task: the Sample Project must have a subsection nested under a top-level
// section (depth ≥ 2), with a case inside it, so delete mode's cascade
// confirmation has something non-trivial to preview — not just a flat list
// of top-level sections each holding cases directly.
func TestSeedContentHasARealNestedSubsection(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	folders, err := svc.ListFolders(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	root := ""
	for _, f := range folders {
		if f.ParentFolderID == "" {
			root = f.ID
		}
	}
	if root == "" {
		t.Fatal("no root folder found")
	}
	topLevel := map[string]bool{}
	for _, f := range folders {
		if f.ParentFolderID == root {
			topLevel[f.ID] = true
		}
	}

	var nested string
	for _, f := range folders {
		if f.ParentFolderID != "" && f.ParentFolderID != root && topLevel[f.ParentFolderID] {
			nested = f.ID
			break
		}
	}
	if nested == "" {
		t.Fatal("no folder nested two levels deep (a subsection of a top-level section) found")
	}

	cases, err := svc.ListCases(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	var sawCaseInNestedFolder bool
	for _, c := range cases {
		if c.FolderID == nested {
			sawCaseInNestedFolder = true
		}
	}
	if !sawCaseInNestedFolder {
		t.Error("nested subsection has no case in it — nothing for the cascade-count preview to show")
	}
}

// TestSeedContentShowcasesMoveAuditDetail covers add-version-restore's
// structured-audit-detail half: the seeded Two-Factor case is moved into its
// subsection after creation (the same move that gives
// TestSeedContentHasARealNestedSubsection its nested case), and that move's
// audit entry should carry a real {from, to} detail now that
// Service.MoveCase records it.
func TestSeedContentShowcasesMoveAuditDetail(t *testing.T) {
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
	var twoFactorID string
	for _, c := range cases {
		if c.Content.Title == "Two-factor prompt is required for a new device" {
			twoFactorID = c.ID
		}
	}
	if twoFactorID == "" {
		t.Fatal("seeded Two-Factor case not found")
	}

	history, err := svc.AuditHistory(ctx, "case", twoFactorID)
	if err != nil {
		t.Fatalf("AuditHistory: %v", err)
	}
	var moveEntry *domain.AuditEntry
	for i := range history {
		if history[i].Action == "move" {
			moveEntry = &history[i]
		}
	}
	if moveEntry == nil {
		t.Fatalf("no move audit entry found for the Two-Factor case: %+v", history)
	}
	from, _ := moveEntry.Detail["from"].(string)
	to, _ := moveEntry.Detail["to"].(string)
	if from == "" || to == "" || from == to {
		t.Errorf("move detail = %+v, want distinct non-empty from/to", moveEntry.Detail)
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

// TestSeedContentSurfacesAFlakyCase covers add-flaky-test-detection's
// showcase: the same seeded flaky version (checkoutValid — passes in three
// runs, fails in a fourth, all on its one and only version) must also
// surface via the project-scoped FlakyCases query, not just the per-version
// executions signal TestSeedContentHasAFlakyVersion already covers.
func TestSeedContentSurfacesAFlakyCase(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	flaky, err := svc.FlakyCases(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("FlakyCases: %v", err)
	}
	if len(flaky) == 0 {
		t.Error("FlakyCases returned none for the Sample Project — the Flaky filter would show nothing")
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

// collapse-duplicate-ci-runs: the Sample Project should demonstrate the
// fixed import behavior — a commit-style name, created closed — not the
// old bug (mislabeled, stuck open).
func TestSeedImportedRunIsClosedWithCommitStyleName(t *testing.T) {
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
	var imported *domain.Run
	for i, r := range runs {
		if strings.HasPrefix(r.Name, "main @ ") {
			imported = &runs[i]
			break
		}
	}
	if imported == nil {
		t.Fatal("no seeded run has a commit-style name (\"main @ <sha> — ...\")")
	}
	if imported.Status != domain.RunStatusClosed {
		t.Errorf("imported run status = %q, want closed", imported.Status)
	}
}

// TestSeedContentHasAPendingItemForKeyboardTriage covers
// add-run-keyboard-shortcuts: the Sample Project must contain an open run
// with a real pending item alongside already-executed ones, so the
// keyboard-driven auto-advance flow (record a verdict, land on the next
// pending item) has something to demonstrate.
func TestSeedContentHasAPendingItemForKeyboardTriage(t *testing.T) {
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
	for _, r := range runs {
		if r.Status != domain.RunStatusOpen {
			continue
		}
		items, err := svc.RunItems(actorCtx, r.ID, "")
		if err != nil {
			t.Fatalf("RunItems: %v", err)
		}
		var sawPending, sawExecuted bool
		for _, item := range items {
			if item.CurrentStatus == domain.StatusPending {
				sawPending = true
			} else {
				sawExecuted = true
			}
		}
		if sawPending && sawExecuted {
			return
		}
	}
	t.Error("no open run has both a pending item and an already-executed item — auto-advance has nothing to demonstrate")
}

// TestSeedContentHasAssignedAndUnassignedItems covers
// add-run-item-assignment-ui: the Sample Project must show real data for
// the assignee display, the per-assignee filter (multiple distinct
// assignees, not just one), and the Unassigned filter — not every item
// sharing the same assignment state.
func TestSeedContentHasAssignedAndUnassignedItems(t *testing.T) {
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
	assignees := map[string]bool{}
	sawUnassigned := false
	sawLinkedUser := false
	for _, r := range runs {
		items, err := svc.RunItems(actorCtx, r.ID, "")
		if err != nil {
			t.Fatalf("RunItems: %v", err)
		}
		for _, item := range items {
			if item.Assignee == nil {
				sawUnassigned = true
				continue
			}
			assignees[item.Assignee.ID] = true
			if item.Assignee.Kind == domain.AssigneeKindUser {
				sawLinkedUser = true
			}
		}
	}
	if !sawLinkedUser {
		t.Error("no assignment is a real linked user — link-run-item-assignee-to-identity requires a real reference, not free text")
	}
	if len(assignees) < 2 {
		t.Errorf("distinct assignees = %d, want at least 2 (got %v)", len(assignees), assignees)
	}
	if !sawUnassigned {
		t.Error("no unassigned item found — the Unassigned filter has nothing to demonstrate")
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

// TestSeedContentShowcasesCaseVersionActorLink covers
// link-case-version-actor-to-identity's showcase task: without this, every
// seeded case version would attribute to the same Tenant Admin actor,
// leaving the Version History row's "who made the change" avatar/name
// permanently untested against a second real identity. Julia edits the
// "Session expires after inactivity" case's second version so the row
// shows a different actor (with a real preset avatar, not just an
// initial) than the Admin-attributed first and third versions.
func TestSeedContentShowcasesCaseVersionActorLink(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	users, err := svc.ListUsers(actorCtx)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	var julia domain.User
	for _, u := range users {
		if u.Email == "julia@example.com" {
			julia = u
		}
	}
	if julia.ID == "" {
		t.Fatal("seeded demo user julia@example.com not found")
	}
	if julia.AvatarKey == nil || *julia.AvatarKey == "" {
		t.Error("julia@example.com has no avatarKey set — Version History row would show a generated initial, not a real preset avatar")
	}

	cases, err := svc.ListCases(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	var sessionTimeoutID string
	for _, c := range cases {
		if c.Content.Title == "Session expires after inactivity" {
			sessionTimeoutID = c.ID
		}
	}
	if sessionTimeoutID == "" {
		t.Fatal(`seeded case "Session expires after inactivity" not found`)
	}

	versions, err := svc.CaseVersions(actorCtx, sessionTimeoutID)
	if err != nil {
		t.Fatalf("CaseVersions: %v", err)
	}
	if len(versions) != 3 {
		t.Fatalf("got %d versions, want 3", len(versions))
	}
	if versions[1].ActorKind != domain.ResultActorUser || versions[1].ActorRefID != julia.ID {
		t.Errorf("version 2 actor = %+v, want user/%s (Julia)", versions[1], julia.ID)
	}
	if versions[0].ActorRefID != versions[2].ActorRefID {
		t.Error("version 1 and version 3 should both attribute to the Tenant Admin, distinct from Julia's version 2")
	}
}

// TestSeedContentShowcasesLibraryRichness covers rework-library-ux's showcase
// task: a section with a double-digit direct case count (so the case-count/
// automation-coverage-meter rendering has real scale to show), a genuinely
// empty section (so the Library's "Nothing here yet" empty state isn't
// purely theoretical), and one section whose direct cases alone span every
// priority level and both automated/manual — not just true project-wide.
func TestSeedContentShowcasesLibraryRichness(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	folders, err := svc.ListFolders(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListFolders: %v", err)
	}
	cases, err := svc.ListCases(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}

	directCounts := map[string]int{}
	for _, c := range cases {
		directCounts[c.FolderID]++
	}

	var sawDoubleDigitFolder bool
	for _, f := range folders {
		if directCounts[f.ID] >= 10 {
			sawDoubleDigitFolder = true
		}
	}
	if !sawDoubleDigitFolder {
		t.Error("no folder has a double-digit direct case count — the case-count/coverage-meter rendering has nothing at scale to show")
	}

	subfolderCounts := map[string]int{}
	for _, f := range folders {
		if f.ParentFolderID != "" {
			subfolderCounts[f.ParentFolderID]++
		}
	}
	var sawEmptyFolder bool
	for _, f := range folders {
		if f.ParentFolderID == "" {
			continue // root itself is never "a section"
		}
		if directCounts[f.ID] == 0 && subfolderCounts[f.ID] == 0 {
			sawEmptyFolder = true
		}
	}
	if !sawEmptyFolder {
		t.Error("no genuinely empty section — the Library's \"Nothing here yet\" empty state has nothing real to demonstrate")
	}

	priorityByFolder := map[string]map[domain.Priority]bool{}
	automatedByFolder := map[string]bool{}
	manualByFolder := map[string]bool{}
	for _, c := range cases {
		if priorityByFolder[c.FolderID] == nil {
			priorityByFolder[c.FolderID] = map[domain.Priority]bool{}
		}
		priorityByFolder[c.FolderID][c.Content.Priority] = true
		if c.Content.Automated {
			automatedByFolder[c.FolderID] = true
		} else {
			manualByFolder[c.FolderID] = true
		}
	}
	var sawFullyMixedFolder bool
	for folderID, priorities := range priorityByFolder {
		allPriorities := priorities[domain.PriorityLow] && priorities[domain.PriorityMedium] &&
			priorities[domain.PriorityHigh] && priorities[domain.PriorityCritical]
		if allPriorities && automatedByFolder[folderID] && manualByFolder[folderID] {
			sawFullyMixedFolder = true
		}
	}
	if !sawFullyMixedFolder {
		t.Error("no single section's direct cases alone span every priority level plus both automated and manual")
	}
}

// TestSeedContentShowcasesScopedApiToken covers add-scoped-api-tokens'
// Sample-Project-showcase task: without this, a fresh instance's token list
// would only ever show unscoped tokens, leaving the project+role picker and
// the "{project} · {role}" scoped display entirely untested against real
// seeded content.
func TestSeedContentShowcasesScopedApiToken(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	users, err := svc.ListUsers(actorCtx)
	if err != nil || len(users) == 0 {
		t.Fatalf("ListUsers: %v, %d users", err, len(users))
	}
	admin := users[0]
	adminActor := domain.Actor{
		ID: admin.ID, Kind: domain.ActorKindUser, DisplayName: admin.Email,
		EffectiveUserID: admin.ID, IsTenantAdmin: admin.IsTenantAdmin,
	}

	tokens, err := svc.ListOwnTokens(actorCtx, adminActor)
	if err != nil {
		t.Fatalf("ListOwnTokens: %v", err)
	}
	var sawUnscoped, sawScoped bool
	for _, tok := range tokens {
		if tok.ProjectID == nil && tok.RoleID == nil {
			sawUnscoped = true
			continue
		}
		if tok.ProjectID != nil && *tok.ProjectID == p.ID {
			sawScoped = true
		}
	}
	if !sawUnscoped {
		t.Error("no unscoped (full-access) token seeded — nothing shows \"Full access\" in the token list")
	}
	if !sawScoped {
		t.Error("no token scoped to the Sample Project seeded — nothing shows the {project} · {role} display")
	}
}

// TestSeedContentShowcasesDeletableTeam covers add-team-deletion-preview's
// Sample-Project-showcase task: without a seeded team, a fresh instance
// would never show the People page's Teams section or its delete-preview
// dialog against real content. The team has real members (a non-zero
// preview) but no project role assignment, so it's genuinely safe to
// delete live during evaluation.
func TestSeedContentShowcasesDeletableTeam(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	adminActor, _ := domain.ActorFromContext(actorCtx)

	teams, err := svc.ListTeams(actorCtx)
	if err != nil {
		t.Fatalf("ListTeams: %v", err)
	}
	var qaCore domain.Team
	for _, team := range teams {
		if team.Name == "QA Core" {
			qaCore = team
		}
	}
	if qaCore.ID == "" {
		t.Fatal("seeded demo team \"QA Core\" not found")
	}
	if len(qaCore.MemberIDs) != 2 {
		t.Errorf("QA Core has %d members, want 2 — the delete-preview dialog would show a zero count", len(qaCore.MemberIDs))
	}

	preview, err := svc.TeamDeletionPreview(actorCtx, adminActor, qaCore.ID)
	if err != nil {
		t.Fatalf("TeamDeletionPreview: %v", err)
	}
	if preview.ProjectCount != 0 {
		t.Errorf("QA Core holds a role on %d project(s), want 0 — deleting it live would revoke real access", preview.ProjectCount)
	}
}

// TestSeedContentShowcasesScreenshotAttachment covers
// add-run-item-screenshot-attachments' Sample-Project-showcase task: without
// this, a fresh instance would never show a run item result with an
// attached screenshot, leaving the thumbnail strip / lightbox entirely
// untested against real seeded content.
func TestSeedContentShowcasesScreenshotAttachment(t *testing.T) {
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

	var sawAttachment bool
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
				if len(res.Attachments) == 0 {
					continue
				}
				sawAttachment = true
				att := res.Attachments[0]
				if att.ContentType != "image/png" || att.Filename == "" {
					t.Errorf("seeded attachment = %+v, want a named PNG", att)
				}
			}
		}
	}
	if !sawAttachment {
		t.Error("no seeded run item result carries a screenshot attachment")
	}
}
