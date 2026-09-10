package service_test

// add-cursor-pagination: thin service-layer wrappers over each store *Page
// method. One correctness test per entity (limit/cursor pass through,
// nextCursor propagates) — the exhaustive pagination-boundary coverage
// (ties, cursor rejection, etc.) lives at the store layer already.

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

func TestListRunsPageWrapsStorePagination(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "Runs Page Service", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	c := mustLifecycleCase(t, s, p.ID)
	for i := 0; i < 3; i++ {
		if _, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "run", CaseIDs: []string{c.ID}}); err != nil {
			t.Fatalf("CreateRun %d: %v", i, err)
		}
	}

	page1, cursor1, err := s.ListRunsPage(ctx, p.ID, "", 2)
	if err != nil {
		t.Fatalf("ListRunsPage: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 = %d items, want 2", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more row remains)")
	}

	page2, cursor2, err := s.ListRunsPage(ctx, p.ID, cursor1, 2)
	if err != nil {
		t.Fatalf("ListRunsPage page2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d items, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestRunItemsPageWrapsStorePagination(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "Run Items Page Service", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	c1 := mustLifecycleCase(t, s, p.ID)
	c2 := mustLifecycleCase(t, s, p.ID)
	c3 := mustLifecycleCase(t, s, p.ID)
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "run", CaseIDs: []string{c1.ID, c2.ID, c3.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	page1, cursor1, err := s.RunItemsPage(ctx, run.ID, "", "", 2)
	if err != nil {
		t.Fatalf("RunItemsPage: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 = %d items, want 2", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more item remains)")
	}

	page2, cursor2, err := s.RunItemsPage(ctx, run.ID, "", cursor1, 2)
	if err != nil {
		t.Fatalf("RunItemsPage page2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d items, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestListTeamsPageWrapsStorePagination(t *testing.T) {
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "teams-page-admin@example.com", "correcthorse", true))
	ctx := context.Background()
	if _, err := s.CreateTeam(ctx, admin, "Team One"); err != nil {
		t.Fatalf("CreateTeam 1: %v", err)
	}
	if _, err := s.CreateTeam(ctx, admin, "Team Two"); err != nil {
		t.Fatalf("CreateTeam 2: %v", err)
	}

	page1, cursor1, err := s.ListTeamsPage(ctx, "", 1)
	if err != nil {
		t.Fatalf("ListTeamsPage: %v", err)
	}
	if len(page1) != 1 {
		t.Fatalf("page1 = %d items, want 1", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more team remains)")
	}

	page2, cursor2, err := s.ListTeamsPage(ctx, cursor1, 1)
	if err != nil {
		t.Fatalf("ListTeamsPage page2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d items, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestListRolesPageWrapsStorePagination(t *testing.T) {
	s := testService(t)
	ctx := context.Background()

	// 4 seeded default roles always exist.
	page1, cursor1, err := s.ListRolesPage(ctx, "", 2)
	if err != nil {
		t.Fatalf("ListRolesPage: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 = %d items, want 2", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (2 more roles remain)")
	}

	page2, cursor2, err := s.ListRolesPage(ctx, cursor1, 2)
	if err != nil {
		t.Fatalf("ListRolesPage page2: %v", err)
	}
	if len(page2) != 2 {
		t.Fatalf("page2 = %d items, want 2", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestListCasesPageWrapsStorePagination(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "Cases Page Service", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	mustLifecycleCase(t, s, p.ID)
	mustLifecycleCase(t, s, p.ID)

	page1, cursor1, err := s.ListCasesPage(ctx, p.ID, "", 1)
	if err != nil {
		t.Fatalf("ListCasesPage: %v", err)
	}
	if len(page1) != 1 {
		t.Fatalf("page1 = %d items, want 1", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more case remains)")
	}

	page2, cursor2, err := s.ListCasesPage(ctx, p.ID, cursor1, 1)
	if err != nil {
		t.Fatalf("ListCasesPage page2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d items, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestListFoldersPageWrapsStorePagination(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "Folders Page Service", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	root, err := st.Folders.Root(ctx, p.ID)
	if err != nil {
		t.Fatalf("Root: %v", err)
	}
	if _, err := st.Folders.Create(ctx, p.ID, root.ID, "Folder One", "folder-one"); err != nil {
		t.Fatalf("create folder 1: %v", err)
	}

	// root + Folder One = 2 total.
	page1, cursor1, err := s.ListFoldersPage(ctx, p.ID, "", 1)
	if err != nil {
		t.Fatalf("ListFoldersPage: %v", err)
	}
	if len(page1) != 1 {
		t.Fatalf("page1 = %d items, want 1", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more folder remains)")
	}

	page2, cursor2, err := s.ListFoldersPage(ctx, p.ID, cursor1, 1)
	if err != nil {
		t.Fatalf("ListFoldersPage page2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d items, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestListSuitesPageWrapsStorePagination(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "Suites Page Service", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	if _, err := s.CreateSuite(ctx, p.ID, "Suite One"); err != nil {
		t.Fatalf("CreateSuite 1: %v", err)
	}
	if _, err := s.CreateSuite(ctx, p.ID, "Suite Two"); err != nil {
		t.Fatalf("CreateSuite 2: %v", err)
	}

	page1, cursor1, err := s.ListSuitesPage(ctx, p.ID, "", 1)
	if err != nil {
		t.Fatalf("ListSuitesPage: %v", err)
	}
	if len(page1) != 1 {
		t.Fatalf("page1 = %d items, want 1", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more suite remains)")
	}

	page2, cursor2, err := s.ListSuitesPage(ctx, p.ID, cursor1, 1)
	if err != nil {
		t.Fatalf("ListSuitesPage page2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d items, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}

func TestListUsersPageWrapsStorePagination(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	mustCreateUser(t, s, "users-page-1@example.com", "correcthorse", false)
	mustCreateUser(t, s, "users-page-2@example.com", "correcthorse", false)

	page1, cursor1, err := s.ListUsersPage(ctx, "", 1)
	if err != nil {
		t.Fatalf("ListUsersPage: %v", err)
	}
	if len(page1) != 1 {
		t.Fatalf("page1 = %d items, want 1", len(page1))
	}
	if cursor1 == "" {
		t.Fatal("cursor1 = empty, want non-empty (1 more user remains)")
	}

	page2, cursor2, err := s.ListUsersPage(ctx, cursor1, 1)
	if err != nil {
		t.Fatalf("ListUsersPage page2: %v", err)
	}
	if len(page2) != 1 {
		t.Fatalf("page2 = %d items, want 1", len(page2))
	}
	if cursor2 != "" {
		t.Errorf("cursor2 = %q, want empty (last page)", cursor2)
	}
}
