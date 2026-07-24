package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestProjectHasRootFolder(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	root, err := s.Folders.Root(ctx, p.ID)
	if err != nil {
		t.Fatalf("Root: %v", err)
	}
	if root.ParentFolderID != "" {
		t.Errorf("root ParentFolderID = %q, want empty", root.ParentFolderID)
	}
}

func TestCaseDefaultsToRootFolder(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)

	c := mustCase(t, s, p.ID, "Login works") // no folder specified
	if c.FolderID != root.ID {
		t.Errorf("FolderID = %q, want root %q", c.FolderID, root.ID)
	}
}

func TestCreateNestedSubfolder(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)

	auth, err := s.Folders.Create(ctx, p.ID, root.ID, "Auth")
	if err != nil {
		t.Fatalf("create subfolder: %v", err)
	}
	if auth.ParentFolderID != root.ID {
		t.Errorf("ParentFolderID = %q, want %q", auth.ParentFolderID, root.ID)
	}

	login, err := s.Folders.Create(ctx, p.ID, auth.ID, "Login")
	if err != nil {
		t.Fatalf("create nested subfolder: %v", err)
	}
	if login.ParentFolderID != auth.ID {
		t.Errorf("nested ParentFolderID = %q, want %q", login.ParentFolderID, auth.ID)
	}
}

func TestListTreeShowsAllFoldersAndCases(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)
	auth, _ := s.Folders.Create(ctx, p.ID, root.ID, "Auth")

	c, err := s.Cases.Create(ctx, p.ID, auth.ID, defaultContent("Login works"))
	if err != nil {
		t.Fatalf("create case in subfolder: %v", err)
	}

	tree, err := s.Folders.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	// root + auth = 2 folders.
	if len(tree) != 2 {
		t.Fatalf("List returned %d folders, want 2", len(tree))
	}

	cases, err := s.Cases.List(ctx, p.ID)
	if err != nil || len(cases) != 1 || cases[0].FolderID != auth.ID {
		t.Errorf("case in subfolder: %+v, %v", cases, err)
	}
	_ = c
}

func TestMoveCaseBetweenFolders(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)
	auth, _ := s.Folders.Create(ctx, p.ID, root.ID, "Auth")
	c := mustCase(t, s, p.ID, "Login works") // starts in root

	if err := s.Cases.Move(ctx, c.ID, auth.ID); err != nil {
		t.Fatalf("Move: %v", err)
	}
	got, err := s.Cases.Get(ctx, c.ID)
	if err != nil || got.FolderID != auth.ID {
		t.Errorf("after move: %+v, %v", got, err)
	}
}

func TestMovingCaseDoesNotAffectSuiteMembership(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)
	auth, _ := s.Folders.Create(ctx, p.ID, root.ID, "Auth")
	c := mustCase(t, s, p.ID, "Login works")
	suite, _ := s.Suites.Create(ctx, p.ID, "smoke")
	if err := s.Suites.AddCase(ctx, suite.ID, c.ID); err != nil {
		t.Fatal(err)
	}

	if err := s.Cases.Move(ctx, c.ID, auth.ID); err != nil {
		t.Fatalf("Move: %v", err)
	}

	got, _ := s.Suites.Get(ctx, suite.ID)
	if len(got.CaseIDs) != 1 || got.CaseIDs[0] != c.ID {
		t.Errorf("suite membership changed after folder move: %+v", got.CaseIDs)
	}
}

// TestDeleteFolderCascadesSoftDeleteToSubtree covers add-delete-mode:
// deleting a folder soft-deletes its entire subtree (folders and cases) in
// place, replacing the old reparent-on-delete behavior.
func TestDeleteFolderCascadesSoftDeleteToSubtree(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)
	auth, _ := s.Folders.Create(ctx, p.ID, root.ID, "Auth")
	login, _ := s.Folders.Create(ctx, p.ID, auth.ID, "Login") // subfolder of auth
	c, err := s.Cases.Create(ctx, p.ID, auth.ID, defaultContent("case in auth"))
	if err != nil {
		t.Fatal(err)
	}
	rootCase := mustCase(t, s, p.ID, "unrelated case in root")

	if err := s.Folders.Delete(ctx, auth.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	// The deleted folder, its subfolder, and the case in its subtree are
	// all gone (soft-deleted, so Get returns ErrNotFound like a deleted
	// case does).
	if _, err := s.Folders.Get(ctx, auth.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get(auth) after delete = %v, want ErrNotFound", err)
	}
	if _, err := s.Folders.Get(ctx, login.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get(login) after delete = %v, want ErrNotFound", err)
	}
	if _, err := s.Cases.Get(ctx, c.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Get(case) after delete = %v, want ErrNotFound", err)
	}

	// Deleted folders are excluded from List.
	remaining, err := s.Folders.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	for _, f := range remaining {
		if f.ID == auth.ID || f.ID == login.ID {
			t.Errorf("deleted folder %q still present in List", f.ID)
		}
	}

	// A case outside the deleted subtree is unaffected.
	if _, err := s.Cases.Get(ctx, rootCase.ID); err != nil {
		t.Errorf("unrelated case in root affected by unrelated subtree delete: %v", err)
	}
}

// TestSubtreeCountsForDeletePreview covers the confirmation dialog's
// pre-check: the number of cases and folders a delete would remove,
// computed before the user confirms.
func TestSubtreeCountsForDeletePreview(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)
	auth, _ := s.Folders.Create(ctx, p.ID, root.ID, "Auth")
	login, _ := s.Folders.Create(ctx, p.ID, auth.ID, "Login")
	if _, err := s.Cases.Create(ctx, p.ID, auth.ID, defaultContent("case in auth")); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Cases.Create(ctx, p.ID, login.ID, defaultContent("case in login")); err != nil {
		t.Fatal(err)
	}

	caseCount, folderCount, err := s.Folders.SubtreeCounts(ctx, auth.ID)
	if err != nil {
		t.Fatalf("SubtreeCounts: %v", err)
	}
	// auth's subtree: auth + login = 2 folders (folderCount counts
	// descendants, not including auth itself, per the dialog copy "N
	// cases and M subfolders").
	if folderCount != 1 {
		t.Errorf("folderCount = %d, want 1 (login)", folderCount)
	}
	if caseCount != 2 {
		t.Errorf("caseCount = %d, want 2", caseCount)
	}

	// A leaf folder with nothing in it previews as zero/zero.
	empty, _ := s.Folders.Create(ctx, p.ID, root.ID, "Empty")
	caseCount, folderCount, err = s.Folders.SubtreeCounts(ctx, empty.ID)
	if err != nil {
		t.Fatalf("SubtreeCounts(empty): %v", err)
	}
	if caseCount != 0 || folderCount != 0 {
		t.Errorf("empty folder counts = %d/%d, want 0/0", caseCount, folderCount)
	}
}

func TestRootFolderCannotBeDeleted(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)

	err := s.Folders.Delete(ctx, root.ID)
	if !errors.Is(err, store.ErrRootFolder) {
		t.Errorf("Delete(root) = %v, want ErrRootFolder", err)
	}
}
