package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func folderSlugTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "folder_slug_service")))
}

func mustCreateFolder(t *testing.T, s *service.Service, ctx context.Context, projectID, parentID, name string) domain.Folder {
	t.Helper()
	f, err := s.CreateFolder(ctx, projectID, domain.NewFolder{Name: name, ParentFolderID: parentID})
	if err != nil {
		t.Fatalf("CreateFolder(%q): %v", name, err)
	}
	return f
}

// TestCreateFolderRejectsSlugCollisionWithLiveSibling covers the spec
// scenario "Creating a folder with a name matching a sibling is rejected".
func TestCreateFolderRejectsSlugCollisionWithLiveSibling(t *testing.T) {
	s := folderSlugTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Slug Collision"})
	if err != nil {
		t.Fatal(err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	mustCreateFolder(t, s, ctx, project.ID, root.ID, "Auth")

	_, err = s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Auth", ParentFolderID: root.ID})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("CreateFolder with a colliding name = %v, want ValidationError", err)
	}
}

// TestCreateFolderRejectsWhitespaceHyphenVariantCollision covers "Names
// that differ but slugify identically are still rejected".
func TestCreateFolderRejectsWhitespaceHyphenVariantCollision(t *testing.T) {
	s := folderSlugTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Slug Variant Collision"})
	if err != nil {
		t.Fatal(err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	mustCreateFolder(t, s, ctx, project.ID, root.ID, "Two-Factor")

	if _, err := s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Two Factor", ParentFolderID: root.ID}); err == nil {
		t.Fatal("CreateFolder with a whitespace/hyphen-variant colliding name = nil error, want rejected")
	}
}

// TestCreateFolderRejectsCaseVariantCollision covers "Names that differ
// only by case are still rejected".
func TestCreateFolderRejectsCaseVariantCollision(t *testing.T) {
	s := folderSlugTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Slug Case Collision"})
	if err != nil {
		t.Fatal(err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	mustCreateFolder(t, s, ctx, project.ID, root.ID, "Auth")

	if _, err := s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "auth", ParentFolderID: root.ID}); err == nil {
		t.Fatal("CreateFolder with a case-variant colliding name = nil error, want rejected")
	}
}

// TestCreateFolderAllowsSameNameUnderDifferentParents covers "Same name is
// allowed under different parents".
func TestCreateFolderAllowsSameNameUnderDifferentParents(t *testing.T) {
	s := folderSlugTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Slug Different Parents"})
	if err != nil {
		t.Fatal(err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	parentA := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Parent A")
	parentB := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Parent B")

	if _, err := s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Settings", ParentFolderID: parentA.ID}); err != nil {
		t.Fatalf("CreateFolder under parent A: %v", err)
	}
	if _, err := s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Settings", ParentFolderID: parentB.ID}); err != nil {
		t.Fatalf("CreateFolder under parent B: %v", err)
	}
}

// TestMoveFolderRejectsSlugCollisionAtDestination covers "Moving a folder
// into a slug collision is rejected".
func TestMoveFolderRejectsSlugCollisionAtDestination(t *testing.T) {
	s := folderSlugTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Move Slug Collision"})
	if err != nil {
		t.Fatal(err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	dest := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Destination")
	mustCreateFolder(t, s, ctx, project.ID, dest.ID, "Auth")
	toMove := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Auth")

	before, err := s.ListFolders(ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.MoveFolder(ctx, toMove.ID, dest.ID)
	if err == nil {
		t.Fatal("MoveFolder into a slug collision = nil error, want rejected")
	}
	after, err := s.ListFolders(ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range after {
		if f.ID == toMove.ID && f.ParentFolderID != root.ID {
			t.Errorf("toMove's parent changed despite rejected move: %+v", f)
		}
	}
	if len(before) != len(after) {
		t.Errorf("folder count changed after a rejected move: before %d, after %d", len(before), len(after))
	}
}

// TestMoveFolderSetsAndOverwritesPreviousIdentity covers task 3.3: a move
// stamps previous_slug/previous_parent_folder_id to the folder's identity
// from before that move, and a second move overwrites both with only the
// most recent prior identity — the original, pre-first-move identity is
// not recoverable (the accepted single-hop-only scope limit).
func TestMoveFolderSetsAndOverwritesPreviousIdentity(t *testing.T) {
	s := folderSlugTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Move Previous Identity"})
	if err != nil {
		t.Fatal(err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	parentA := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Parent A")
	parentB := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Parent B")
	parentC := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Parent C")
	auth := mustCreateFolder(t, s, ctx, project.ID, parentA.ID, "Auth")

	moved, err := s.MoveFolder(ctx, auth.ID, parentB.ID)
	if err != nil {
		t.Fatalf("first move: %v", err)
	}
	if moved.PreviousParentFolderID != parentA.ID || moved.PreviousSlug != "auth" {
		t.Errorf("after first move, previous identity = (%q, %q), want (%q, \"auth\")", moved.PreviousParentFolderID, moved.PreviousSlug, parentA.ID)
	}

	movedAgain, err := s.MoveFolder(ctx, auth.ID, parentC.ID)
	if err != nil {
		t.Fatalf("second move: %v", err)
	}
	if movedAgain.PreviousParentFolderID != parentB.ID || movedAgain.PreviousSlug != "auth" {
		t.Errorf("after second move, previous identity = (%q, %q), want (%q, \"auth\") — only the most recent prior identity should be remembered", movedAgain.PreviousParentFolderID, movedAgain.PreviousSlug, parentB.ID)
	}
}

// TestMoveFolderBackToItsOwnPreviousParentSucceeds reproduces a real bug
// found via manual browser testing (not by any automated test written
// ahead of time): moving a folder away and then back to its original
// parent must succeed — the folder's own leftover previous-identity stamp
// from the first move must not make the reserved-slug check (task 3.4)
// block the second move as if some OTHER folder were squatting on the
// slug. checkFolderSlugAvailable must exclude the folder actually being
// moved from matching against itself.
func TestMoveFolderBackToItsOwnPreviousParentSucceeds(t *testing.T) {
	s := folderSlugTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Move Back And Forth"})
	if err != nil {
		t.Fatal(err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	elsewhere := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Elsewhere")
	localization := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Localization")

	if _, err := s.MoveFolder(ctx, localization.ID, elsewhere.ID); err != nil {
		t.Fatalf("first move (root -> elsewhere): %v", err)
	}

	if _, err := s.MoveFolder(ctx, localization.ID, root.ID); err != nil {
		t.Fatalf("second move (elsewhere -> back to root) = %v, want success — must not be blocked by its own previous-identity stamp from the first move", err)
	}
}

// TestFolderSlugReservedAfterMovePreventsReuse covers task 3.4: the
// silent-misdirect fix. A folder moved away frees its old slug, but that
// slug must stay unavailable to a DIFFERENT folder as long as it's still
// serving as the moved folder's redirect target — otherwise an old
// bookmark to the original folder would silently resolve to the new,
// unrelated one.
func TestFolderSlugReservedAfterMovePreventsReuse(t *testing.T) {
	s := folderSlugTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Reserved Slug"})
	if err != nil {
		t.Fatal(err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	parentP := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Parent P")
	elsewhere := mustCreateFolder(t, s, ctx, project.ID, root.ID, "Elsewhere")
	folderA := mustCreateFolder(t, s, ctx, project.ID, parentP.ID, "Auth")

	if _, err := s.MoveFolder(ctx, folderA.ID, elsewhere.ID); err != nil {
		t.Fatalf("moving folder A away: %v", err)
	}

	_, err = s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Auth", ParentFolderID: parentP.ID})
	if err == nil {
		t.Fatal("CreateFolder reusing a slug still reserved by a moved-away folder = nil error, want rejected")
	}
}
