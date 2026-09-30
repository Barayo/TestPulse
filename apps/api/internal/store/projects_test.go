package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
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

func TestProjectRepoListPagePaginatesWithCursor(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	p1, err := s.Projects.Create(ctx, "Page Project One", "")
	if err != nil {
		t.Fatalf("Create p1: %v", err)
	}
	p2, err := s.Projects.Create(ctx, "Page Project Two", "")
	if err != nil {
		t.Fatalf("Create p2: %v", err)
	}
	p3, err := s.Projects.Create(ctx, "Page Project Three", "")
	if err != nil {
		t.Fatalf("Create p3: %v", err)
	}

	page1, cursor1, err := s.Projects.ListPage(ctx, "", 2)
	if err != nil {
		t.Fatalf("ListPage (page1): %v", err)
	}
	if len(page1) != 2 || page1[0].ID != p1.ID || page1[1].ID != p2.ID {
		t.Fatalf("page1 = %+v, want [p1, p2]", page1)
	}
	if cursor1 == "" {
		t.Fatal("page1 cursor = \"\", want a non-empty cursor")
	}

	page2, cursor2, err := s.Projects.ListPage(ctx, cursor1, 2)
	if err != nil {
		t.Fatalf("ListPage (page2): %v", err)
	}
	if len(page2) != 1 || page2[0].ID != p3.ID {
		t.Fatalf("page2 = %+v, want [p3]", page2)
	}
	if cursor2 != "" {
		t.Errorf("page2 cursor = %q, want empty (last page)", cursor2)
	}
}

func TestProjectRepoListForMemberPagePaginatesWithCursor(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	owner := mustUser(t, s, "listformemberpage-owner@example.com", false)
	role := mustRole(t, s, domain.Role{Name: "ListForMemberPage Role", CanRead: true})
	var created []string
	for i := 0; i < 3; i++ {
		p, err := s.Projects.Create(ctx, "Member Page Project", "")
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		if err := s.ProjectMembers.SetMember(ctx, p.ID, owner.ID, role.ID); err != nil {
			t.Fatalf("SetMember: %v", err)
		}
		created = append(created, p.ID)
	}

	page1, cursor1, err := s.Projects.ListForMemberPage(ctx, owner.ID, "", 2)
	if err != nil {
		t.Fatalf("ListForMemberPage (page1): %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 = %+v, want 2 projects", page1)
	}
	if cursor1 == "" {
		t.Fatal("page1 cursor = \"\", want a non-empty cursor")
	}

	page2, cursor2, err := s.Projects.ListForMemberPage(ctx, owner.ID, cursor1, 2)
	if err != nil {
		t.Fatalf("ListForMemberPage (page2): %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %+v, want 1 project", page2)
	}
	if cursor2 != "" {
		t.Errorf("page2 cursor = %q, want empty (last page)", cursor2)
	}
	seen := map[string]bool{}
	for _, p := range append(page1, page2...) {
		seen[p.ID] = true
	}
	for _, id := range created {
		if !seen[id] {
			t.Errorf("project %q missing from paginated results", id)
		}
	}
}
