package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func mustTeam(t *testing.T, s *store.Store, name string) string {
	t.Helper()
	team, err := s.Teams.Create(context.Background(), name)
	if err != nil {
		t.Fatalf("create team %s: %v", name, err)
	}
	return team.ID
}

func TestOIDCTeamMappingsCreateAndList(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	teamID := mustTeam(t, s, "Platform")

	created, err := s.OIDCTeamMappings.Create(ctx, "engineers", teamID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ClaimValue != "engineers" || created.TeamID != teamID {
		t.Errorf("created = %+v", created)
	}

	list, err := s.OIDCTeamMappings.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 || list[0].ID != created.ID {
		t.Errorf("list = %+v", list)
	}
}

func TestOIDCTeamMappingsDelete(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	teamID := mustTeam(t, s, "Platform")
	created, err := s.OIDCTeamMappings.Create(ctx, "engineers", teamID)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := s.OIDCTeamMappings.Delete(ctx, created.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	list, err := s.OIDCTeamMappings.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("list = %+v, want empty after delete", list)
	}
}

func TestOIDCTeamMappingsDeleteUnknownIsNotFound(t *testing.T) {
	s := testStore(t)
	err := s.OIDCTeamMappings.Delete(context.Background(), "00000000-0000-0000-0000-000000000000")
	if err != store.ErrNotFound {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestOIDCTeamMappingsCascadesWhenTeamDeleted(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	teamID := mustTeam(t, s, "Platform")
	if _, err := s.OIDCTeamMappings.Create(ctx, "engineers", teamID); err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := s.Teams.Delete(ctx, teamID); err != nil {
		t.Fatalf("Teams.Delete: %v", err)
	}

	list, err := s.OIDCTeamMappings.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("list = %+v, want empty after team cascade-delete", list)
	}
}
