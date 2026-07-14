package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// --- Description/owner (task 2.1) ---

func TestCreateProjectWithDescriptionAndOwner(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	owner := mustUser(t, s, "owner@b.com", domain.RoleMember)

	p, err := s.Projects.Create(ctx, "QA", "a real project", &owner.ID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if p.Description != "a real project" {
		t.Errorf("Description = %q, want %q", p.Description, "a real project")
	}
	if p.OwnerID == nil || *p.OwnerID != owner.ID {
		t.Errorf("OwnerID = %v, want %q", p.OwnerID, owner.ID)
	}

	got, err := s.Projects.Get(ctx, p.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Description != "a real project" || got.OwnerID == nil || *got.OwnerID != owner.ID {
		t.Errorf("Get round-trip = %+v", got)
	}
}

func TestCreateProjectWithoutDescriptionAndOwner(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	p, err := s.Projects.Create(ctx, "QA", "", nil)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if p.Description != "" {
		t.Errorf("Description = %q, want empty", p.Description)
	}
	if p.OwnerID != nil {
		t.Errorf("OwnerID = %v, want nil", p.OwnerID)
	}
}

func TestSetDescriptionAndOwner(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p, err := s.Projects.Create(ctx, "QA", "", nil)
	if err != nil {
		t.Fatal(err)
	}
	owner := mustUser(t, s, "owner2@b.com", domain.RoleMember)

	if err := s.Projects.SetDescription(ctx, p.ID, "updated description"); err != nil {
		t.Fatalf("SetDescription: %v", err)
	}
	if err := s.Projects.SetOwner(ctx, p.ID, &owner.ID); err != nil {
		t.Fatalf("SetOwner: %v", err)
	}

	got, err := s.Projects.Get(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Description != "updated description" {
		t.Errorf("Description = %q, want %q", got.Description, "updated description")
	}
	if got.OwnerID == nil || *got.OwnerID != owner.ID {
		t.Errorf("OwnerID = %v, want %q", got.OwnerID, owner.ID)
	}

	// Clearing the owner (nil) must reset it to unowned.
	if err := s.Projects.SetOwner(ctx, p.ID, nil); err != nil {
		t.Fatalf("SetOwner(nil): %v", err)
	}
	got, err = s.Projects.Get(ctx, p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.OwnerID != nil {
		t.Errorf("OwnerID after clearing = %v, want nil", got.OwnerID)
	}
}

// --- Favorites (task 2.2) ---

func TestStarAndUnstarProject(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "star@b.com", domain.RoleMember)
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
	u := mustUser(t, s, "idempotent@b.com", domain.RoleMember)
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
	u := mustUser(t, s, "noop@b.com", domain.RoleMember)
	p := mustProject(t, s)

	if err := s.Projects.Unstar(ctx, u.ID, p.ID); err != nil {
		t.Errorf("Unstar with no prior star: %v", err)
	}
}

func TestFavoritesArePerUser(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	a := mustUser(t, s, "usera@b.com", domain.RoleMember)
	b := mustUser(t, s, "userb@b.com", domain.RoleMember)
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
	a := mustUser(t, s, "summ-a@b.com", domain.RoleMember)
	b := mustUser(t, s, "summ-b@b.com", domain.RoleMember)
	p1 := mustProject(t, s)
	p2, err := s.Projects.Create(ctx, "Second", "", nil)
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
