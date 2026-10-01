package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// TestApiTokenRepoListAllPageReturnsEveryUsersTokens covers
// add-instance-token-listing: the instance-wide listing spans every
// user's tokens, with owner/project/role resolved server-side.
func TestApiTokenRepoListAllPageReturnsEveryUsersTokens(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u1 := mustUser(t, s, "token-owner-1@example.com", false)
	u2 := mustUser(t, s, "token-owner-2@example.com", false)
	p := mustProject(t, s)
	role := mustRole(t, s, domain.Role{Name: "Instance Listing Role", CanRead: true})

	unscoped, err := s.ApiTokens.Create(ctx, u1.ID, "unscoped-agent", "hash-unscoped", "tp_un", nil, nil)
	if err != nil {
		t.Fatalf("Create unscoped: %v", err)
	}
	scoped, err := s.ApiTokens.Create(ctx, u2.ID, "scoped-agent", "hash-scoped", "tp_sc", &p.ID, &role.ID)
	if err != nil {
		t.Fatalf("Create scoped: %v", err)
	}

	tokens, nextCursor, err := s.ApiTokens.ListAllPage(ctx, "", 0)
	if err != nil {
		t.Fatalf("ListAllPage: %v", err)
	}
	if nextCursor != "" {
		t.Errorf("nextCursor = %q, want empty (both fit on one page)", nextCursor)
	}
	if len(tokens) != 2 {
		t.Fatalf("tokens = %+v, want 2", tokens)
	}

	byID := map[string]domain.ApiTokenWithOwner{}
	for _, tok := range tokens {
		byID[tok.ID] = tok
	}

	gotUnscoped, ok := byID[unscoped.ID]
	if !ok {
		t.Fatalf("unscoped token missing from listing: %+v", tokens)
	}
	if gotUnscoped.OwnerEmail != "token-owner-1@example.com" {
		t.Errorf("unscoped OwnerEmail = %q, want token-owner-1@example.com", gotUnscoped.OwnerEmail)
	}
	if gotUnscoped.ProjectKey != nil || gotUnscoped.RoleName != nil {
		t.Errorf("unscoped token = %+v, want nil ProjectKey and RoleName", gotUnscoped)
	}

	gotScoped, ok := byID[scoped.ID]
	if !ok {
		t.Fatalf("scoped token missing from listing: %+v", tokens)
	}
	if gotScoped.OwnerEmail != "token-owner-2@example.com" {
		t.Errorf("scoped OwnerEmail = %q, want token-owner-2@example.com", gotScoped.OwnerEmail)
	}
	if gotScoped.ProjectKey == nil || *gotScoped.ProjectKey != p.Key {
		t.Errorf("scoped ProjectKey = %v, want %q", gotScoped.ProjectKey, p.Key)
	}
	if gotScoped.RoleName == nil || *gotScoped.RoleName != "Instance Listing Role" {
		t.Errorf("scoped RoleName = %v, want %q", gotScoped.RoleName, "Instance Listing Role")
	}
}

// TestApiTokenRepoListAllPagePaginatesWithCursor mirrors
// TestUserListPageKeepsInsertionOrderAndResumes's shape for the new
// instance-wide token listing.
func TestApiTokenRepoListAllPagePaginatesWithCursor(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "token-page-owner@example.com", false)
	var created []string
	for i := 0; i < 3; i++ {
		tok, err := s.ApiTokens.Create(ctx, u.ID, "agent", "hash-"+string(rune('a'+i)), "tp_"+string(rune('a'+i)), nil, nil)
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		created = append(created, tok.ID)
	}

	page1, cursor1, err := s.ApiTokens.ListAllPage(ctx, "", 2)
	if err != nil {
		t.Fatalf("ListAllPage (page1): %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 = %d tokens, want 2", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more token remains)")
	}

	page2, cursor2, err := s.ApiTokens.ListAllPage(ctx, cursor1, 2)
	if err != nil {
		t.Fatalf("ListAllPage (page2): %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d tokens, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}

	var gotIDs []string
	for _, tok := range append(page1, page2...) {
		gotIDs = append(gotIDs, tok.ID)
	}
	for i, id := range created {
		if gotIDs[i] != id {
			t.Errorf("token order[%d] = %q, want %q (insertion order)", i, gotIDs[i], id)
		}
	}
}
