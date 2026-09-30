package store_test

import (
	"context"
	"testing"
)

func TestProjectRepoKeysByIDsReturnsKeysForGivenIDs(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	p1, err := s.Projects.Create(ctx, "Project One", "")
	if err != nil {
		t.Fatalf("Create p1: %v", err)
	}
	p2, err := s.Projects.Create(ctx, "Project Two", "")
	if err != nil {
		t.Fatalf("Create p2: %v", err)
	}
	if _, err := s.Projects.Create(ctx, "Project Three", ""); err != nil {
		t.Fatalf("Create p3: %v", err)
	}

	keys, err := s.Projects.KeysByIDs(ctx, []string{p1.ID, p2.ID, "00000000-0000-0000-0000-000000000000"})
	if err != nil {
		t.Fatalf("KeysByIDs: %v", err)
	}
	if len(keys) != 2 {
		t.Fatalf("keys = %+v, want exactly 2 entries", keys)
	}
	if keys[p1.ID] != p1.Key {
		t.Errorf("keys[%q] = %q, want %q", p1.ID, keys[p1.ID], p1.Key)
	}
	if keys[p2.ID] != p2.Key {
		t.Errorf("keys[%q] = %q, want %q", p2.ID, keys[p2.ID], p2.Key)
	}
}
