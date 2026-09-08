package store_test

// add-reusable-steps: TDD coverage for StepGroupRepo, mirroring
// CustomFieldRepo's shape (simple project-scoped CRUD, no versioning of
// its own) plus soft-delete semantics like FolderRepo.

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestStepGroupRepoCreate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	g, err := s.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{
		{Action: "open login page"},
		{Action: "enter admin credentials"},
		{Action: "click login", Expected: "dashboard is shown"},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if g.ID == "" {
		t.Error("ID = empty, want set")
	}
	if g.Key == "" {
		t.Error("Key = empty, want set")
	}
	if g.ProjectID != p.ID {
		t.Errorf("ProjectID = %q, want %q", g.ProjectID, p.ID)
	}
	if g.Name != "Log in as admin" {
		t.Errorf("Name = %q, want %q", g.Name, "Log in as admin")
	}
	if len(g.Steps) != 3 {
		t.Fatalf("Steps = %d, want 3", len(g.Steps))
	}
	if g.CreatedAt.IsZero() || g.UpdatedAt.IsZero() {
		t.Error("CreatedAt/UpdatedAt not set")
	}
}

func TestStepGroupRepoGet(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	created, err := s.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{{Action: "a"}})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := s.StepGroups.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != created.ID || got.Name != created.Name {
		t.Errorf("Get = %+v, want matching %+v", got, created)
	}
}

func TestStepGroupRepoGetByKey(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	created, err := s.StepGroups.Create(ctx, p.ID, "Log in as admin", []domain.Step{{Action: "a"}})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := s.StepGroups.GetByKey(ctx, created.Key)
	if err != nil {
		t.Fatalf("GetByKey: %v", err)
	}
	if got.ID != created.ID {
		t.Errorf("GetByKey ID = %q, want %q", got.ID, created.ID)
	}
}

func TestStepGroupRepoList(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	if _, err := s.StepGroups.Create(ctx, p.ID, "Group A", []domain.Step{{Action: "a"}}); err != nil {
		t.Fatalf("create A: %v", err)
	}
	if _, err := s.StepGroups.Create(ctx, p.ID, "Group B", []domain.Step{{Action: "b"}}); err != nil {
		t.Fatalf("create B: %v", err)
	}

	other := mustProject(t, s)
	if _, err := s.StepGroups.Create(ctx, other.ID, "Group C", []domain.Step{{Action: "c"}}); err != nil {
		t.Fatalf("create C: %v", err)
	}

	groups, err := s.StepGroups.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(groups) != 2 {
		t.Fatalf("List = %d groups, want 2 (scoped to the first project only)", len(groups))
	}
}

func TestStepGroupRepoUpdate(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	created, err := s.StepGroups.Create(ctx, p.ID, "Original name", []domain.Step{{Action: "a"}})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	updated, err := s.StepGroups.Update(ctx, created.ID, "New name", []domain.Step{{Action: "x"}, {Action: "y"}})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.Name != "New name" {
		t.Errorf("Name = %q, want %q", updated.Name, "New name")
	}
	if len(updated.Steps) != 2 {
		t.Fatalf("Steps = %d, want 2", len(updated.Steps))
	}
	if !updated.UpdatedAt.After(created.UpdatedAt) && !updated.UpdatedAt.Equal(created.UpdatedAt) {
		t.Errorf("UpdatedAt = %v, want >= created UpdatedAt %v", updated.UpdatedAt, created.UpdatedAt)
	}
}

func TestStepGroupRepoDeleteIsSoft(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	created, err := s.StepGroups.Create(ctx, p.ID, "To delete", []domain.Step{{Action: "a"}})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := s.StepGroups.Delete(ctx, created.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := s.StepGroups.Get(ctx, created.ID); err == nil {
		t.Error("Get after delete = nil error, want ErrNotFound (excluded once deleted)")
	}

	groups, err := s.StepGroups.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	for _, g := range groups {
		if g.ID == created.ID {
			t.Error("deleted group still appears in List")
		}
	}
}
