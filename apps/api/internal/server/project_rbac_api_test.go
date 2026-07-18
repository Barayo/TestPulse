package server_test

import (
	"net/http"
	"testing"
)

// Enforcement-matrix scenarios for add-project-rbac (design.md D6/D10): one
// project, one Tenant Admin, and a second user assigned successively
// higher-permissioned roles, exercising the boundary each role crosses.
// Roles are fully custom and instance-wide (design.md D10), so tests look
// up the seeded default roles (Tester/Contributor/Project Admin, added by
// migration 00003_identity.sql) by name via GET /api/v1/roles rather than
// assuming a fixed enum value.

func roleIDByName(t *testing.T, h http.Handler, adminCookie, name string) string {
	t.Helper()
	var roles []jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/roles", nil, 200, &roles)
	for _, r := range roles {
		if r["name"] == name {
			id, _ := r["id"].(string)
			return id
		}
	}
	t.Fatalf("no seeded role named %q found in %+v", name, roles)
	return ""
}

func TestScenario_NoMembershipCannotSeeProject(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var member jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "outsider@example.com", "password": "correcthorse"}, 201, &member)
	memberCookie := loginCookie(t, handler, "outsider@example.com", "correcthorse")

	var errBody jmap
	callAs(t, handler, memberCookie, "GET", "/api/v1/projects/"+projectID, nil, 403, &errBody)
	callAs(t, handler, memberCookie, "GET", "/api/v1/projects/"+projectID+"/cases", nil, 403, &errBody)

	var list []jmap
	callAs(t, handler, memberCookie, "GET", "/api/v1/projects", nil, 200, &list)
	if len(list) != 0 {
		t.Errorf("project list = %+v, want empty (no membership)", list)
	}
}

func TestScenario_TesterCanReadAndExecuteButNotAuthor(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	testerRoleID := roleIDByName(t, handler, admin, "Tester")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "tester@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectID+"/members/"+userID,
		jmap{"roleId": testerRoleID}, 204, nil)
	testerCookie := loginCookie(t, handler, "tester@example.com", "correcthorse")

	// Read access: granted.
	callAs(t, handler, testerCookie, "GET", "/api/v1/projects/"+projectID, nil, 200, nil)
	callAs(t, handler, testerCookie, "GET", "/api/v1/projects/"+projectID+"/cases", nil, 200, nil)

	// Tester can create and execute runs.
	var run jmap
	callAs(t, handler, testerCookie, "POST", "/api/v1/projects/"+projectID+"/runs",
		jmap{"name": "Sprint 1"}, 201, &run)

	// Tester cannot author cases/folders/suites.
	var errBody jmap
	callAs(t, handler, testerCookie, "POST", "/api/v1/projects/"+projectID+"/cases",
		jmap{"title": "Login works"}, 403, &errBody)
	callAs(t, handler, testerCookie, "POST", "/api/v1/projects/"+projectID+"/folders",
		jmap{"name": "Auth"}, 403, &errBody)
	callAs(t, handler, testerCookie, "POST", "/api/v1/projects/"+projectID+"/suites",
		jmap{"name": "Smoke"}, 403, &errBody)
}

func TestScenario_ContributorCanAuthorButNotDelete(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	contributorRoleID := roleIDByName(t, handler, admin, "Contributor")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "contributor@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectID+"/members/"+userID,
		jmap{"roleId": contributorRoleID}, 204, nil)
	contributorCookie := loginCookie(t, handler, "contributor@example.com", "correcthorse")

	var c jmap
	callAs(t, handler, contributorCookie, "POST", "/api/v1/projects/"+projectID+"/cases",
		jmap{"title": "Login works"}, 201, &c)
	caseID, _ := c["id"].(string)

	// Contributor can edit but not delete.
	callAs(t, handler, contributorCookie, "PUT", "/api/v1/cases/"+caseID,
		jmap{"title": "Login works (edited)", "steps": []jmap{}}, 200, nil)
	var errBody jmap
	callAs(t, handler, contributorCookie, "DELETE", "/api/v1/cases/"+caseID, nil, 403, &errBody)

	// Contributor cannot administer the project itself.
	callAs(t, handler, contributorCookie, "PATCH", "/api/v1/projects/"+projectID,
		jmap{"description": "nope"}, 403, &errBody)
}

func TestScenario_ProjectAdminCanDeleteButNotAssignMembership(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	projectAdminRoleID := roleIDByName(t, handler, admin, "Project Admin")
	testerRoleID := roleIDByName(t, handler, admin, "Tester")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var c jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectID+"/cases",
		jmap{"title": "Login works"}, 201, &c)
	caseID, _ := c["id"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "projectadmin@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectID+"/members/"+userID,
		jmap{"roleId": projectAdminRoleID}, 204, nil)
	paCookie := loginCookie(t, handler, "projectadmin@example.com", "correcthorse")

	// Project Admin can rename/describe the project and delete cases.
	callAs(t, handler, paCookie, "PATCH", "/api/v1/projects/"+projectID,
		jmap{"description": "now described"}, 200, nil)
	callAs(t, handler, paCookie, "DELETE", "/api/v1/cases/"+caseID, nil, 204, nil)

	// But cannot assign project membership — that's Tenant-Admin-only.
	var other jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "another@example.com", "password": "correcthorse"}, 201, &other)
	otherID, _ := other["id"].(string)
	var errBody jmap
	callAs(t, handler, paCookie, "PUT", "/api/v1/projects/"+projectID+"/members/"+otherID,
		jmap{"roleId": testerRoleID}, 403, &errBody)
}

func TestScenario_TeamMembershipGrantsProjectAccess(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	testerRoleID := roleIDByName(t, handler, admin, "Tester")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "viateam@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)

	var team jmap
	callAs(t, handler, admin, "POST", "/api/v1/teams", jmap{"name": "QA Core"}, 201, &team)
	teamID, _ := team["id"].(string)
	callAs(t, handler, admin, "POST", "/api/v1/teams/"+teamID+"/members/"+userID, nil, 200, nil)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectID+"/teams/"+teamID,
		jmap{"roleId": testerRoleID}, 204, nil)

	memberCookie := loginCookie(t, handler, "viateam@example.com", "correcthorse")
	callAs(t, handler, memberCookie, "GET", "/api/v1/projects/"+projectID, nil, 200, nil)
}

func TestScenario_TenantAdminManagesRolesOverHTTP(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var created jmap
	callAs(t, handler, admin, "POST", "/api/v1/roles",
		jmap{"name": "Reviewer (http-test)", "rank": 9, "canRead": true, "canCaseCreate": false}, 201, &created)
	roleID, _ := created["id"].(string)
	if roleID == "" {
		t.Fatalf("createRole response missing id: %+v", created)
	}

	var updated jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/roles/"+roleID,
		jmap{"name": "Senior Reviewer (http-test)", "rank": 9, "canRead": true, "canCaseCreate": true}, 200, &updated)
	if updated["name"] != "Senior Reviewer (http-test)" || updated["canCaseCreate"] != true {
		t.Errorf("updateRole response = %+v", updated)
	}

	callAs(t, handler, admin, "DELETE", "/api/v1/roles/"+roleID, nil, 204, nil)

	var roles []jmap
	callAs(t, handler, admin, "GET", "/api/v1/roles", nil, 200, &roles)
	for _, r := range roles {
		if r["id"] == roleID {
			t.Errorf("role %v still present after DELETE", r)
		}
	}
}

func TestScenario_ResetRolesToDefaultsOverHTTP(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	testerRoleID := roleIDByName(t, handler, admin, "Tester")

	// Tenant Admin customizes Tester, then a non-Tenant-Admin is rejected
	// from resetting.
	callAs(t, handler, admin, "PATCH", "/api/v1/roles/"+testerRoleID,
		jmap{"name": "Tester", "rank": 1, "canRead": true, "canManageProject": true}, 200, nil)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "reset-test@example.com", "password": "correcthorse"}, 201, &user)
	notAdmin := loginCookie(t, handler, "reset-test@example.com", "correcthorse")
	var errBody jmap
	callAs(t, handler, notAdmin, "POST", "/api/v1/roles/reset", nil, 403, &errBody)

	var reset []jmap
	callAs(t, handler, admin, "POST", "/api/v1/roles/reset", nil, 200, &reset)
	found := false
	for _, r := range reset {
		if r["id"] == testerRoleID {
			found = true
			if r["canManageProject"] != false {
				t.Errorf("Tester still has the custom manageProject flag after reset: %+v", r)
			}
		}
	}
	if !found {
		t.Errorf("reset response missing Tester (id %s): %+v", testerRoleID, reset)
	}
}

func TestScenario_ReadAndRemoveProjectMembershipOverHTTP(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	testerRoleID := roleIDByName(t, handler, admin, "Tester")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "readmembership@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectID+"/members/"+userID,
		jmap{"roleId": testerRoleID}, 204, nil)

	var team jmap
	callAs(t, handler, admin, "POST", "/api/v1/teams", jmap{"name": "Read Membership Team"}, 201, &team)
	teamID, _ := team["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectID+"/teams/"+teamID,
		jmap{"roleId": testerRoleID}, 204, nil)

	var membership jmap
	callAs(t, handler, admin, "GET", "/api/v1/projects/"+projectID+"/members", nil, 200, &membership)
	users, _ := membership["users"].([]any)
	teams, _ := membership["teams"].([]any)
	if len(users) != 1 || len(teams) != 1 {
		t.Fatalf("getProjectMembership = %+v", membership)
	}

	callAs(t, handler, admin, "DELETE", "/api/v1/projects/"+projectID+"/members/"+userID, nil, 204, nil)
	callAs(t, handler, admin, "DELETE", "/api/v1/projects/"+projectID+"/teams/"+teamID, nil, 204, nil)

	callAs(t, handler, admin, "GET", "/api/v1/projects/"+projectID+"/members", nil, 200, &membership)
	users, _ = membership["users"].([]any)
	teams, _ = membership["teams"].([]any)
	if len(users) != 0 || len(teams) != 0 {
		t.Errorf("membership after removal = %+v, want empty", membership)
	}
}

// The PUT (assign) siblings of these routes already have 403 coverage
// (TestScenario_ProjectAdminCanDeleteButNotAssignMembership,
// TestScenario_NonTenantAdminCannotAssignProjectMembership at the service
// layer); the DELETE (remove) routes exercised by ProjectMembersPage's
// confirmation dialogs did not, so this closes that gap over HTTP.
func TestScenario_NonTenantAdminCannotRemoveProjectMembershipOverHTTP(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	testerRoleID := roleIDByName(t, handler, admin, "Tester")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "removemember@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectID+"/members/"+userID,
		jmap{"roleId": testerRoleID}, 204, nil)

	var team jmap
	callAs(t, handler, admin, "POST", "/api/v1/teams", jmap{"name": "Remove Membership Team"}, 201, &team)
	teamID, _ := team["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectID+"/teams/"+teamID,
		jmap{"roleId": testerRoleID}, 204, nil)

	var bystander jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "bystander@example.com", "password": "correcthorse"}, 201, &bystander)
	bystanderCookie := loginCookie(t, handler, "bystander@example.com", "correcthorse")

	var errBody jmap
	callAs(t, handler, bystanderCookie, "DELETE", "/api/v1/projects/"+projectID+"/members/"+userID, nil, 403, &errBody)
	callAs(t, handler, bystanderCookie, "DELETE", "/api/v1/projects/"+projectID+"/teams/"+teamID, nil, 403, &errBody)

	// Neither attempt actually removed anything.
	var membership jmap
	callAs(t, handler, admin, "GET", "/api/v1/projects/"+projectID+"/members", nil, 200, &membership)
	users, _ := membership["users"].([]any)
	teams, _ := membership["teams"].([]any)
	if len(users) != 1 || len(teams) != 1 {
		t.Errorf("membership after rejected removal = %+v, want unchanged (1 user, 1 team)", membership)
	}
}

func TestScenario_NonTenantAdminCannotManageTeamsOverHTTP(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "notadmin@example.com", "password": "correcthorse"}, 201, &user)
	cookie := loginCookie(t, handler, "notadmin@example.com", "correcthorse")

	var errBody jmap
	callAs(t, handler, cookie, "POST", "/api/v1/teams", jmap{"name": "Sneaky"}, 403, &errBody)
}
