package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// --- Description (task 2.1) ---

func TestCreateProjectWithDescription(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	p, err := s.Projects.Create(ctx, "QA", "a real project")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if p.Description != "a real project" {
		t.Errorf("Description = %q, want %q", p.Description, "a real project")
	}

	got, err := s.Projects.Get(ctx, p.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Description != "a real project" {
		t.Errorf("Get round-trip Description = %q, want %q", got.Description, "a real project")
	}
}

func TestCreateProjectWithoutDescription(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	p, err := s.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if p.Description != "" {
		t.Errorf("Description = %q, want empty", p.Description)
	}
}

func TestSetDescription(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p, err := s.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatal(err)
	}

	if err := s.Projects.SetDescription(ctx, p.ID, "updated description"); err != nil {
		t.Fatalf("SetDescription: %v", err)
	}

	got, err := s.Projects.Get(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Description != "updated description" {
		t.Errorf("Description = %q, want %q", got.Description, "updated description")
	}
}

// --- Sample project flag (add-sample-project, task 2.1) ---

func TestCreateProjectDefaultsIsSampleFalse(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	p, err := s.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if p.IsSample {
		t.Error("IsSample = true on a normally-created project, want false")
	}

	got, err := s.Projects.Get(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.IsSample {
		t.Error("Get round-trip IsSample = true, want false")
	}
}

func TestMarkSampleSetsFlag(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p, err := s.Projects.Create(ctx, "Sample Project", "")
	if err != nil {
		t.Fatal(err)
	}

	if err := s.Projects.MarkSample(ctx, p.ID); err != nil {
		t.Fatalf("MarkSample: %v", err)
	}

	got, err := s.Projects.Get(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.IsSample {
		t.Error("IsSample = false after MarkSample, want true")
	}

	list, err := s.Projects.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || !list[0].IsSample {
		t.Errorf("List = %+v, want one project with IsSample true", list)
	}
}

// --- Favorites (task 2.2) ---

func TestStarAndUnstarProject(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "star@b.com", false)
	p := mustProject(t, s)

	fav, err := s.Projects.IsFavorite(ctx, u.ID, p.ID)
	if err != nil {
		t.Fatalf("IsFavorite before star: %v", err)
	}
	if fav {
		t.Fatal("IsFavorite = true before any star")
	}

	if err := s.Projects.Star(ctx, u.ID, p.ID); err != nil {
		t.Fatalf("Star: %v", err)
	}
	fav, err = s.Projects.IsFavorite(ctx, u.ID, p.ID)
	if err != nil || !fav {
		t.Errorf("IsFavorite after star = %v, %v; want true", fav, err)
	}

	if err := s.Projects.Unstar(ctx, u.ID, p.ID); err != nil {
		t.Fatalf("Unstar: %v", err)
	}
	fav, err = s.Projects.IsFavorite(ctx, u.ID, p.ID)
	if err != nil || fav {
		t.Errorf("IsFavorite after unstar = %v, %v; want false", fav, err)
	}
}

func TestStarIsIdempotent(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "idempotent@b.com", false)
	p := mustProject(t, s)

	if err := s.Projects.Star(ctx, u.ID, p.ID); err != nil {
		t.Fatalf("first Star: %v", err)
	}
	if err := s.Projects.Star(ctx, u.ID, p.ID); err != nil {
		t.Fatalf("second Star (should be idempotent): %v", err)
	}
	fav, err := s.Projects.IsFavorite(ctx, u.ID, p.ID)
	if err != nil || !fav {
		t.Errorf("IsFavorite = %v, %v; want true", fav, err)
	}
}

func TestUnstarNonFavoriteIsNoop(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "noop@b.com", false)
	p := mustProject(t, s)

	if err := s.Projects.Unstar(ctx, u.ID, p.ID); err != nil {
		t.Errorf("Unstar with no prior star: %v", err)
	}
}

func TestFavoritesArePerUser(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := mustUser(t, s, "usera@b.com", false)
	b := mustUser(t, s, "userb@b.com", false)
	p := mustProject(t, s)

	if err := s.Projects.Star(ctx, a.ID, p.ID); err != nil {
		t.Fatal(err)
	}

	favA, err := s.Projects.IsFavorite(ctx, a.ID, p.ID)
	if err != nil || !favA {
		t.Errorf("user A IsFavorite = %v, %v; want true", favA, err)
	}
	favB, err := s.Projects.IsFavorite(ctx, b.ID, p.ID)
	if err != nil || favB {
		t.Errorf("user B IsFavorite = %v, %v; want false", favB, err)
	}
}

// --- Summaries reflect the caller's favorites (task 2.3) ---

func TestSummariesReflectFavoriteForCaller(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := mustUser(t, s, "summ-a@b.com", false)
	b := mustUser(t, s, "summ-b@b.com", false)
	p1 := mustProject(t, s)
	p2, err := s.Projects.Create(ctx, "Second", "")
	if err != nil {
		t.Fatal(err)
	}

	if err := s.Projects.Star(ctx, a.ID, p1.ID); err != nil {
		t.Fatal(err)
	}

	summariesA, err := s.Projects.Summaries(ctx, a.ID)
	if err != nil {
		t.Fatalf("Summaries(a): %v", err)
	}
	byID := map[string]domain.ProjectSummary{}
	for _, sm := range summariesA {
		byID[sm.ProjectID] = sm
	}
	if !byID[p1.ID].IsFavorite {
		t.Errorf("p1 IsFavorite for user A = false, want true")
	}
	if byID[p2.ID].IsFavorite {
		t.Errorf("p2 IsFavorite for user A = true, want false")
	}

	summariesB, err := s.Projects.Summaries(ctx, b.ID)
	if err != nil {
		t.Fatalf("Summaries(b): %v", err)
	}
	for _, sm := range summariesB {
		if sm.IsFavorite {
			t.Errorf("project %s IsFavorite for user B = true, want false (A's star shouldn't leak)", sm.ProjectID)
		}
	}
}
