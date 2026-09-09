package service_test

// add-reusable-steps: the core integrity boundary — a case's GroupRef
// step entries are always resolved server-side against the referenced
// step group's real, current content, regardless of what a client
// claims that content is. Tested through CreateCase/EditCase (the public
// contract), not the unexported resolver directly.

import (
	"context"
	"fmt"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func resolutionTestServiceAndStore(t *testing.T) (*service.Service, *store.Store) {
	t.Helper()
	st := store.New(testutil.Pool(t, "step_group_resolution_service"))
	return service.New(st), st
}

func mustResolutionProject(t *testing.T, s *service.Service) domain.Project {
	t.Helper()
	p, err := s.CreateProject(context.Background(), service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	return p
}

func TestCreateCaseResolvesGroupRefToFullStepSequence(t *testing.T) {
	s, st := resolutionTestServiceAndStore(t)
	ctx := context.Background()
	p := mustResolutionProject(t, s)

	group, err := st.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{
		{Action: "open login page"},
		{Action: "enter admin credentials"},
		{Action: "click login", Expected: "dashboard is shown"},
	})
	if err != nil {
		t.Fatalf("StepGroups.Create: %v", err)
	}

	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title:    "Admin can view settings",
		Priority: domain.PriorityMedium,
		Steps: []domain.Step{
			{GroupRef: &domain.StepGroupRef{GroupKey: group.Key}},
			{Action: "open settings", Expected: "settings page is shown"},
		},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	if len(c.Content.Steps) != 4 {
		t.Fatalf("Steps = %d, want 4 (3 from the group + 1 own step)", len(c.Content.Steps))
	}
	if c.Content.Steps[0].Action != "open login page" {
		t.Errorf("Steps[0] = %+v, want the group's first step", c.Content.Steps[0])
	}
	if c.Content.Steps[2].Expected != "dashboard is shown" {
		t.Errorf("Steps[2] = %+v, want the group's third step", c.Content.Steps[2])
	}
	if c.Content.Steps[3].Action != "open settings" {
		t.Errorf("Steps[3] = %+v, want the case's own trailing step", c.Content.Steps[3])
	}
}

func TestCreateCaseIgnoresClientSuppliedContentOnAGroupRef(t *testing.T) {
	s, st := resolutionTestServiceAndStore(t)
	ctx := context.Background()
	p := mustResolutionProject(t, s)

	group, err := st.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{
		{Action: "real step", Expected: "real outcome"},
	})
	if err != nil {
		t.Fatalf("StepGroups.Create: %v", err)
	}

	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title:    "Spoof attempt",
		Priority: domain.PriorityMedium,
		Steps: []domain.Step{
			{
				Action:   "malicious injected step",
				Expected: "attacker-controlled outcome",
				GroupRef: &domain.StepGroupRef{GroupKey: group.Key},
			},
		},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	if len(c.Content.Steps) != 1 {
		t.Fatalf("Steps = %d, want 1", len(c.Content.Steps))
	}
	if c.Content.Steps[0].Action != "real step" || c.Content.Steps[0].Expected != "real outcome" {
		t.Errorf("Steps[0] = %+v, want the group's real content, not the client-supplied spoof", c.Content.Steps[0])
	}
}

func TestCreateCaseRejectsGroupRefFromAnotherProject(t *testing.T) {
	s, st := resolutionTestServiceAndStore(t)
	ctx := context.Background()
	p1 := mustResolutionProject(t, s)
	p2 := mustResolutionProject(t, s)

	group, err := st.StepGroups.Create(ctx, p2.ID, "Other project's group", []domain.Step{{Action: "x"}})
	if err != nil {
		t.Fatalf("StepGroups.Create: %v", err)
	}

	_, err = s.CreateCase(ctx, p1.ID, "", domain.CaseContent{
		Title:    "Cross-project reference attempt",
		Priority: domain.PriorityMedium,
		Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: group.Key}}},
	})
	if err == nil {
		t.Fatal("CreateCase with a group ref from a different project = nil error, want rejected")
	}
}

func TestCreateCaseRejectsUnknownGroupKey(t *testing.T) {
	s := resolutionTestService(t)
	ctx := context.Background()
	p := mustResolutionProject(t, s)

	_, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title:    "Unknown group",
		Priority: domain.PriorityMedium,
		Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: "SP-SG999"}}},
	})
	if err == nil {
		t.Fatal("CreateCase with an unknown group key = nil error, want rejected")
	}
}

// Security review finding (add-reusable-steps, post-implementation Luis
// pass): "not found" and "belongs to another project" used to be two
// distinguishable error messages, letting any actor with case-create
// access to one project probe whether a specific step-group key exists in
// a project they can't otherwise see into (group keys are predictable,
// sequential per project). Both cases must now produce the identical
// generic message, matching validateCustomFieldValuesAgainst's existing
// precedent for the same class of leak.
func TestCreateCaseGivesIdenticalErrorForUnknownAndCrossProjectGroupKeys(t *testing.T) {
	s, st := resolutionTestServiceAndStore(t)
	ctx := context.Background()
	p1 := mustResolutionProject(t, s)
	p2 := mustResolutionProject(t, s)

	otherGroup, err := st.StepGroups.Create(ctx, p2.ID, "Other project's group", []domain.Step{{Action: "x"}})
	if err != nil {
		t.Fatalf("StepGroups.Create: %v", err)
	}

	_, unknownErr := s.CreateCase(ctx, p1.ID, "", domain.CaseContent{
		Title:    "Unknown group",
		Priority: domain.PriorityMedium,
		Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: "SP-SG999"}}},
	})
	_, crossProjectErr := s.CreateCase(ctx, p1.ID, "", domain.CaseContent{
		Title:    "Cross-project reference attempt",
		Priority: domain.PriorityMedium,
		Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: otherGroup.Key}}},
	})
	if unknownErr == nil || crossProjectErr == nil {
		t.Fatalf("expected both to be rejected, got unknownErr=%v crossProjectErr=%v", unknownErr, crossProjectErr)
	}
	wantUnknown := `step group "SP-SG999" not found`
	wantCrossProject := fmt.Sprintf("step group %q not found", otherGroup.Key)
	if unknownErr.Error() != wantUnknown {
		t.Fatalf("unknown-key error = %q, want %q", unknownErr.Error(), wantUnknown)
	}
	if crossProjectErr.Error() != wantCrossProject {
		t.Fatalf("cross-project error = %q, want %q — a message that instead reveals the group belongs to another project is an existence oracle", crossProjectErr.Error(), wantCrossProject)
	}
}

func TestEditingSourceGroupDoesNotChangeAnAlreadySavedCaseVersion(t *testing.T) {
	s, st := resolutionTestServiceAndStore(t)
	ctx := context.Background()
	p := mustResolutionProject(t, s)

	group, err := st.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{{Action: "original step"}})
	if err != nil {
		t.Fatalf("StepGroups.Create: %v", err)
	}
	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title:    "Uses the group",
		Priority: domain.PriorityMedium,
		Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: group.Key}}},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	if _, err := st.StepGroups.Update(ctx, group.ID, "Log in as admin", []domain.Step{{Action: "changed step"}}); err != nil {
		t.Fatalf("StepGroups.Update: %v", err)
	}

	versions, err := s.CaseVersions(ctx, c.ID)
	if err != nil {
		t.Fatalf("CaseVersions: %v", err)
	}
	if len(versions) != 1 {
		t.Fatalf("versions = %d, want 1", len(versions))
	}
	if versions[0].Content.Steps[0].Action != "original step" {
		t.Errorf("saved version's step = %q, want unchanged %q after the source group was edited", versions[0].Content.Steps[0].Action, "original step")
	}
}

// TestEditingCaseWithoutRefreshingKeepsThePreviousSnapshot is the fix for
// the bug Pepe's design pass found: resolveStepGroupRefs used to
// unconditionally re-resolve every GroupRef entry to the group's *live*
// content on every save, including an edit that never touched that
// block — silently defeating the "staleness is surfaced, never applied
// silently" guarantee (spec.md). A client that resends the exact
// SnapshotUpdatedAt it was last given (i.e. never explicitly refreshed)
// must get back the same content it already had, not the group's latest.
func TestEditingCaseWithoutRefreshingKeepsThePreviousSnapshot(t *testing.T) {
	s, st := resolutionTestServiceAndStore(t)
	ctx := context.Background()
	p := mustResolutionProject(t, s)

	group, err := st.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{{Action: "original step"}})
	if err != nil {
		t.Fatalf("StepGroups.Create: %v", err)
	}
	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title:    "Uses the group",
		Priority: domain.PriorityMedium,
		Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: group.Key}}},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	originalSnapshotUpdatedAt := c.Content.Steps[0].GroupRef.SnapshotUpdatedAt

	if _, err := st.StepGroups.Update(ctx, group.ID, "Log in as admin", []domain.Step{{Action: "changed step"}}); err != nil {
		t.Fatalf("StepGroups.Update: %v", err)
	}

	// The client resends exactly what it was given before — the OLD
	// SnapshotUpdatedAt, not the group's current one — because it never
	// showed the author a refresh action for this block.
	edited, err := s.EditCase(ctx, c.ID, domain.CaseContent{
		Title:    "Uses the group (renamed, unrelated edit)",
		Priority: domain.PriorityMedium,
		Steps: []domain.Step{{GroupRef: &domain.StepGroupRef{
			GroupKey: group.Key, SnapshotUpdatedAt: originalSnapshotUpdatedAt,
		}}},
	})
	if err != nil {
		t.Fatalf("EditCase: %v", err)
	}
	if edited.Content.Steps[0].Action != "original step" {
		t.Errorf("edited version's step = %q, want the previously-saved snapshot %q (not silently updated)", edited.Content.Steps[0].Action, "original step")
	}
}

// TestEditingCaseWithAnExplicitRefreshPicksUpTheGroupsNewContent is the
// companion to the fix above: a client that DID show the author the
// staleness pill and DID refresh sends back the group's *current*
// UpdatedAt as its SnapshotUpdatedAt — that's the signal the server acts
// on to actually pull in new content.
func TestEditingCaseWithAnExplicitRefreshPicksUpTheGroupsNewContent(t *testing.T) {
	s, st := resolutionTestServiceAndStore(t)
	ctx := context.Background()
	p := mustResolutionProject(t, s)

	group, err := st.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{{Action: "original step"}})
	if err != nil {
		t.Fatalf("StepGroups.Create: %v", err)
	}
	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title:    "Uses the group",
		Priority: domain.PriorityMedium,
		Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: group.Key}}},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	updatedGroup, err := st.StepGroups.Update(ctx, group.ID, "Log in as admin", []domain.Step{{Action: "changed step"}})
	if err != nil {
		t.Fatalf("StepGroups.Update: %v", err)
	}

	// The client refreshed: it fetched the group's current UpdatedAt and
	// sends that back, signaling "I've caught up to the latest."
	edited, err := s.EditCase(ctx, c.ID, domain.CaseContent{
		Title:    "Uses the group",
		Priority: domain.PriorityMedium,
		Steps: []domain.Step{{GroupRef: &domain.StepGroupRef{
			GroupKey: group.Key, SnapshotUpdatedAt: updatedGroup.UpdatedAt,
		}}},
	})
	if err != nil {
		t.Fatalf("EditCase: %v", err)
	}
	if edited.Content.Steps[0].Action != "changed step" {
		t.Errorf("edited version's step = %q, want the group's new content %q after an explicit refresh", edited.Content.Steps[0].Action, "changed step")
	}
}

// TestEditingCaseWithAGroupRefNotFoundInThePreviousVersionResolvesFresh
// covers the fallback: an entry whose declared SnapshotUpdatedAt doesn't
// match anything actually persisted in the case's previous version (a
// brand-new reference just inserted in this edit, or a garbage value) has
// nothing safe to carry forward, so the server resolves it fresh from the
// group's current content — the same safe default CreateCase always uses.
func TestEditingCaseWithAGroupRefNotFoundInThePreviousVersionResolvesFresh(t *testing.T) {
	s, st := resolutionTestServiceAndStore(t)
	ctx := context.Background()
	p := mustResolutionProject(t, s)

	group, err := st.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{{Action: "current step"}})
	if err != nil {
		t.Fatalf("StepGroups.Create: %v", err)
	}
	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title:    "No group ref yet",
		Priority: domain.PriorityMedium,
		Steps:    []domain.Step{{Action: "plain step"}},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	// The author inserts a brand-new group reference in this edit — there
	// is nothing in the previous version to carry forward for it.
	edited, err := s.EditCase(ctx, c.ID, domain.CaseContent{
		Title:    "Now references the group",
		Priority: domain.PriorityMedium,
		Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: group.Key}}},
	})
	if err != nil {
		t.Fatalf("EditCase: %v", err)
	}
	if edited.Content.Steps[0].Action != "current step" {
		t.Errorf("edited version's step = %q, want the group's current content %q for a newly-inserted reference", edited.Content.Steps[0].Action, "current step")
	}
}

func TestGroupRefStepStampsSnapshotUpdatedAtToTheGroupsUpdatedAt(t *testing.T) {
	s, st := resolutionTestServiceAndStore(t)
	ctx := context.Background()
	p := mustResolutionProject(t, s)

	group, err := st.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{{Action: "a"}})
	if err != nil {
		t.Fatalf("StepGroups.Create: %v", err)
	}

	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title:    "Uses the group",
		Priority: domain.PriorityMedium,
		Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: group.Key}}},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	if c.Content.Steps[0].GroupRef == nil {
		t.Fatal("resolved step lost its GroupRef")
	}
	if !c.Content.Steps[0].GroupRef.SnapshotUpdatedAt.Equal(group.UpdatedAt) {
		t.Errorf("SnapshotUpdatedAt = %v, want the group's UpdatedAt %v", c.Content.Steps[0].GroupRef.SnapshotUpdatedAt, group.UpdatedAt)
	}
	if c.Content.Steps[0].GroupRef.GroupID != group.ID {
		t.Errorf("GroupRef.GroupID = %q, want %q", c.Content.Steps[0].GroupRef.GroupID, group.ID)
	}
}

// TestCreateCaseResolvesAnAlreadyExpandedRunOfTheSameGroupOnce is a
// regression test for a real bug caught by e2e testing (not code review):
// a case's steps aren't always a single GroupRef entry per reference — a
// case loaded from an already-saved version (or a client that pre-expands
// a reference into N flat steps client-side, matching what the server
// itself would produce) sends back N separate steps that all carry the
// *same* GroupRef. Resolving each of those N entries independently would
// re-expand the group N times, producing N*len(group.Steps) steps instead
// of len(group.Steps) — silent, compounding duplication on every re-save
// that touches an unrelated field. A contiguous run sharing one GroupRef
// must resolve exactly once, however many raw entries currently represent
// it.
func TestCreateCaseResolvesAnAlreadyExpandedRunOfTheSameGroupOnce(t *testing.T) {
	s, st := resolutionTestServiceAndStore(t)
	ctx := context.Background()
	p := mustResolutionProject(t, s)

	group, err := st.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{
		{Action: "open login page"}, {Action: "enter credentials"},
	})
	if err != nil {
		t.Fatalf("StepGroups.Create: %v", err)
	}
	ref := &domain.StepGroupRef{GroupKey: group.Key, SnapshotUpdatedAt: group.UpdatedAt}

	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title:    "Pre-expanded reference",
		Priority: domain.PriorityMedium,
		Steps: []domain.Step{
			{Action: "open login page", GroupRef: ref},
			{Action: "enter credentials", GroupRef: ref},
			{Action: "own trailing step"},
		},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	if len(c.Content.Steps) != 3 {
		t.Fatalf("Steps = %d, want 3 (2 from the group, resolved once, + 1 own step) — got %+v", len(c.Content.Steps), c.Content.Steps)
	}
	if c.Content.Steps[2].Action != "own trailing step" {
		t.Errorf("Steps[2] = %+v, want the trailing own step", c.Content.Steps[2])
	}
}

func resolutionTestService(t *testing.T) *service.Service {
	t.Helper()
	s, _ := resolutionTestServiceAndStore(t)
	return s
}
