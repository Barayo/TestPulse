package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func mustRequirement(t *testing.T, s *store.Store, projectID, name string) domain.Requirement {
	t.Helper()
	req, err := s.Requirements.Create(context.Background(), projectID, name, "", "")
	if err != nil {
		t.Fatalf("create requirement: %v", err)
	}
	return req
}

func TestRequirementCreateClaimsKey(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	req, err := s.Requirements.Create(ctx, p.ID, "Guest checkout", "Users can check out without an account", "JIRA-123")
	if err != nil {
		t.Fatalf("create requirement: %v", err)
	}
	if req.Key == "" {
		t.Error("requirement created with no key")
	}
	if req.ProjectID != p.ID {
		t.Errorf("ProjectID = %q, want %q", req.ProjectID, p.ID)
	}
	if req.ExternalRef != "JIRA-123" {
		t.Errorf("ExternalRef = %q, want JIRA-123", req.ExternalRef)
	}

	req2, err := s.Requirements.Create(ctx, p.ID, "Saved-card checkout", "", "")
	if err != nil {
		t.Fatalf("create second requirement: %v", err)
	}
	if req.Key == req2.Key {
		t.Errorf("both requirements got the same key %q", req.Key)
	}
}

func TestRequirementGetByID(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	req := mustRequirement(t, s, p.ID, "Guest checkout")

	got, err := s.Requirements.Get(ctx, req.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Name != "Guest checkout" {
		t.Errorf("Name = %q, want %q", got.Name, "Guest checkout")
	}
}

func TestRequirementList(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	mustRequirement(t, s, p.ID, "Guest checkout")
	mustRequirement(t, s, p.ID, "Saved-card checkout")

	list, err := s.Requirements.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 2 {
		t.Errorf("List returned %d requirements, want 2", len(list))
	}
}

func TestRequirementUpdate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	req := mustRequirement(t, s, p.ID, "Guest checkout")

	req.Name = "Guest checkout flow"
	req.Description = "updated"
	req.ExternalRef = "JIRA-999"
	updated, err := s.Requirements.Update(ctx, req)
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != "Guest checkout flow" || updated.Description != "updated" || updated.ExternalRef != "JIRA-999" {
		t.Errorf("Update did not persist: %+v", updated)
	}
}

func TestRequirementDeleteSucceedsWhenNoLinkedCases(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	req := mustRequirement(t, s, p.ID, "Guest checkout")

	if err := s.Requirements.Delete(ctx, req.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Requirements.Get(ctx, req.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get after delete = %v, want ErrNotFound", err)
	}
}

func TestRequirementDeleteRejectedWithLinkedCases(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	c := mustCase(t, s, p.ID, "case one")
	if err := s.Requirements.LinkCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("LinkCase: %v", err)
	}

	err := s.Requirements.Delete(ctx, req.ID)
	if !errors.Is(err, store.ErrHasChildren) {
		t.Errorf("Delete with linked cases = %v, want ErrHasChildren", err)
	}
	if _, err := s.Requirements.Get(ctx, req.ID); err != nil {
		t.Errorf("requirement should still exist after rejected delete: %v", err)
	}
}

func TestRequirementLinkCaseIsIdempotent(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	c := mustCase(t, s, p.ID, "case one")

	if err := s.Requirements.LinkCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("first LinkCase: %v", err)
	}
	if err := s.Requirements.LinkCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("second LinkCase (should be no-op): %v", err)
	}

	got, err := s.Requirements.Get(ctx, req.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.CaseIDs) != 1 {
		t.Errorf("CaseIDs = %v, want exactly one entry", got.CaseIDs)
	}
}

func TestRequirementUnlinkCaseRemovesOnlyTheLink(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	c := mustCase(t, s, p.ID, "case one")
	if err := s.Requirements.LinkCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("LinkCase: %v", err)
	}

	if err := s.Requirements.UnlinkCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("UnlinkCase: %v", err)
	}

	got, err := s.Requirements.Get(ctx, req.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.CaseIDs) != 0 {
		t.Errorf("CaseIDs = %v, want empty after unlink", got.CaseIDs)
	}
	if _, err := s.Cases.Get(ctx, c.ID); err != nil {
		t.Errorf("case should still exist after unlink: %v", err)
	}
}

func TestRequirementCaseDeleteOnCaseSoftDelete(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	c := mustCase(t, s, p.ID, "case one")
	if err := s.Requirements.LinkCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("LinkCase: %v", err)
	}

	if err := s.Cases.SoftDelete(ctx, c.ID); err != nil {
		t.Fatalf("soft-delete case: %v", err)
	}

	// Matches SuiteRepo.Get's precedent: a soft-deleted case is filtered
	// out of the linked-cases list (its join row isn't force-removed since
	// case deletion is soft, not a hard row delete).
	got, err := s.Requirements.Get(ctx, req.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.CaseIDs) != 0 {
		t.Errorf("CaseIDs = %v, want empty after linked case is soft-deleted", got.CaseIDs)
	}
	if err := s.Requirements.Delete(ctx, req.ID); err != nil {
		t.Errorf("Delete after case soft-deletion = %v, want success", err)
	}
}

func TestRequirementDeleteCascadesItsOwnLinkRows(t *testing.T) {
	// Deleting a requirement removes its requirement_cases rows via
	// ON DELETE CASCADE (requirement_id) even though the case itself is
	// untouched — proven by a second, independent requirement being able
	// to link the exact same case immediately afterward without a PK
	// conflict from a leftover row under the deleted requirement's own id.
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	c := mustCase(t, s, p.ID, "case one")
	if err := s.Requirements.LinkCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("LinkCase: %v", err)
	}
	if err := s.Requirements.UnlinkCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("unlink before delete: %v", err)
	}
	if err := s.Requirements.Delete(ctx, req.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	req2 := mustRequirement(t, s, p.ID, "Guest checkout v2")
	if err := s.Requirements.LinkCase(ctx, req2.ID, c.ID); err != nil {
		t.Fatalf("LinkCase after prior requirement deleted: %v", err)
	}
}

// --- Coverage rollup (add-requirements-traceability design.md D3) ---

func TestCoverageForReleaseZeroLinkedCasesIsNotRun(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	mustRequirement(t, s, p.ID, "Guest checkout")

	coverage, err := s.Requirements.CoverageForRelease(ctx, rel.ID)
	if err != nil {
		t.Fatalf("CoverageForRelease: %v", err)
	}
	if len(coverage) != 1 || coverage[0].Status != domain.CoverageNotRun {
		t.Errorf("coverage = %+v, want one notRun entry", coverage)
	}
}

func TestCoverageForReleaseUnrunLinkedCaseIsNotRun(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create plan: %v", err)
	}
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	passingCase := mustCase(t, s, p.ID, "passing case")
	unrunCase := mustCase(t, s, p.ID, "unrun case")
	linkAndRun(t, s, req.ID, plan.ID, p.ID, passingCase.ID, domain.StatusPass)
	if err := s.Requirements.LinkCase(ctx, req.ID, unrunCase.ID); err != nil {
		t.Fatalf("LinkCase unrunCase: %v", err)
	}

	coverage, err := s.Requirements.CoverageForRelease(ctx, rel.ID)
	if err != nil {
		t.Fatalf("CoverageForRelease: %v", err)
	}
	if len(coverage) != 1 || coverage[0].Status != domain.CoverageNotRun {
		t.Errorf("coverage = %+v, want one notRun entry", coverage)
	}
}

func TestCoverageForReleaseFailedLinkedCaseIsFailing(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create plan: %v", err)
	}
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	passingCase := mustCase(t, s, p.ID, "passing case")
	failingCase := mustCase(t, s, p.ID, "failing case")
	linkAndRun(t, s, req.ID, plan.ID, p.ID, passingCase.ID, domain.StatusPass)
	linkAndRun(t, s, req.ID, plan.ID, p.ID, failingCase.ID, domain.StatusFailed)

	coverage, err := s.Requirements.CoverageForRelease(ctx, rel.ID)
	if err != nil {
		t.Fatalf("CoverageForRelease: %v", err)
	}
	if len(coverage) != 1 || coverage[0].Status != domain.CoverageFailing {
		t.Errorf("coverage = %+v, want one failing entry", coverage)
	}
}

func TestCoverageForReleaseBlockedLinkedCaseIsFailing(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create plan: %v", err)
	}
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	blockedCase := mustCase(t, s, p.ID, "blocked case")
	linkAndRun(t, s, req.ID, plan.ID, p.ID, blockedCase.ID, domain.StatusBlocked)

	coverage, err := s.Requirements.CoverageForRelease(ctx, rel.ID)
	if err != nil {
		t.Fatalf("CoverageForRelease: %v", err)
	}
	if len(coverage) != 1 || coverage[0].Status != domain.CoverageFailing {
		t.Errorf("coverage = %+v, want one failing entry", coverage)
	}
}

func TestCoverageForReleaseAllPassingIsCovered(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create plan: %v", err)
	}
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	caseA := mustCase(t, s, p.ID, "case a")
	caseB := mustCase(t, s, p.ID, "case b")
	linkAndRun(t, s, req.ID, plan.ID, p.ID, caseA.ID, domain.StatusPass)
	linkAndRun(t, s, req.ID, plan.ID, p.ID, caseB.ID, domain.StatusPass)

	coverage, err := s.Requirements.CoverageForRelease(ctx, rel.ID)
	if err != nil {
		t.Fatalf("CoverageForRelease: %v", err)
	}
	if len(coverage) != 1 || coverage[0].Status != domain.CoverageCovered {
		t.Errorf("coverage = %+v, want one covered entry", coverage)
	}
}

func TestCoverageForReleaseSkippedFoldsIntoNotRun(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create plan: %v", err)
	}
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	skippedCase := mustCase(t, s, p.ID, "skipped case")
	linkAndRun(t, s, req.ID, plan.ID, p.ID, skippedCase.ID, domain.StatusSkipped)

	coverage, err := s.Requirements.CoverageForRelease(ctx, rel.ID)
	if err != nil {
		t.Fatalf("CoverageForRelease: %v", err)
	}
	if len(coverage) != 1 || coverage[0].Status != domain.CoverageNotRun {
		t.Errorf("coverage = %+v, want one notRun entry (skipped folds into notRun)", coverage)
	}
}

func TestCoverageForReleaseDifferentReleaseDoesNotCount(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	relA := mustRelease(t, s, p.ID, "2026.1")
	relB := mustRelease(t, s, p.ID, "2026.2")
	planA, err := s.TestPlans.Create(ctx, p.ID, relA.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create plan A: %v", err)
	}
	if _, err := s.TestPlans.Create(ctx, p.ID, relB.ID, "iOS", ""); err != nil {
		t.Fatalf("create plan B: %v", err)
	}
	req := mustRequirement(t, s, p.ID, "Guest checkout")
	c := mustCase(t, s, p.ID, "case a")
	linkAndRun(t, s, req.ID, planA.ID, p.ID, c.ID, domain.StatusPass)

	coverageB, err := s.Requirements.CoverageForRelease(ctx, relB.ID)
	if err != nil {
		t.Fatalf("CoverageForRelease relB: %v", err)
	}
	if len(coverageB) != 1 || coverageB[0].Status != domain.CoverageNotRun {
		t.Errorf("relB coverage = %+v, want notRun (result belongs to a different release)", coverageB)
	}

	coverageA, err := s.Requirements.CoverageForRelease(ctx, relA.ID)
	if err != nil {
		t.Fatalf("CoverageForRelease relA: %v", err)
	}
	if len(coverageA) != 1 || coverageA[0].Status != domain.CoverageCovered {
		t.Errorf("relA coverage = %+v, want covered", coverageA)
	}
}

// linkAndRun links a case to a requirement, then creates a run scoped to
// testPlanID containing only that case and sets its item to status.
func linkAndRun(t *testing.T, s *store.Store, requirementID, testPlanID, projectID, caseID string, status domain.Status) {
	t.Helper()
	ctx := context.Background()
	if err := s.Requirements.LinkCase(ctx, requirementID, caseID); err != nil {
		t.Fatalf("LinkCase: %v", err)
	}
	run, err := s.Runs.CreateWithOptions(ctx, projectID, "run for "+caseID, "", testPlanID, []string{caseID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("list items: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected exactly one item, got %d", len(items))
	}
	if status == domain.StatusPending {
		return
	}
	if err := s.Runs.SetItemStatus(ctx, items[0].ID, status); err != nil {
		t.Fatalf("set item status: %v", err)
	}
}
