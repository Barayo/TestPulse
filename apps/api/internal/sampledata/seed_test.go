package sampledata_test

import (
	"context"
	"errors"
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

// TestSeedFlagshipCaseShowcasesMultipleVerdictColors covers
// add-case-result-history: the Sample Project's most prominent case ("User
// can log in with valid credentials", the natural first thing a new user
// clicks into) must show more than just pass/failed in its recent-execution
// window, so CaseResultsPanel's full 6-color vocabulary has something real
// to demonstrate rather than a 2-color history.
func TestSeedFlagshipCaseShowcasesMultipleVerdictColors(t *testing.T) {
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
	var login *domain.TestCase
	for i, c := range cases {
		if c.Content.Title == "User can log in with valid credentials" {
			login = &cases[i]
		}
	}
	if login == nil {
		t.Fatal("no case titled \"User can log in with valid credentials\" seeded")
	}

	execs, err := svc.RecentCaseExecutions(actorCtx, login.ID, 7)
	if err != nil {
		t.Fatalf("RecentCaseExecutions: %v", err)
	}
	distinct := map[domain.Status]bool{}
	for _, e := range execs {
		distinct[e.Status] = true
	}
	if len(distinct) < 3 {
		t.Errorf("login case's last 7 executions show only %d distinct verdict(s) (%+v), want at least 3", len(distinct), distinct)
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

// TestSeedContentShowcasesProjectWideStatusSummary covers
// add-project-reports-page's showcase: the Sample Project's many seeded
// runs (closed, open, imported) must aggregate into a real multi-status
// breakdown, not a degenerate single-status one, so the Reports page's
// status chart is a real showcase and not an empty/near-empty strip.
func TestSeedContentShowcasesProjectWideStatusSummary(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	sum, err := svc.ProjectStatusSummary(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ProjectStatusSummary: %v", err)
	}
	if sum.Total < 20 {
		t.Errorf("total = %d, want a substantial project-wide item count", sum.Total)
	}
	distinctStatuses := 0
	for _, c := range sum.Counts {
		if c > 0 {
			distinctStatuses++
		}
	}
	if distinctStatuses < 3 {
		t.Errorf("counts = %+v, want at least 3 distinct statuses represented for a real status breakdown", sum.Counts)
	}
	if sum.Counts[domain.StatusPending] == 0 {
		t.Error("no pending items in the project-wide summary — the open run's pending items should still count")
	}
}

// TestSeedContentShowcasesCustomFields covers add-case-custom-fields'
// showroom: the Sample Project defines both a text and a select custom
// field, with values on real cases, so the Settings page's field list,
// the case editor's Custom fields block, and the case sidebar's pill/text
// rendering are all demonstrably non-empty.
func TestSeedContentShowcasesCustomFields(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	fields, err := svc.ListCustomFields(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListCustomFields: %v", err)
	}
	var textField, selectField *domain.CustomField
	for i := range fields {
		switch fields[i].FieldType {
		case domain.CustomFieldTypeText:
			textField = &fields[i]
		case domain.CustomFieldTypeSelect:
			selectField = &fields[i]
		}
	}
	if textField == nil {
		t.Fatal("no text custom field seeded")
	}
	if selectField == nil {
		t.Fatal("no select custom field seeded")
	}
	if len(selectField.Options) < 2 {
		t.Errorf("select field options = %+v, want at least 2", selectField.Options)
	}

	cases, err := svc.ListCases(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	var sawTextValue, sawSelectValue bool
	for _, c := range cases {
		if c.Content.CustomFields[textField.ID] != "" {
			sawTextValue = true
		}
		if c.Content.CustomFields[selectField.ID] != "" {
			sawSelectValue = true
		}
	}
	if !sawTextValue {
		t.Error("no case has a value for the seeded text field")
	}
	if !sawSelectValue {
		t.Error("no case has a value for the seeded select field")
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

// TestSeedContentHasARunComparisonShowcase covers add-run-comparison-view:
// the Sample Project must contain two closed, suite-linked runs of the same
// suite with a genuine case-level regression and recovery between them, so
// both comparison entry points ("Compare to previous run" and the explicit
// picker) have real data to demonstrate.
func TestSeedContentHasARunComparisonShowcase(t *testing.T) {
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
	var older, newer *domain.Run
	for i, r := range runs {
		switch r.Name {
		case "Release 1.1 regression":
			older = &runs[i]
		case "Release 1.1.1 hotfix verification":
			newer = &runs[i]
		}
	}
	if older == nil || newer == nil {
		t.Fatal("missing one or both of the suite-linked regression/hotfix runs")
	}
	if older.Status != domain.RunStatusClosed || newer.Status != domain.RunStatusClosed {
		t.Fatalf("older.Status=%q newer.Status=%q, want both closed", older.Status, newer.Status)
	}

	cmp, err := svc.CompareRuns(actorCtx, older.ID, newer.ID)
	if err != nil {
		t.Fatalf("CompareRuns: %v", err)
	}
	if len(cmp.Regressed) == 0 {
		t.Error("Regressed is empty, want at least one case that flipped pass -> failed")
	}
	if len(cmp.Improved) == 0 {
		t.Error("Improved is empty, want at least one case that flipped failed -> pass")
	}
	if len(cmp.Unchanged) == 0 {
		t.Error("Unchanged is empty, want at least one case that held steady")
	}
}

// TestSeedContentShowcasesRunComparisonTiming covers add-run-comparison-timing:
// the same regression/hotfix pair TestSeedContentHasARunComparisonShowcase
// exercises should also demonstrate the new duration stat — one run with
// real timing data, the other with none, so the comparison page's "No
// timing data" state is showcased alongside a real duration, not left
// silently absent on both sides.
func TestSeedContentShowcasesRunComparisonTiming(t *testing.T) {
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
	var older, newer *domain.Run
	for i, r := range runs {
		switch r.Name {
		case "Release 1.1 regression":
			older = &runs[i]
		case "Release 1.1.1 hotfix verification":
			newer = &runs[i]
		}
	}
	if older == nil || newer == nil {
		t.Fatal("missing one or both of the suite-linked regression/hotfix runs")
	}

	cmp, err := svc.CompareRuns(actorCtx, older.ID, newer.ID)
	if err != nil {
		t.Fatalf("CompareRuns: %v", err)
	}
	if cmp.OlderRun.TotalDurationMs != nil {
		t.Errorf("OlderRun.TotalDurationMs = %v, want nil (showcasing the \"No timing data\" state)", *cmp.OlderRun.TotalDurationMs)
	}
	if cmp.NewerRun.TotalDurationMs == nil {
		t.Error("NewerRun.TotalDurationMs = nil, want a real duration (showcasing the timed state)")
	}
}

// TestSeedContentHasAnOpenRunAmongClosedSuiteHistory covers
// rework-suite-run-flow D7: the Stability card's "Open + closed" view needs
// a suite with a real mix of closed history AND a trailing open run to
// demonstrate its open-endpoint (hollow/dashed) treatment against actual
// prior points — not just an isolated single point on an otherwise-unused
// suite.
func TestSeedContentHasAnOpenRunAmongClosedSuiteHistory(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	suites, err := svc.ListSuites(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListSuites: %v", err)
	}
	var regression *domain.Suite
	for i, s := range suites {
		if s.Name == "Regression" {
			regression = &suites[i]
		}
	}
	if regression == nil {
		t.Fatal("no Regression suite seeded")
	}

	runs, err := svc.ListRuns(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	var closedCount, openCount int
	for _, r := range runs {
		if r.SuiteKey == nil || *r.SuiteKey != regression.Key {
			continue
		}
		if r.Status == domain.RunStatusClosed {
			closedCount++
		} else {
			openCount++
		}
	}
	if closedCount == 0 {
		t.Error("Regression suite has no closed runs — nothing for the 'Closed runs' view to show")
	}
	if openCount == 0 {
		t.Error("Regression suite has no open run — nothing for the 'Open + closed' view's trailing point to show")
	}

	// Showcases D10: the Regression suite's Properties sidebar PassRate
	// must match its most recent CLOSED run, not the trailing open run
	// seeded above — the exact live scenario the fix addresses.
	var mostRecentClosed *domain.Run
	for i := range runs {
		r := &runs[i]
		if r.SuiteKey == nil || *r.SuiteKey != regression.Key || r.Status != domain.RunStatusClosed {
			continue
		}
		if mostRecentClosed == nil || r.CreatedAt.After(mostRecentClosed.CreatedAt) {
			mostRecentClosed = r
		}
	}
	if mostRecentClosed == nil {
		t.Fatal("no closed run found for Regression suite")
	}
	if regression.PassRate == nil || mostRecentClosed.PassRate == nil || *regression.PassRate != *mostRecentClosed.PassRate {
		t.Errorf("Regression suite PassRate = %v, want %v (the most recent closed run's rate, not the trailing open run's)",
			regression.PassRate, mostRecentClosed.PassRate)
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

// add-data-retention: the Sample Project ships a small, closed, explicitly
// disposable run so a user trying the new "Delete run" action has something
// low-stakes to practice on, rather than being tempted to delete one of the
// meaningful showcase runs the flaky-signal/pass-rate demonstrations depend
// on staying intact.
func TestSeedIncludesADisposableScratchRun(t *testing.T) {
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
	var scratch *domain.Run
	for i, r := range runs {
		if r.Name == "Scratch run — safe to delete" {
			scratch = &runs[i]
		}
	}
	if scratch == nil {
		t.Fatal("no scratch run seeded")
	}
	if scratch.Status != domain.RunStatusClosed {
		t.Errorf("scratch run status = %q, want closed", scratch.Status)
	}
	// ListRuns orders newest first — the scratch run must never be it, since
	// the project's shown pass rate is driven by the most recently created
	// run (TestSeedContentEndsOnAHealthyRun depends on that staying the
	// deliberately strong "Release 1.2" run).
	if runs[0].ID == scratch.ID {
		t.Error("scratch run is the most recently created run, want the final go/no-go run to stay last")
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

// TestSeedContentShowcasesSuiteRunBreakdownTrend covers
// add-suite-run-breakdown-trend (GH #137): the Regression suite's closed
// runs already carry real pass/failed variation (from the run-comparison
// showcase above) and a trailing open run — enough to demonstrate the new
// stacked-breakdown chart's both tabs, not just an all-pass or all-empty
// trend.
func TestSeedContentShowcasesSuiteRunBreakdownTrend(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	p := projects[0]

	suites, err := svc.ListSuites(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListSuites: %v", err)
	}
	var regression *domain.Suite
	for i, s := range suites {
		if s.Name == "Regression" {
			regression = &suites[i]
		}
	}
	if regression == nil {
		t.Fatal("missing the Regression suite")
	}

	closedTrend, err := svc.SuiteTrend(actorCtx, regression.ID, false)
	if err != nil {
		t.Fatalf("SuiteTrend(includeOpen=false): %v", err)
	}
	if len(closedTrend.Points) < 2 {
		t.Fatalf("closed trend has %d points, want at least 2", len(closedTrend.Points))
	}
	sawNonPass := false
	for _, pt := range closedTrend.Points {
		for status, count := range pt.Counts {
			if status != domain.StatusPass && count > 0 {
				sawNonPass = true
			}
		}
	}
	if !sawNonPass {
		t.Error("no closed-run point has a non-pass status — the chart would show only solid-pass bars")
	}

	openTrend, err := svc.SuiteTrend(actorCtx, regression.ID, true)
	if err != nil {
		t.Fatalf("SuiteTrend(includeOpen=true): %v", err)
	}
	if len(openTrend.Points) != len(closedTrend.Points)+1 {
		t.Fatalf("includeOpen trend has %d points, want %d (closed + 1 trailing open)", len(openTrend.Points), len(closedTrend.Points)+1)
	}
	last := openTrend.Points[len(openTrend.Points)-1]
	if !last.IsOpen {
		t.Error("the trailing point in the includeOpen trend is not marked IsOpen")
	}
}

// TestSeedContentShowcasesRetestOnOpenRun covers add-run-row-status-actions:
// the run board's new single-row "Retest" context-menu item only appears
// for a failed item on an open run, so the Sample Project needs at least
// one to actually demonstrate it — not just closed-run history.
func TestSeedContentShowcasesRetestOnOpenRun(t *testing.T) {
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
	var nightly *domain.Run
	for i, r := range runs {
		if r.Name == "Nightly — main" {
			nightly = &runs[i]
		}
	}
	if nightly == nil {
		t.Fatal("missing the \"Nightly — main\" run")
	}
	if nightly.Status != domain.RunStatusOpen {
		t.Fatalf("Nightly — main status = %q, want open", nightly.Status)
	}

	items, err := svc.RunItems(actorCtx, nightly.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	sawFailed := false
	for _, it := range items {
		if it.CurrentStatus == domain.StatusFailed {
			sawFailed = true
		}
	}
	if !sawFailed {
		t.Error("no failed item on the open Nightly run — Retest has nothing real to showcase")
	}
}

func TestSeedContentShowcasesAssigneeRestrictedRecording(t *testing.T) {
	svc := seededService(t)
	ctx := context.Background()
	if err := sampledata.Seed(ctx, svc); err != nil {
		t.Fatalf("Seed: %v", err)
	}
	actorCtx := adminActorCtx(t, svc)
	projects, _ := svc.ListProjects(actorCtx)
	// ListProjects doesn't project assigneeRestrictedRecording (same scope
	// as autoArchiveExempt — a settings-page-only field, not needed in list
	// views); GetProject is the accurate single-project read.
	p, err := svc.GetProject(actorCtx, projects[0].ID)
	if err != nil {
		t.Fatalf("GetProject: %v", err)
	}
	if !p.AssigneeRestrictedRecording {
		t.Fatal("Sample Project AssigneeRestrictedRecording = false, want true")
	}

	users, err := svc.ListUsers(context.Background())
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	var julia, sam domain.User
	for _, u := range users {
		switch u.Email {
		case "julia@example.com":
			julia = u
		case "sam@example.com":
			sam = u
		}
	}
	if julia.ID == "" || sam.ID == "" {
		t.Fatal("missing seeded demo users julia/sam")
	}

	runs, err := svc.ListRuns(actorCtx, p.ID)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	var sprintRun *domain.Run
	for i, r := range runs {
		if r.Name == "Sprint 12 execution" {
			sprintRun = &runs[i]
		}
	}
	if sprintRun == nil {
		t.Fatal("missing the \"Sprint 12 execution\" run")
	}

	items, err := svc.RunItems(actorCtx, sprintRun.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	var juliaItem, unassignedItem *domain.RunItem
	for i, it := range items {
		if it.Assignee != nil && it.Assignee.ID == julia.ID {
			juliaItem = &items[i]
		}
		if it.Assignee == nil {
			unassignedItem = &items[i]
		}
	}
	if juliaItem == nil || unassignedItem == nil {
		t.Fatal("\"Sprint 12 execution\" must have both a julia-assigned item and an unassigned item to showcase both branches")
	}

	juliaCtx := domain.WithActor(context.Background(), domain.Actor{
		ID: julia.ID, Kind: domain.ActorKindUser, DisplayName: julia.Email, EffectiveUserID: julia.ID,
	})
	samCtx := domain.WithActor(context.Background(), domain.Actor{
		ID: sam.ID, Kind: domain.ActorKindUser, DisplayName: sam.Email, EffectiveUserID: sam.ID,
	})

	if _, err := svc.RecordResult(juliaCtx, juliaItem.ID, domain.NewResult{Verdict: domain.VerdictPass}); err != nil {
		t.Errorf("julia recording against her own assigned item = %v, want success", err)
	}
	_, err = svc.RecordResult(samCtx, juliaItem.ID, domain.NewResult{Verdict: domain.VerdictPass})
	var ferr *service.ForbiddenError
	if err == nil || !errors.As(err, &ferr) {
		t.Errorf("sam recording against julia's assigned item = %v, want ForbiddenError", err)
	}
	if _, err := svc.RecordResult(samCtx, unassignedItem.ID, domain.NewResult{Verdict: domain.VerdictPass}); err != nil {
		t.Errorf("sam recording against the still-unassigned item = %v, want success", err)
	}
}
