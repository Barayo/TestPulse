package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
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

	c, err := s.Cases.Create(ctx, p.ID, auth.ID, defaultContent("Login works"), domain.ResultActorUnknown, "")
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
	c, err := s.Cases.Create(ctx, p.ID, auth.ID, defaultContent("case in auth"), domain.ResultActorUnknown, "")
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
	if _, err := s.Cases.Create(ctx, p.ID, auth.ID, defaultContent("case in auth"), domain.ResultActorUnknown, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Cases.Create(ctx, p.ID, login.ID, defaultContent("case in login"), domain.ResultActorUnknown, ""); err != nil {
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

// TestMoveFolderReparents covers add-library-folder-selection task 2.1: a
// folder can be moved (reparented) to a different, unrelated folder.
func TestMoveFolderReparents(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)
	auth, _ := s.Folders.Create(ctx, p.ID, root.ID, "Auth")
	settings, _ := s.Folders.Create(ctx, p.ID, root.ID, "Settings")

	moved, err := s.Folders.Move(ctx, auth.ID, settings.ID)
	if err != nil {
		t.Fatalf("Move: %v", err)
	}
	if moved.ParentFolderID != settings.ID {
		t.Errorf("ParentFolderID = %q, want %q", moved.ParentFolderID, settings.ID)
	}

	got, err := s.Folders.Get(ctx, auth.ID)
	if err != nil || got.ParentFolderID != settings.ID {
		t.Errorf("Get after move: %+v, %v", got, err)
	}
}

// TestMoveFolderRejectsCycles covers task 2.4: moving into a descendant or
// into itself must fail, not silently corrupt the tree.
func TestMoveFolderRejectsCycles(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)
	auth, _ := s.Folders.Create(ctx, p.ID, root.ID, "Auth")
	login, _ := s.Folders.Create(ctx, p.ID, auth.ID, "Login")

	if _, err := s.Folders.Move(ctx, auth.ID, login.ID); !errors.Is(err, store.ErrFolderCycle) {
		t.Errorf("Move(auth, into descendant login) = %v, want ErrFolderCycle", err)
	}
	if _, err := s.Folders.Move(ctx, auth.ID, auth.ID); !errors.Is(err, store.ErrFolderCycle) {
		t.Errorf("Move(auth, into itself) = %v, want ErrFolderCycle", err)
	}

	// Neither rejected attempt actually changed auth's parent.
	got, err := s.Folders.Get(ctx, auth.ID)
	if err != nil || got.ParentFolderID != root.ID {
		t.Errorf("auth's parent changed after rejected moves: %+v, %v", got, err)
	}
}

// TestRootFolderCannotBeMoved covers task 2.4's third rejection case.
func TestRootFolderCannotBeMoved(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	root, _ := s.Folders.Root(ctx, p.ID)
	other, _ := s.Folders.Create(ctx, p.ID, root.ID, "Other")

	if _, err := s.Folders.Move(ctx, root.ID, other.ID); !errors.Is(err, store.ErrRootFolder) {
		t.Errorf("Move(root) = %v, want ErrRootFolder", err)
	}
}

// #175 defense in depth: FolderRepo.Move itself has no project check (the
// service layer enforces it), so subtreeCTE is pinned to the root's own
// project_id independently -- even a folder grafted across a project
// boundary by some other bug must never be reachable by another project's
// own delete. Simulated here by calling the store directly (bypassing the
// service-layer check this same fix adds) to force exactly that graft.
func TestSubtreeDeleteNeverCrossesIntoAnotherProject(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	projectA := mustProject(t, s)
	projectB := mustProject(t, s)

	rootA, _ := s.Folders.Root(ctx, projectA.ID)
	folderA, err := s.Folders.Create(ctx, projectA.ID, rootA.ID, "In A")
	if err != nil {
		t.Fatalf("create folder in A: %v", err)
	}
	caseA := mustCase(t, s, projectA.ID, "case in A")
	if err := s.Cases.Move(ctx, caseA.ID, folderA.ID); err != nil {
		t.Fatalf("move case into folder A: %v", err)
	}

	rootB, _ := s.Folders.Root(ctx, projectB.ID)
	folderB, err := s.Folders.Create(ctx, projectB.ID, rootB.ID, "In B")
	if err != nil {
		t.Fatalf("create folder in B: %v", err)
	}

	// Force the cross-project graft directly (this is exactly what the
	// service-layer fix now prevents through the normal API).
	if _, err := s.Folders.Move(ctx, folderA.ID, folderB.ID); err != nil {
		t.Fatalf("forcing cross-project graft: %v", err)
	}

	// Project B's own admin deletes their own folder -- an entirely
	// routine action for them.
	if err := s.Folders.Delete(ctx, folderB.ID); err != nil {
		t.Fatalf("Delete(folderB): %v", err)
	}

	// Project A's grafted folder and case must have survived -- both
	// Get methods filter out soft-deleted rows, so a nil error alone
	// confirms neither was touched by project B's delete.
	if _, err := s.Folders.Get(ctx, folderA.ID); err != nil {
		t.Fatalf("folder A = %v; want it to still exist, undeleted", err)
	}
	if _, err := s.Cases.Get(ctx, caseA.ID); err != nil {
		t.Fatalf("case in folder A = %v; want it to still exist, undeleted", err)
	}
}
