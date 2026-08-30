package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestCreateRunRejectsTestPlanFromDifferentProject(t *testing.T) {
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
	rel, err := st.Releases.Create(ctx, projectB.ID, "2026.1", "", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("create release under project B: %v", err)
	}
	plan, err := st.TestPlans.Create(ctx, projectB.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create test plan under project B: %v", err)
	}

	_, err = s.CreateRun(ctx, projectA.ID, service.RunInput{Name: "smoke", TestPlanID: plan.ID})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("CreateRun with cross-project test plan = %v, want ValidationError", err)
	}
}

func TestCreateRunAcceptsTestPlanFromSameProject(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()

	p, err := st.Projects.Create(ctx, "Project A", "")
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

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "smoke", TestPlanID: plan.ID})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	if run.TestPlanKey == nil || *run.TestPlanKey != plan.Key {
		t.Errorf("run.TestPlanKey = %v, want %q", run.TestPlanKey, plan.Key)
	}
}

func TestCreateRunWithNoTestPlanHasNoTestPlanReference(t *testing.T) {
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
	if run.TestPlanKey != nil {
		t.Errorf("run.TestPlanKey = %v, want nil", run.TestPlanKey)
	}
}

func TestReleaseAndTestPlanCRUDRoundTrip(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "Project A", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}

	rel, err := s.CreateRelease(ctx, p.ID, "2026.1", "First GA", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("CreateRelease: %v", err)
	}
	rel, err = s.UpdateRelease(ctx, rel.ID, "2026.1", "First GA", domain.ReleaseStatusMaintained)
	if err != nil {
		t.Fatalf("UpdateRelease: %v", err)
	}
	if rel.Status != domain.ReleaseStatusMaintained {
		t.Errorf("Status = %q, want maintained", rel.Status)
	}

	releases, err := s.ListReleases(ctx, p.ID, "")
	if err != nil || len(releases) != 1 {
		t.Fatalf("ListReleases = %d, %v, want 1 release", len(releases), err)
	}

	plan, err := s.CreateTestPlan(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("CreateTestPlan: %v", err)
	}
	plans, err := s.ListTestPlans(ctx, rel.ID)
	if err != nil || len(plans) != 1 {
		t.Fatalf("ListTestPlans = %d, %v, want 1 plan", len(plans), err)
	}

	if err := s.DeleteRelease(ctx, rel.ID); !errors.Is(err, store.ErrHasChildren) {
		t.Errorf("DeleteRelease with test plans = %v, want ErrHasChildren", err)
	}

	if err := s.DeleteTestPlan(ctx, plan.ID); err != nil {
		t.Fatalf("DeleteTestPlan: %v", err)
	}
	if err := s.DeleteRelease(ctx, rel.ID); err != nil {
		t.Fatalf("DeleteRelease after emptying: %v", err)
	}
}
