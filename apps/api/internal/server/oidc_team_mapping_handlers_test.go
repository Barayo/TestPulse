package server_test

import (
	"testing"
)

func TestScenario_ListOIDCTeamMappingsRequiresTenantAdmin(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "team-mapping-regular@example.com", "password": "correcthorse"}, 201, &user)
	regular := loginCookie(t, handler, "team-mapping-regular@example.com", "correcthorse")

	callAs(t, handler, regular, "GET", "/api/v1/sso/team-mappings", nil, 403, nil)
}

func TestScenario_CreateOIDCTeamMapping(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var team jmap
	callAs(t, handler, admin, "POST", "/api/v1/teams", jmap{"name": "Platform"}, 201, &team)
	teamID, _ := team["id"].(string)

	var created jmap
	callAs(t, handler, admin, "POST", "/api/v1/sso/team-mappings", jmap{"claimValue": "engineers", "teamId": teamID}, 201, &created)
	if created["claimValue"] != "engineers" || created["teamId"] != teamID {
		t.Errorf("created = %+v", created)
	}

	var list []jmap
	callAs(t, handler, admin, "GET", "/api/v1/sso/team-mappings", nil, 200, &list)
	if len(list) != 1 {
		t.Errorf("list = %+v, want one mapping", list)
	}
}

func TestScenario_CreateOIDCTeamMappingUnknownTeamRejected(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	callAs(t, handler, admin, "POST", "/api/v1/sso/team-mappings",
		jmap{"claimValue": "engineers", "teamId": "00000000-0000-0000-0000-000000000000"}, 400, nil)
}

func TestScenario_DeleteOIDCTeamMapping(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var team jmap
	callAs(t, handler, admin, "POST", "/api/v1/teams", jmap{"name": "Platform"}, 201, &team)
	teamID, _ := team["id"].(string)

	var created jmap
	callAs(t, handler, admin, "POST", "/api/v1/sso/team-mappings", jmap{"claimValue": "engineers", "teamId": teamID}, 201, &created)
	mappingID, _ := created["id"].(string)

	callAs(t, handler, admin, "DELETE", "/api/v1/sso/team-mappings/"+mappingID, nil, 204, nil)

	var list []jmap
	callAs(t, handler, admin, "GET", "/api/v1/sso/team-mappings", nil, 200, &list)
	if len(list) != 0 {
		t.Errorf("list = %+v, want empty after delete", list)
	}
}

func TestScenario_DeleteOIDCTeamMappingUnknownIsNotFound(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	callAs(t, handler, admin, "DELETE", "/api/v1/sso/team-mappings/00000000-0000-0000-0000-000000000000", nil, 404, nil)
}
