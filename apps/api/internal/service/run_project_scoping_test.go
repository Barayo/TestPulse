package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// Regression tests for #159: CreateRun/AddRunItem must confine
// SuiteID/CaseIDs to the target project, the same way
// TestCreateRunRejectsTestPlanFromDifferentProject already guards TestPlanID.

func TestCreateRunRejectsSuiteFromDifferentProject(t *testing.T) {
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
	suiteB, err := s.CreateSuite(ctx, projectB.ID, "iOS suite")
	if err != nil {
		t.Fatalf("create suite under project B: %v", err)
	}

	_, err = s.CreateRun(ctx, projectA.ID, service.RunInput{Name: "smoke", SuiteID: suiteB.ID})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("CreateRun with cross-project suite = %v, want ValidationError", err)
	}
}

func TestCreateRunRejectsCaseIDFromDifferentProject(t *testing.T) {
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
	caseB := mustLifecycleCase(t, s, projectB.ID)

	_, err = s.CreateRun(ctx, projectA.ID, service.RunInput{Name: "smoke", CaseIDs: []string{caseB.ID}})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("CreateRun with cross-project case id = %v, want ValidationError", err)
	}
}

func TestCreateRunAcceptsSuiteAndCasesFromSameProject(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()

	p, err := st.Projects.Create(ctx, "Project A", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	suite, err := s.CreateSuite(ctx, p.ID, "iOS suite")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}
	c := mustLifecycleCase(t, s, p.ID)

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "smoke", SuiteID: suite.ID, CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun with same-project suite and case = %v, want nil error", err)
	}
	if run.Name != "smoke" {
		t.Errorf("run.Name = %q, want %q", run.Name, "smoke")
	}
}

func TestAddRunItemRejectsCaseFromDifferentProject(t *testing.T) {
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
	run, err := s.CreateRun(ctx, projectA.ID, service.RunInput{Name: "smoke"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	caseB := mustLifecycleCase(t, s, projectB.ID)

	_, err = s.AddRunItem(ctx, run.ID, caseB.ID)
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("AddRunItem with cross-project case = %v, want ValidationError", err)
	}
}

func TestAddRunItemAcceptsCaseFromSameProject(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()

	p, err := st.Projects.Create(ctx, "Project A", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "smoke"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	c := mustLifecycleCase(t, s, p.ID)

	if _, err := s.AddRunItem(ctx, run.ID, c.ID); err != nil {
		t.Fatalf("AddRunItem with same-project case = %v, want nil error", err)
	}
}

// TestRunItemsExcludesCrossProjectCaseContent is the defense-in-depth check
// on the read path (store.Runs.Items): even for a row that predates this
// fix (or reaches test_run_items by some other bypass), Items must never
// surface another project's case content. Since the service layer now
// rejects this at write time, the row is planted directly through the
// store to simulate stale/bypassed data.
func TestRunItemsExcludesCrossProjectCaseContent(t *testing.T) {
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
	run, err := s.CreateRun(ctx, projectA.ID, service.RunInput{Name: "smoke"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	caseB := mustLifecycleCase(t, s, projectB.ID)

	if _, err := st.Runs.AddItem(ctx, run.ID, caseB.ID, ""); err != nil {
		t.Fatalf("planting cross-project item directly via store: %v", err)
	}

	items, err := st.Runs.Items(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("Items: %v", err)
	}
	for _, it := range items {
		if it.CaseID == caseB.ID {
			t.Fatalf("Items returned content for case %s from a different project", caseB.ID)
		}
	}
}
