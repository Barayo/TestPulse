package store_test

// add-cursor-pagination: TDD coverage for every *Page store method added
// alongside the existing unbounded List/Items methods. Each entity's tests
// cover: first-page limit respected, nextCursor resumes correctly across
// pages with no gap/overlap, last page returns nextCursor == "", fewer
// rows than limit returns everything with nextCursor == "", and ordering
// stays deterministic when multiple rows share the same created_at.

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func TestRunListPageRespectsLimitAndResumes(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "case")

	var created []domain.Run
	for i := 0; i < 5; i++ {
		run, err := s.Runs.Create(ctx, p.ID, "run", []string{c.ID})
		if err != nil {
			t.Fatalf("create run %d: %v", i, err)
		}
		created = append(created, run)
	}

	page1, cursor1, err := s.Runs.ListPage(ctx, p.ID, "", 2)
	if err != nil {
		t.Fatalf("ListPage page1: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 = %d items, want 2", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("page1 nextCursor = empty, want non-empty (3 more rows remain)")
	}
	// Newest first.
	if page1[0].ID != created[4].ID || page1[1].ID != created[3].ID {
		t.Fatalf("page1 order = [%s, %s], want [%s, %s] (newest first)", page1[0].ID, page1[1].ID, created[4].ID, created[3].ID)
	}

	page2, cursor2, err := s.Runs.ListPage(ctx, p.ID, cursor1, 2)
	if err != nil {
		t.Fatalf("ListPage page2: %v", err)
	}
	if len(page2) != 2 {
		t.Fatalf("page2 = %d items, want 2", len(page2))
	}
	if page2[0].ID != created[2].ID || page2[1].ID != created[1].ID {
		t.Fatalf("page2 order = [%s, %s], want [%s, %s]", page2[0].ID, page2[1].ID, created[2].ID, created[1].ID)
	}
	if cursor2 == "" {
		t.Fatal("page2 nextCursor = empty, want non-empty (1 more row remains)")
	}

	page3, cursor3, err := s.Runs.ListPage(ctx, p.ID, cursor2, 2)
	if err != nil {
		t.Fatalf("ListPage page3: %v", err)
	}
	if len(page3) != 1 || page3[0].ID != created[0].ID {
		t.Fatalf("page3 = %+v, want exactly [%s]", page3, created[0].ID)
	}
	if cursor3 != "" {
		t.Errorf("page3 nextCursor = %q, want empty (last page)", cursor3)
	}
}

func TestRunListPageFewerRowsThanLimitReturnsAllWithNoCursor(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "case")
	if _, err := s.Runs.Create(ctx, p.ID, "only run", []string{c.ID}); err != nil {
		t.Fatalf("create run: %v", err)
	}

	items, cursor, err := s.Runs.ListPage(ctx, p.ID, "", 50)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	if cursor != "" {
		t.Errorf("nextCursor = %q, want empty", cursor)
	}
}

// TestRunListPageClampsNonPositiveLimit is a regression test: every *Page
// store method fetches limit+1 rows and indexes runs[limit-1] to compute
// nextCursor, which panics on runs[-1] when a caller passes limit <= 0
// directly (bypassing the HTTP-layer parsePageParams/ClampLimit call).
// Found via a real call site — Service.ListRunsPage(ctx, projectID, "", 0)
// from a sample-data seed test — not a contrived case. ListPage now clamps
// internally, matching the spec's "non-positive limit behaves as if
// omitted" rule regardless of caller layer.
func TestRunListPageClampsNonPositiveLimit(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "case")
	if _, err := s.Runs.Create(ctx, p.ID, "only run", []string{c.ID}); err != nil {
		t.Fatalf("create run: %v", err)
	}

	for _, limit := range []int{0, -1, -100} {
		items, cursor, err := s.Runs.ListPage(ctx, p.ID, "", limit)
		if err != nil {
			t.Fatalf("ListPage(limit=%d): %v", limit, err)
		}
		if len(items) != 1 {
			t.Errorf("ListPage(limit=%d) = %d items, want 1", limit, len(items))
		}
		if cursor != "" {
			t.Errorf("ListPage(limit=%d) nextCursor = %q, want empty", limit, cursor)
		}
	}
}

func TestRunListPageOrdersDeterministicallyOnCreatedAtTie(t *testing.T) {
	// testutil.Pool resets the schema on every call, so this test must
	// reuse a single pool throughout rather than calling testStore(t) and
	// testutil.Pool again separately (mirrors TestDeletingSuiteClearsRunReference).
	pool := testutil.Pool(t, "store")
	s := store.New(pool)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "case")

	runA, err := s.Runs.Create(ctx, p.ID, "run a", []string{c.ID})
	if err != nil {
		t.Fatalf("create run a: %v", err)
	}
	runB, err := s.Runs.Create(ctx, p.ID, "run b", []string{c.ID})
	if err != nil {
		t.Fatalf("create run b: %v", err)
	}
	// Force an identical created_at so the id tiebreak is what's actually
	// under test, not incidental timing.
	if _, err := pool.Exec(ctx, `UPDATE test_runs SET created_at = (SELECT created_at FROM test_runs WHERE id = $1) WHERE id = $2`, runA.ID, runB.ID); err != nil {
		t.Fatalf("force tie: %v", err)
	}

	page1, cursor, err := s.Runs.ListPage(ctx, p.ID, "", 1)
	if err != nil {
		t.Fatalf("ListPage page1: %v", err)
	}
	if len(page1) != 1 {
		t.Fatalf("page1 = %d items, want 1", len(page1))
	}
	if cursor == "" {
		t.Fatal("page1 nextCursor = empty, want non-empty")
	}
	page2, cursor2, err := s.Runs.ListPage(ctx, p.ID, cursor, 1)
	if err != nil {
		t.Fatalf("ListPage page2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d items, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("page2 nextCursor = %q, want empty (last page)", cursor2)
	}
	if page1[0].ID == page2[0].ID {
		t.Fatalf("page1 and page2 returned the same row (%s) — tie not broken deterministically", page1[0].ID)
	}
	seen := map[string]bool{page1[0].ID: true, page2[0].ID: true}
	if !seen[runA.ID] || !seen[runB.ID] {
		t.Fatalf("pages = [%s, %s], want exactly {%s, %s}", page1[0].ID, page2[0].ID, runA.ID, runB.ID)
	}
}

func TestRunListPageRejectsMalformedCursor(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	if _, _, err := s.Runs.ListPage(ctx, p.ID, "not-a-real-cursor", 10); err == nil {
		t.Fatal("ListPage with a malformed cursor = nil error, want an error")
	}
}

// RunRepo.ItemsPage is the one exception to the DESC-newest-first rule:
// run items keep their pre-existing, load-bearing insertion order
// (created_at ASC) — the execution board's j/k keyboard navigation depends
// on it, so paginating must not silently reverse it.
func TestRunItemsPageKeepsInsertionOrderAndResumes(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")
	c2 := mustCase(t, s, p.ID, "two")
	c3 := mustCase(t, s, p.ID, "three")
	run, err := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c1.ID, c2.ID, c3.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}

	page1, cursor1, err := s.Runs.ItemsPage(ctx, run.ID, "", "", 2)
	if err != nil {
		t.Fatalf("ItemsPage page1: %v", err)
	}
	if len(page1) != 2 || page1[0].Content.Title != "one" || page1[1].Content.Title != "two" {
		t.Fatalf("page1 = %v, want [one, two] (insertion order)", []string{page1[0].Content.Title, page1[1].Content.Title})
	}
	if cursor1 == "" {
		t.Fatal("page1 nextCursor = empty, want non-empty (1 more item remains)")
	}

	page2, cursor2, err := s.Runs.ItemsPage(ctx, run.ID, "", cursor1, 2)
	if err != nil {
		t.Fatalf("ItemsPage page2: %v", err)
	}
	if len(page2) != 1 || page2[0].Content.Title != "three" {
		t.Fatalf("page2 = %v, want [three]", page2)
	}
	if cursor2 != "" {
		t.Errorf("page2 nextCursor = %q, want empty (last page)", cursor2)
	}
}

func TestRunItemsPageComposesWithAssigneeFilter(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")
	c2 := mustCase(t, s, p.ID, "two")
	run, err := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c1.ID, c2.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	ana := mustUser(t, s, "ana-items-page@example.com", false)
	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil || len(items) != 2 {
		t.Fatalf("Items: %d, %v", len(items), err)
	}
	if err := s.Runs.AssignItemToUser(ctx, items[0].ID, ana.ID); err != nil {
		t.Fatalf("AssignItemToUser: %v", err)
	}

	page, cursor, err := s.Runs.ItemsPage(ctx, run.ID, ana.ID, "", 50)
	if err != nil {
		t.Fatalf("ItemsPage: %v", err)
	}
	if len(page) != 1 || page[0].ID != items[0].ID {
		t.Fatalf("ItemsPage filtered by assignee = %+v, want exactly [%s]", page, items[0].ID)
	}
	if cursor != "" {
		t.Errorf("nextCursor = %q, want empty", cursor)
	}
}

func TestRunItemsPageFewerRowsThanLimitReturnsAllWithNoCursor(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "one")
	run, err := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}

	items, cursor, err := s.Runs.ItemsPage(ctx, run.ID, "", "", 50)
	if err != nil {
		t.Fatalf("ItemsPage: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	if cursor != "" {
		t.Errorf("nextCursor = %q, want empty", cursor)
	}
}

// UserRepo.ListPage preserves List's existing created_at ASC (insertion)
// order — checked before implementing, since RunRepo.Items already showed
// this codebase doesn't uniformly use newest-first.
func TestUserListPageKeepsInsertionOrderAndResumes(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u1 := mustUser(t, s, "user-page-1@example.com", false)
	u2 := mustUser(t, s, "user-page-2@example.com", false)
	u3 := mustUser(t, s, "user-page-3@example.com", false)

	page1, cursor1, err := s.Users.ListPage(ctx, "", 2)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(page1) != 2 || page1[0].ID != u1.ID || page1[1].ID != u2.ID {
		t.Fatalf("page1 = %v, want [%s, %s] (insertion order)", []string{page1[0].ID, page1[1].ID}, u1.ID, u2.ID)
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more user remains)")
	}

	page2, cursor2, err := s.Users.ListPage(ctx, cursor1, 2)
	if err != nil {
		t.Fatalf("ListPage page2: %v", err)
	}
	if len(page2) != 1 || page2[0].ID != u3.ID {
		t.Fatalf("page2 = %v, want [%s]", page2, u3.ID)
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestUserListPageFewerRowsThanLimitReturnsAllWithNoCursor(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	mustUser(t, s, "user-page-solo@example.com", false)

	items, cursor, err := s.Users.ListPage(ctx, "", 50)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	if cursor != "" {
		t.Errorf("nextCursor = %q, want empty", cursor)
	}
}

func TestTeamListPageKeepsInsertionOrderAndResumes(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	t1, err := s.Teams.Create(ctx, "Team One")
	if err != nil {
		t.Fatalf("create team 1: %v", err)
	}
	t2, err := s.Teams.Create(ctx, "Team Two")
	if err != nil {
		t.Fatalf("create team 2: %v", err)
	}

	page1, cursor1, err := s.Teams.ListPage(ctx, "", 1)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(page1) != 1 || page1[0].ID != t1.ID {
		t.Fatalf("page1 = %v, want [%s] (insertion order)", page1, t1.ID)
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more team remains)")
	}

	page2, cursor2, err := s.Teams.ListPage(ctx, cursor1, 1)
	if err != nil {
		t.Fatalf("ListPage page2: %v", err)
	}
	if len(page2) != 1 || page2[0].ID != t2.ID {
		t.Fatalf("page2 = %v, want [%s]", page2, t2.ID)
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestTeamListPageFewerRowsThanLimitReturnsAllWithNoCursor(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	if _, err := s.Teams.Create(ctx, "Solo Team"); err != nil {
		t.Fatalf("create team: %v", err)
	}

	items, cursor, err := s.Teams.ListPage(ctx, "", 50)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	if cursor != "" {
		t.Errorf("nextCursor = %q, want empty", cursor)
	}
}

// RoleRepo.ListPage preserves List's existing "rank, created_at" order —
// the seeded Tester(1)/Contributor(2)/Project Admin(3) tiers must stay
// grouped even under pagination, not interleaved by creation time alone.
func TestRoleListPageOrdersByRankThenCreatedAt(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	// Created out of rank order, to prove rank (not insertion order)
	// drives the base sort.
	high, err := s.Roles.Create(ctx, domain.Role{Name: "High Rank First", Rank: 3, CanRead: true})
	if err != nil {
		t.Fatalf("create high-rank role: %v", err)
	}
	low, err := s.Roles.Create(ctx, domain.Role{Name: "Low Rank Second", Rank: 1, CanRead: true})
	if err != nil {
		t.Fatalf("create low-rank role: %v", err)
	}

	// 4 seeded default roles (Viewer=0, Tester=1, Contributor=2, Project
	// Admin=3) already exist, plus the 2 just created here = 6 total.
	var all []domain.Role
	cursor := ""
	for {
		page, next, err := s.Roles.ListPage(ctx, cursor, 2)
		if err != nil {
			t.Fatalf("ListPage: %v", err)
		}
		all = append(all, page...)
		if next == "" {
			break
		}
		cursor = next
	}
	if len(all) != 6 {
		t.Fatalf("paginated through %d roles, want 6", len(all))
	}
	for i := 1; i < len(all); i++ {
		if all[i].Rank < all[i-1].Rank {
			t.Fatalf("roles not ordered by rank ascending: %+v then %+v", all[i-1], all[i])
		}
	}
	byID := map[string]domain.Role{}
	for _, r := range all {
		byID[r.ID] = r
	}
	if _, ok := byID[high.ID]; !ok {
		t.Error("high-rank role missing from paginated results")
	}
	if _, ok := byID[low.ID]; !ok {
		t.Error("low-rank role missing from paginated results")
	}
}

func TestRoleListPageFewerRowsThanLimitReturnsAllWithNoCursor(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	// 4 seeded default roles always exist (Viewer, Tester, Contributor,
	// Project Admin).
	items, cursor, err := s.Roles.ListPage(ctx, "", 50)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(items) != 4 {
		t.Fatalf("items = %d, want 4 (seeded defaults)", len(items))
	}
	if cursor != "" {
		t.Errorf("nextCursor = %q, want empty", cursor)
	}
}

func TestCaseListPageKeepsInsertionOrderAndResumes(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "one")
	c2 := mustCase(t, s, p.ID, "two")
	c3 := mustCase(t, s, p.ID, "three")

	page1, cursor1, err := s.Cases.ListPage(ctx, p.ID, "", 2)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(page1) != 2 || page1[0].ID != c1.ID || page1[1].ID != c2.ID {
		t.Fatalf("page1 = %v, want [%s, %s] (insertion order)", []string{page1[0].ID, page1[1].ID}, c1.ID, c2.ID)
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more case remains)")
	}

	page2, cursor2, err := s.Cases.ListPage(ctx, p.ID, cursor1, 2)
	if err != nil {
		t.Fatalf("ListPage page2: %v", err)
	}
	if len(page2) != 1 || page2[0].ID != c3.ID {
		t.Fatalf("page2 = %v, want [%s]", page2, c3.ID)
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestCaseListPageExcludesSoftDeletedCases(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "soon deleted")
	if err := s.Cases.SoftDelete(ctx, c.ID); err != nil {
		t.Fatalf("SoftDelete: %v", err)
	}

	items, cursor, err := s.Cases.ListPage(ctx, p.ID, "", 50)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(items) != 0 {
		t.Errorf("items = %d, want 0 (soft-deleted excluded)", len(items))
	}
	if cursor != "" {
		t.Errorf("nextCursor = %q, want empty", cursor)
	}
}

func TestFolderListPageKeepsInsertionOrderAndResumes(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, err := s.Folders.Root(ctx, p.ID)
	if err != nil {
		t.Fatalf("Root: %v", err)
	}
	f1, err := s.Folders.Create(ctx, p.ID, root.ID, "Folder One")
	if err != nil {
		t.Fatalf("create folder 1: %v", err)
	}
	f2, err := s.Folders.Create(ctx, p.ID, root.ID, "Folder Two")
	if err != nil {
		t.Fatalf("create folder 2: %v", err)
	}

	// The project's root folder (auto-created) plus f1/f2 = 3 total.
	page1, cursor1, err := s.Folders.ListPage(ctx, p.ID, "", 2)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 = %d items, want 2", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more folder remains)")
	}

	page2, cursor2, err := s.Folders.ListPage(ctx, p.ID, cursor1, 2)
	if err != nil {
		t.Fatalf("ListPage page2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d items, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
	all := append(append([]domain.Folder{}, page1...), page2...)
	byID := map[string]bool{}
	for _, f := range all {
		byID[f.ID] = true
	}
	if !byID[f1.ID] || !byID[f2.ID] {
		t.Fatalf("paginated folders = %+v, missing f1/f2", all)
	}
}

func TestSuiteListPageKeepsInsertionOrderAndResumesWithEnrichment(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "one")
	suite1, err := s.Suites.Create(ctx, p.ID, "Suite One")
	if err != nil {
		t.Fatalf("create suite 1: %v", err)
	}
	if err := s.Suites.AddCase(ctx, suite1.ID, c.ID); err != nil {
		t.Fatalf("AddCase: %v", err)
	}
	run, err := s.Runs.CreateWithSuite(ctx, p.ID, "run", suite1.ID, []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	items, _ := s.Runs.Items(ctx, run.ID, "")
	if _, err := s.Runs.AppendResult(ctx, items[0].ID, domain.NewResult{Actor: "ana", Verdict: domain.VerdictPass}, domain.ResultActorUnknown, ""); err != nil {
		t.Fatal(err)
	}
	if err := s.Runs.Close(ctx, run.ID); err != nil {
		t.Fatal(err)
	}
	suite2, err := s.Suites.Create(ctx, p.ID, "Suite Two")
	if err != nil {
		t.Fatalf("create suite 2: %v", err)
	}

	page1, cursor1, err := s.Suites.ListPage(ctx, p.ID, "", 1)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(page1) != 1 || page1[0].ID != suite1.ID {
		t.Fatalf("page1 = %v, want [%s] (insertion order)", page1, suite1.ID)
	}
	if len(page1[0].CaseIDs) != 1 || page1[0].CaseIDs[0] != c.ID {
		t.Errorf("page1[0].CaseIDs = %v, want [%s] (enrichment preserved)", page1[0].CaseIDs, c.ID)
	}
	if page1[0].PassRate == nil || *page1[0].PassRate != 100 {
		t.Errorf("page1[0].PassRate = %v, want 100 (enrichment preserved)", page1[0].PassRate)
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more suite remains)")
	}

	page2, cursor2, err := s.Suites.ListPage(ctx, p.ID, cursor1, 1)
	if err != nil {
		t.Fatalf("ListPage page2: %v", err)
	}
	if len(page2) != 1 || page2[0].ID != suite2.ID {
		t.Fatalf("page2 = %v, want [%s]", page2, suite2.ID)
	}
	if page2[0].PassRate != nil {
		t.Errorf("page2[0].PassRate = %v, want nil (no runs)", page2[0].PassRate)
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestSuiteListPageFewerRowsThanLimitReturnsAllWithNoCursor(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	if _, err := s.Suites.Create(ctx, p.ID, "Solo Suite"); err != nil {
		t.Fatalf("create suite: %v", err)
	}

	items, cursor, err := s.Suites.ListPage(ctx, p.ID, "", 50)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("items = %d, want 1", len(items))
	}
	if cursor != "" {
		t.Errorf("nextCursor = %q, want empty", cursor)
	}
}

func TestFolderListPageExcludesSoftDeletedFolders(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, err := s.Folders.Root(ctx, p.ID)
	if err != nil {
		t.Fatalf("Root: %v", err)
	}
	f, err := s.Folders.Create(ctx, p.ID, root.ID, "Soon Deleted")
	if err != nil {
		t.Fatalf("create folder: %v", err)
	}
	if err := s.Folders.Delete(ctx, f.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	items, _, err := s.Folders.ListPage(ctx, p.ID, "", 50)
	if err != nil {
		t.Fatalf("ListPage: %v", err)
	}
	for _, got := range items {
		if got.ID == f.ID {
			t.Errorf("deleted folder %s still present in ListPage results", f.ID)
		}
	}
}
