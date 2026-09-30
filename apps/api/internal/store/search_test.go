package store_test

import (
	"context"
	"testing"
)

// TestSearchRepoSearchPaginatesWithOffset covers
// add-mcp-search-listprojects-pagination design.md D2: search's offset-
// based pagination.
func TestSearchRepoSearchPaginatesWithOffset(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	for i := 0; i < 3; i++ {
		mustCase(t, s, p.ID, "Distinctivegiraffe case")
	}

	page1, cursor1, err := s.Search.Search(ctx, "distinctivegiraffe", []string{p.ID}, "", 2)
	if err != nil {
		t.Fatalf("Search (page1): %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 = %d results, want 2", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more result remains)")
	}

	page2, cursor2, err := s.Search.Search(ctx, "distinctivegiraffe", []string{p.ID}, cursor1, 2)
	if err != nil {
		t.Fatalf("Search (page2): %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d results, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}
