package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func mustRelease(t *testing.T, s *store.Store, projectID, name string) domain.Release {
	t.Helper()
	rel, err := s.Releases.Create(context.Background(), projectID, name, "", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("create release: %v", err)
	}
	return rel
}

func TestReleaseCreateClaimsKey(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	rel, err := s.Releases.Create(ctx, p.ID, "2026.1", "First GA", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("create release: %v", err)
	}
	if rel.Key == "" {
		t.Error("release created with no key")
	}
	if rel.ProjectID != p.ID {
		t.Errorf("ProjectID = %q, want %q", rel.ProjectID, p.ID)
	}
	if rel.Status != domain.ReleaseStatusActive {
		t.Errorf("Status = %q, want active", rel.Status)
	}

	rel2, err := s.Releases.Create(ctx, p.ID, "2026.2", "", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("create second release: %v", err)
	}
	if rel.Key == rel2.Key {
		t.Errorf("both releases got the same key %q", rel.Key)
	}
}

func TestReleaseGetByKey(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")

	id, err := s.Releases.IDByKey(ctx, rel.Key)
	if err != nil {
		t.Fatalf("IDByKey: %v", err)
	}
	got, err := s.Releases.Get(ctx, id)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Name != "2026.1" {
		t.Errorf("Name = %q, want %q", got.Name, "2026.1")
	}
}

func TestReleaseListFiltersByStatus(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	mustRelease(t, s, p.ID, "2026.1")
	if _, err := s.Releases.Create(ctx, p.ID, "2025.9", "", domain.ReleaseStatusEOL); err != nil {
		t.Fatalf("create eol release: %v", err)
	}

	all, err := s.Releases.List(ctx, p.ID, "")
	if err != nil {
		t.Fatalf("List all: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("List all = %d releases, want 2", len(all))
	}

	active, err := s.Releases.List(ctx, p.ID, domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("List active: %v", err)
	}
	if len(active) != 1 || active[0].Name != "2026.1" {
		t.Errorf("List active = %+v, want just 2026.1", active)
	}
}

func TestReleaseUpdate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")

	rel.Status = domain.ReleaseStatusMaintained
	rel.Description = "now in maintenance"
	updated, err := s.Releases.Update(ctx, rel)
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Status != domain.ReleaseStatusMaintained || updated.Description != "now in maintenance" {
		t.Errorf("Update result = %+v", updated)
	}
}

func TestReleaseRollupAggregatesAcrossTestPlans(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	iosPlan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", "")
	if err != nil {
		t.Fatalf("create iOS plan: %v", err)
	}
	androidPlan, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "Android", "")
	if err != nil {
		t.Fatalf("create Android plan: %v", err)
	}
	makeRunWithPassRate(t, s, p.ID, iosPlan.ID, "ios-run", 10, 8)
	makeRunWithPassRate(t, s, p.ID, androidPlan.ID, "android-run", 10, 4)

	rollup, err := s.Releases.Rollup(ctx, rel.ID)
	if err != nil {
		t.Fatalf("Rollup: %v", err)
	}
	if rollup.RunCount != 2 {
		t.Errorf("RunCount = %d, want 2", rollup.RunCount)
	}
	if rollup.PassRate == nil || *rollup.PassRate != 60 {
		t.Errorf("PassRate = %v, want 60", rollup.PassRate)
	}
}

func TestReleaseRollupWithNoTestPlansIsNil(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")

	rollup, err := s.Releases.Rollup(ctx, rel.ID)
	if err != nil {
		t.Fatalf("Rollup: %v", err)
	}
	if rollup.RunCount != 0 || rollup.PassRate != nil {
		t.Errorf("Rollup = %+v, want zero runs and nil pass rate", rollup)
	}
}

func TestReleaseDeleteRejectedWithTestPlans(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")
	if _, err := s.TestPlans.Create(ctx, p.ID, rel.ID, "iOS", ""); err != nil {
		t.Fatalf("create test plan: %v", err)
	}

	err := s.Releases.Delete(ctx, rel.ID)
	if !errors.Is(err, store.ErrHasChildren) {
		t.Errorf("Delete with test plans = %v, want ErrHasChildren", err)
	}
	if _, err := s.Releases.Get(ctx, rel.ID); err != nil {
		t.Errorf("release should still exist after rejected delete: %v", err)
	}
}

func TestReleaseDeleteSucceedsWhenEmpty(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	rel := mustRelease(t, s, p.ID, "2026.1")

	if err := s.Releases.Delete(ctx, rel.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Releases.Get(ctx, rel.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get after delete = %v, want ErrNotFound", err)
	}
}
