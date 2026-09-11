package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// Requirement CRUD carries no actor/permission parameter, matching
// Release/TestPlan CRUD's shape (add-requirements-traceability design.md
// D4) — manageProject is enforced by requirePermission at the routing
// layer (see server/requirements_api_test.go for the 403 coverage), not
// here.

func TestCreateRequirement(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	req, err := s.CreateRequirement(ctx, p.ID, "Guest checkout", "desc", "JIRA-1")
	if err != nil {
		t.Fatalf("CreateRequirement: %v", err)
	}
	if req.Key == "" {
		t.Error("requirement created with no key")
	}
}

func TestCreateRequirementRejectsEmptyName(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	_, err = s.CreateRequirement(ctx, p.ID, "", "", "")
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("CreateRequirement with empty name = %v, want ValidationError", err)
	}
}

func TestUpdateRequirement(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	req, err := s.CreateRequirement(ctx, p.ID, "Guest checkout", "", "")
	if err != nil {
		t.Fatalf("CreateRequirement: %v", err)
	}

	updated, err := s.UpdateRequirement(ctx, req.ID, "Guest checkout v2", "updated", "JIRA-2")
	if err != nil {
		t.Fatalf("UpdateRequirement: %v", err)
	}
	if updated.Name != "Guest checkout v2" || updated.ExternalRef != "JIRA-2" {
		t.Errorf("UpdateRequirement did not persist: %+v", updated)
	}
}

func TestDeleteRequirementRejectedWithLinkedCases(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	req, err := s.CreateRequirement(ctx, p.ID, "Guest checkout", "", "")
	if err != nil {
		t.Fatalf("CreateRequirement: %v", err)
	}
	c, err := st.Cases.Create(ctx, p.ID, "", domain.CaseContent{Title: "case one", Steps: []domain.Step{{Action: "a", Expected: "b"}}}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	if err := s.LinkRequirementCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("LinkRequirementCase: %v", err)
	}

	if err := s.DeleteRequirement(ctx, req.ID); err == nil {
		t.Error("DeleteRequirement with linked cases succeeded, want rejection")
	}
}

func TestLinkRequirementCaseRejectsCaseFromDifferentProject(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	projectA, err := st.Projects.Create(ctx, "Project A", "")
	if err != nil {
		t.Fatalf("create project A: %v", err)
	}
	projectB, err := st.Projects.Create(ctx, "Project B", "")
	if err != nil {
		t.Fatalf("create project B: %v", err)
	}
	req, err := s.CreateRequirement(ctx, projectA.ID, "Guest checkout", "", "")
	if err != nil {
		t.Fatalf("CreateRequirement: %v", err)
	}
	caseB, err := st.Cases.Create(ctx, projectB.ID, "", domain.CaseContent{Title: "case b", Steps: []domain.Step{{Action: "a", Expected: "b"}}}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case under project B: %v", err)
	}

	err = s.LinkRequirementCase(ctx, req.ID, caseB.ID)
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("LinkRequirementCase with cross-project case = %v, want ValidationError", err)
	}
}

func TestLinkRequirementCaseAcceptsCaseFromSameProject(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	req, err := s.CreateRequirement(ctx, p.ID, "Guest checkout", "", "")
	if err != nil {
		t.Fatalf("CreateRequirement: %v", err)
	}
	c, err := st.Cases.Create(ctx, p.ID, "", domain.CaseContent{Title: "case one", Steps: []domain.Step{{Action: "a", Expected: "b"}}}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}

	if err := s.LinkRequirementCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("LinkRequirementCase with same-project case = %v, want nil error", err)
	}
}

func TestLinkRequirementCaseIsIdempotentThroughService(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	req, err := s.CreateRequirement(ctx, p.ID, "Guest checkout", "", "")
	if err != nil {
		t.Fatalf("CreateRequirement: %v", err)
	}
	c, err := st.Cases.Create(ctx, p.ID, "", domain.CaseContent{Title: "case one", Steps: []domain.Step{{Action: "a", Expected: "b"}}}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}

	if err := s.LinkRequirementCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("first LinkRequirementCase: %v", err)
	}
	if err := s.LinkRequirementCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("second LinkRequirementCase (should be no-op): %v", err)
	}
}

func TestUnlinkRequirementCase(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	req, err := s.CreateRequirement(ctx, p.ID, "Guest checkout", "", "")
	if err != nil {
		t.Fatalf("CreateRequirement: %v", err)
	}
	c, err := st.Cases.Create(ctx, p.ID, "", domain.CaseContent{Title: "case one", Steps: []domain.Step{{Action: "a", Expected: "b"}}}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	if err := s.LinkRequirementCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("LinkRequirementCase: %v", err)
	}

	if err := s.UnlinkRequirementCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("UnlinkRequirementCase: %v", err)
	}

	got, err := s.GetRequirement(ctx, req.ID)
	if err != nil {
		t.Fatalf("GetRequirement: %v", err)
	}
	if len(got.CaseIDs) != 0 {
		t.Errorf("CaseIDs = %v, want empty after unlink", got.CaseIDs)
	}
}

func TestReleaseRequirementsCoverage(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	rel, err := st.Releases.Create(ctx, p.ID, "2026.1", "", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("create release: %v", err)
	}
	plan, err := st.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create test plan: %v", err)
	}
	req, err := s.CreateRequirement(ctx, p.ID, "Guest checkout", "", "")
	if err != nil {
		t.Fatalf("CreateRequirement: %v", err)
	}
	c, err := st.Cases.Create(ctx, p.ID, "", domain.CaseContent{Title: "case one", Steps: []domain.Step{{Action: "a", Expected: "b"}}}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	if err := s.LinkRequirementCase(ctx, req.ID, c.ID); err != nil {
		t.Fatalf("LinkRequirementCase: %v", err)
	}
	run, err := st.Runs.CreateWithOptions(ctx, p.ID, "run", "", plan.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	items, err := st.Runs.Items(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("list items: %v", err)
	}
	if err := st.Runs.SetItemStatus(ctx, items[0].ID, domain.StatusPass); err != nil {
		t.Fatalf("set item status: %v", err)
	}

	coverage, err := s.ReleaseRequirementsCoverage(ctx, rel.ID)
	if err != nil {
		t.Fatalf("ReleaseRequirementsCoverage: %v", err)
	}
	if len(coverage) != 1 || coverage[0].Status != domain.CoverageCovered {
		t.Errorf("coverage = %+v, want one covered entry", coverage)
	}
}
