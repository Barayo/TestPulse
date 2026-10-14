package store_test

import (
	"context"
	"testing"
)

func TestItemsByRunIDs_ReturnsItemsFromAllGivenRuns(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "Login works")
	c2 := mustCase(t, s, p.ID, "Logout works")

	runA, err := s.Runs.Create(ctx, p.ID, "Chrome run", []string{c1.ID})
	if err != nil {
		t.Fatalf("create runA: %v", err)
	}
	runB, err := s.Runs.Create(ctx, p.ID, "Firefox run", []string{c2.ID})
	if err != nil {
		t.Fatalf("create runB: %v", err)
	}

	items, err := s.Runs.ItemsByRunIDs(ctx, []string{runA.ID, runB.ID})
	if err != nil {
		t.Fatalf("ItemsByRunIDs: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("len(items) = %d, want 2", len(items))
	}

	gotRunIDs := map[string]bool{}
	for _, it := range items {
		gotRunIDs[it.RunID] = true
	}
	if !gotRunIDs[runA.ID] || !gotRunIDs[runB.ID] {
		t.Errorf("items run IDs = %v, want both %q and %q", gotRunIDs, runA.ID, runB.ID)
	}
}
