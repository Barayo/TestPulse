package store_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestTestPlanCreateScopedToRelease(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")

	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "iOS regression")
	if err != nil {
		t.Fatalf("create test plan: %v", err)
	}
	if plan.Key == "" {
		t.Error("test plan created with no key")
	}
	if plan.ReleaseID != rel.ID {
		t.Errorf("ReleaseID = %q, want %q", plan.ReleaseID, rel.ID)
	}
	if plan.ReleaseKey != rel.Key {
		t.Errorf("ReleaseKey = %q, want %q", plan.ReleaseKey, rel.Key)
	}
}

func TestTestPlanGetByKey(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create test plan: %v", err)
	}

	id, err := s.TestPlans.IDByKey(ctx, plan.Key)
	if err != nil {
		t.Fatalf("IDByKey: %v", err)
	}
	got, err := s.TestPlans.Get(ctx, id)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Name != "iOS" {
		t.Errorf("Name = %q, want %q", got.Name, "iOS")
	}
}

func TestTestPlanListByRelease(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	otherRel := mustRelease(t, s, p.ID, "2026.2")

	if _, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", ""); err != nil {
		t.Fatalf("create iOS plan: %v", err)
	}
	if _, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "Android", ""); err != nil {
		t.Fatalf("create Android plan: %v", err)
	}
	if _, err := s.TestPlans.Create(ctx, p.ID, otherRel.ID, "Web", ""); err != nil {
		t.Fatalf("create Web plan: %v", err)
	}

	plans, err := s.TestPlans.ListByRelease(ctx, rel.ID)
	if err != nil {
		t.Fatalf("ListByRelease: %v", err)
	}
	if len(plans) != 2 {
		t.Fatalf("ListByRelease = %d plans, want 2", len(plans))
	}
}

func TestTestPlanListByProjectAcrossReleases(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	otherProject := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	otherRel := mustRelease(t, s, p.ID, "2026.2")
	foreignRel := mustRelease(t, s, otherProject.ID, "9.0")

	if _, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", ""); err != nil {
		t.Fatalf("create iOS plan: %v", err)
	}
	if _, err := s.TestPlans.Create(ctx, p.ID, otherRel.ID, "Web", ""); err != nil {
		t.Fatalf("create Web plan: %v", err)
	}
	if _, err := s.TestPlans.Create(ctx, otherProject.ID, foreignRel.ID, "Desktop", ""); err != nil {
		t.Fatalf("create Desktop plan: %v", err)
	}

	plans, err := s.TestPlans.ListByProject(ctx, p.ID)
	if err != nil {
		t.Fatalf("ListByProject: %v", err)
	}
	if len(plans) != 2 {
		t.Fatalf("ListByProject = %d plans, want 2 (scoped to project, across its releases)", len(plans))
	}
	for _, plan := range plans {
		if plan.ProjectID != p.ID {
			t.Errorf("plan %q ProjectID = %q, want %q", plan.Name, plan.ProjectID, p.ID)
		}
	}
}

func TestTestPlanUpdate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create test plan: %v", err)
	}

	plan.Name = "iOS (renamed)"
	plan.Description = "updated"
	updated, err := s.TestPlans.Update(ctx, plan)
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != "iOS (renamed)" || updated.Description != "updated" {
		t.Errorf("Update result = %+v", updated)
	}
}

// makeRunWithPassRate creates a run scoped to testPlanID with n items, sets
// passing of them to 'pass', and leaves the rest at their pinned default —
// a helper for rollup tests, not itself a spec requirement.
func makeRunWithPassRate(t *testing.T, s *store.Store, projectID, testPlanID, name string, n, passing int) {
	t.Helper()
	ctx := context.Background()
	caseIDs := make([]string, n)
	for i := 0; i < n; i++ {
		caseIDs[i] = mustCase(t, s, projectID, fmt.Sprintf("%s case %d", name, i)).ID
	}
	run, err := s.Runs.CreateWithOptions(ctx, projectID, name, "", testPlanID, caseIDs)
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("list items: %v", err)
	}
	for i := 0; i < passing; i++ {
		if err := s.Runs.SetItemStatus(ctx, items[i].ID, domain.StatusPass); err != nil {
			t.Fatalf("set item status: %v", err)
		}
	}
}

func TestTestPlanRollupAggregatesAcrossRuns(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create test plan: %v", err)
	}
	makeRunWithPassRate(t, s, p.ID, plan.ID, "run-a", 5, 5)
	makeRunWithPassRate(t, s, p.ID, plan.ID, "run-b", 5, 3)

	rollup, err := s.TestPlans.Rollup(ctx, plan.ID)
	if err != nil {
		t.Fatalf("Rollup: %v", err)
	}
	if rollup.RunCount != 2 {
		t.Errorf("RunCount = %d, want 2", rollup.RunCount)
	}
	if rollup.PassRate == nil || *rollup.PassRate != 80 {
		t.Errorf("PassRate = %v, want 80", rollup.PassRate)
	}
}

func TestTestPlanRollupWithNoRunsIsNil(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create test plan: %v", err)
	}

	rollup, err := s.TestPlans.Rollup(ctx, plan.ID)
	if err != nil {
		t.Fatalf("Rollup: %v", err)
	}
	if rollup.RunCount != 0 || rollup.PassRate != nil {
		t.Errorf("Rollup = %+v, want zero runs and nil pass rate", rollup)
	}
}

func TestTestPlanDeleteRejectedWithRuns(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create test plan: %v", err)
	}
	if _, err := s.Runs.CreateWithOptions(ctx, p.ID, "smoke", "", plan.ID, nil); err != nil {
		t.Fatalf("create run scoped to plan: %v", err)
	}

	err = s.TestPlans.Delete(ctx, plan.ID)
	if !errors.Is(err, store.ErrHasChildren) {
		t.Errorf("Delete with runs = %v, want ErrHasChildren", err)
	}
}

func TestTestPlanDeleteSucceedsWhenEmpty(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	plan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create test plan: %v", err)
	}

	if err := s.TestPlans.Delete(ctx, plan.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.TestPlans.Get(ctx, plan.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get after delete = %v, want ErrNotFound", err)
	}
}
