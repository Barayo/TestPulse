package service_test

import (
	"context"
	"testing"
)

func TestCreateOIDCTeamMappingRejectsUnknownTeam(t *testing.T) {
	s := testService(t)
	_, err := s.CreateOIDCTeamMapping(context.Background(), "engineers", "00000000-0000-0000-0000-000000000000")
	if err == nil {
		t.Fatal("expected error creating a mapping for an unknown team")
	}
}

func TestCreateListDeleteOIDCTeamMapping(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	team, err := st.Teams.Create(ctx, "Platform")
	if err != nil {
		t.Fatalf("Teams.Create: %v", err)
	}

	created, err := s.CreateOIDCTeamMapping(ctx, "engineers", team.ID)
	if err != nil {
		t.Fatalf("CreateOIDCTeamMapping: %v", err)
	}
	if created.ClaimValue != "engineers" || created.TeamID != team.ID {
		t.Errorf("created = %+v", created)
	}

	list, err := s.ListOIDCTeamMappings(ctx)
	if err != nil {
		t.Fatalf("ListOIDCTeamMappings: %v", err)
	}
	if len(list) != 1 || list[0].ID != created.ID {
		t.Errorf("list = %+v", list)
	}

	if err := s.DeleteOIDCTeamMapping(ctx, created.ID); err != nil {
		t.Fatalf("DeleteOIDCTeamMapping: %v", err)
	}
	list, err = s.ListOIDCTeamMappings(ctx)
	if err != nil {
		t.Fatalf("ListOIDCTeamMappings: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("list = %+v, want empty after delete", list)
	}
}

func TestDeleteOIDCTeamMappingUnknownIsNotFound(t *testing.T) {
	s := testService(t)
	err := s.DeleteOIDCTeamMapping(context.Background(), "00000000-0000-0000-0000-000000000000")
	if err == nil {
		t.Fatal("expected error deleting an unknown mapping")
	}
}
