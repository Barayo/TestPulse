package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

const missingID = "00000000-0000-0000-0000-000000000000"

func TestNotFoundPaths(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	checks := map[string]error{}

	_, err := s.Projects.Get(ctx, missingID)
	checks["Projects.Get"] = err
	checks["Projects.Rename"] = s.Projects.Rename(ctx, missingID, "x")
	checks["Projects.Archive"] = s.Projects.Archive(ctx, missingID)

	_, err = s.Cases.Get(ctx, missingID)
	checks["Cases.Get"] = err
	_, err = s.Cases.NewVersion(ctx, missingID, domain.CaseContent{Title: "t"}, domain.ResultActorUnknown, "")
	checks["Cases.NewVersion"] = err
	checks["Cases.SoftDelete"] = s.Cases.SoftDelete(ctx, missingID)

	_, err = s.Suites.Get(ctx, missingID)
	checks["Suites.Get"] = err

	_, err = s.Runs.Get(ctx, missingID)
	checks["Runs.Get"] = err
	_, err = s.Runs.AddItem(ctx, missingID, missingID, "")
	checks["Runs.AddItem"] = err
	checks["Runs.SetItemStatus"] = s.Runs.SetItemStatus(ctx, missingID, domain.StatusRetest)
	checks["Runs.AssignItemToUser"] = s.Runs.AssignItemToUser(ctx, missingID, missingID)
	_, err = s.Runs.Summary(ctx, missingID)
	checks["Runs.Summary"] = err

	for op, err := range checks {
		if !errors.Is(err, store.ErrNotFound) {
			t.Errorf("%s with missing id = %v, want ErrNotFound", op, err)
		}
	}
}

func TestSoftDeletedCaseCannotJoinRun(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "doomed")
	run, _ := s.Runs.Create(ctx, p.ID, "r", nil)

	if err := s.Cases.SoftDelete(ctx, c.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Runs.AddItem(ctx, run.ID, c.ID, ""); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("AddItem with deleted case = %v, want ErrNotFound", err)
	}
}

func TestDeletedCaseStillReadableInRun(t *testing.T) {
	// Spec scenario: deleted case referenced by a run keeps its pinned content.
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "keep my history")
	run, _ := s.Runs.Create(ctx, p.ID, "r", []string{c.ID})

	if err := s.Cases.SoftDelete(ctx, c.ID); err != nil {
		t.Fatal(err)
	}
	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("Items after delete = %d, %v", len(items), err)
	}
	if items[0].Content.Title != "keep my history" {
		t.Errorf("pinned content lost after soft delete: %+v", items[0].Content)
	}
}
