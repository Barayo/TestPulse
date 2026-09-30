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

	page1, cursor1, err := s.Search.Search(ctx, "distinctivegiraffe", []string{p.ID}, "", "", 2)
	if err != nil {
		t.Fatalf("Search (page1): %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 = %d results, want 2", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more result remains)")
	}

	page2, cursor2, err := s.Search.Search(ctx, "distinctivegiraffe", []string{p.ID}, "", cursor1, 2)
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

// TestSearchRepoSearchBrowsesWithEmptyQuery covers add-mcp-search-browse-mode
// design.md D1: an empty query lists entities by recency (rank=0) instead of
// the tsvector predicate matching nothing.
func TestSearchRepoSearchBrowsesWithEmptyQuery(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	c := mustCase(t, s, p.ID, "Browsable case")
	suite, err := s.Suites.Create(ctx, p.ID, "Browsable suite")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}
	run, err := s.Runs.Create(ctx, p.ID, "Browsable run", []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}

	results, nextCursor, err := s.Search.Search(ctx, "", []string{p.ID}, "", "", 0)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if nextCursor != "" {
		t.Errorf("nextCursor = %q, want empty (all results fit on one page)", nextCursor)
	}
	// project itself is also a browsable entity, so expect at least 4 results:
	// project, run, suite, case.
	if len(results) < 4 {
		t.Fatalf("results = %+v, want at least 4 (project, run, suite, case)", results)
	}
	for _, r := range results {
		if r.Rank != 0 {
			t.Errorf("result %+v has Rank != 0, want 0 in browse mode", r)
		}
	}
	// Most-recently-created first: run, then suite, then case (project was
	// created before any of them).
	keyOrder := map[string]int{run.Key: -1, suite.Key: -1, c.Key: -1}
	for i, r := range results {
		if _, ok := keyOrder[r.Key]; ok {
			keyOrder[r.Key] = i
		}
	}
	if keyOrder[run.Key] >= keyOrder[suite.Key] || keyOrder[suite.Key] >= keyOrder[c.Key] {
		t.Errorf("browse order (indices) = run:%d suite:%d case:%d, want run < suite < case (most recent first)",
			keyOrder[run.Key], keyOrder[suite.Key], keyOrder[c.Key])
	}
}

// TestSearchRepoSearchFiltersByEntityType covers add-mcp-search-browse-mode
// design.md D2: entityType narrows results in both browse and keyword modes.
func TestSearchRepoSearchFiltersByEntityType(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	mustCase(t, s, p.ID, "Checkout case")
	suite, err := s.Suites.Create(ctx, p.ID, "Checkout suite")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}

	browseResults, _, err := s.Search.Search(ctx, "", []string{p.ID}, "suite", "", 0)
	if err != nil {
		t.Fatalf("Search (browse, filtered): %v", err)
	}
	if len(browseResults) != 1 || browseResults[0].EntityType != "suite" || browseResults[0].Key != suite.Key {
		t.Fatalf("browse results = %+v, want exactly the one suite", browseResults)
	}

	keywordResults, _, err := s.Search.Search(ctx, "checkout", []string{p.ID}, "case", "", 0)
	if err != nil {
		t.Fatalf("Search (keyword, filtered): %v", err)
	}
	if len(keywordResults) != 1 || keywordResults[0].EntityType != "case" {
		t.Fatalf("keyword results = %+v, want exactly the one case (suite also matches \"checkout\" by name but is filtered out)", keywordResults)
	}
}
