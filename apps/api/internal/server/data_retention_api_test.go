package server_test

import (
	"fmt"
	"testing"
)

// HTTP-level scenarios for add-data-retention —
// openspec/changes/add-data-retention/specs/.

func TestScenario_DeleteRunOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)

	call(t, h, "DELETE", "/api/v1/runs/"+run.Key, nil, 204, nil)
	call(t, h, "GET", "/api/v1/runs/"+run.Key, nil, 404, nil)
}

func TestScenario_DeleteRunRequiresRunDeletePermission(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	contributorRoleID := roleIDByName(t, handler, admin, "Contributor")
	projectAdminRoleID := roleIDByName(t, handler, admin, "Project Admin")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var contributor jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "run-deleter-contributor@example.com", "password": "correcthorse"}, 201, &contributor)
	contributorID, _ := contributor["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+contributorID,
		jmap{"roleId": contributorRoleID}, 204, nil)
	contributorCookie := loginCookie(t, handler, "run-deleter-contributor@example.com", "correcthorse")

	var projectAdmin jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "run-deleter-admin@example.com", "password": "correcthorse"}, 201, &projectAdmin)
	projectAdminID, _ := projectAdmin["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+projectAdminID,
		jmap{"roleId": projectAdminRoleID}, 204, nil)
	projectAdminCookie := loginCookie(t, handler, "run-deleter-admin@example.com", "correcthorse")

	var run jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/runs", jmap{"name": "sprint 1"}, 201, &run)
	runKey, _ := run["key"].(string)

	// Contributor lacks runDelete.
	callAs(t, handler, contributorCookie, "DELETE", "/api/v1/runs/"+runKey, nil, 403, nil)

	// Project Admin has runDelete.
	callAs(t, handler, projectAdminCookie, "DELETE", "/api/v1/runs/"+runKey, nil, 204, nil)
}

// --- Automatic run retention (design.md D8) ---

func TestScenario_GetInstanceSettingsReturnsRunRetentionDays(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var got jmap
	callAs(t, handler, admin, "GET", "/api/v1/instance-settings", nil, 200, &got)
	if got["runRetentionDays"] != float64(0) {
		t.Errorf("runRetentionDays = %v, want 0 (seeded default)", got["runRetentionDays"])
	}

	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings", jmap{"runRetentionDays": 30}, 200, nil)
	callAs(t, handler, admin, "GET", "/api/v1/instance-settings", nil, 200, &got)
	if got["runRetentionDays"] != float64(30) {
		t.Errorf("runRetentionDays after PATCH = %v, want 30", got["runRetentionDays"])
	}
}

func TestScenario_GetInstanceSettingsRequiresTenantAdmin(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "get-settings-regular@example.com", "password": "correcthorse"}, 201, &user)
	regular := loginCookie(t, handler, "get-settings-regular@example.com", "correcthorse")

	callAs(t, handler, regular, "GET", "/api/v1/instance-settings", nil, 403, nil)
}

func TestScenario_PatchInstanceSettingsAcceptsRunRetentionDaysAlone(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var got jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings", jmap{"runRetentionDays": 14}, 200, &got)
	if got["runRetentionDays"] != float64(14) {
		t.Errorf("runRetentionDays = %v, want 14", got["runRetentionDays"])
	}
	if got["publicProjectsEnabled"] != true {
		t.Errorf("publicProjectsEnabled = %v, want unchanged true", got["publicProjectsEnabled"])
	}
}

func TestScenario_PatchInstanceSettingsAcceptsBothFieldsTogether(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var got jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings",
		jmap{"runRetentionDays": 7, "publicProjectsEnabled": false}, 200, &got)
	if got["runRetentionDays"] != float64(7) {
		t.Errorf("runRetentionDays = %v, want 7", got["runRetentionDays"])
	}
	if got["publicProjectsEnabled"] != false {
		t.Errorf("publicProjectsEnabled = %v, want false", got["publicProjectsEnabled"])
	}
}

func TestScenario_PatchInstanceSettingsRejectsNegativeRunRetentionDays(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings", jmap{"runRetentionDays": -1}, 400, nil)

	var got jmap
	callAs(t, handler, admin, "GET", "/api/v1/instance-settings", nil, 200, &got)
	if got["runRetentionDays"] != float64(0) {
		t.Errorf("runRetentionDays after rejected PATCH = %v, want unchanged 0", got["runRetentionDays"])
	}
}

// --- Automatic project archiving (design.md D9) ---

func TestScenario_PatchInstanceSettingsAcceptsAutoArchiveInactiveDays(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var got jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings",
		jmap{"autoArchiveInactiveDays": 60, "runRetentionDays": 14}, 200, &got)
	if got["autoArchiveInactiveDays"] != float64(60) {
		t.Errorf("autoArchiveInactiveDays = %v, want 60", got["autoArchiveInactiveDays"])
	}
	if got["runRetentionDays"] != float64(14) {
		t.Errorf("runRetentionDays = %v, want 14", got["runRetentionDays"])
	}

	callAs(t, handler, admin, "GET", "/api/v1/instance-settings", nil, 200, &got)
	if got["autoArchiveInactiveDays"] != float64(60) {
		t.Errorf("GET autoArchiveInactiveDays = %v, want 60", got["autoArchiveInactiveDays"])
	}
}

func TestScenario_PatchProjectAutoArchiveExemptRequiresTenantAdmin(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	projectAdminRoleID := roleIDByName(t, handler, admin, "Project Admin")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Exempt Check"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var projectAdmin jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "exempt-project-admin@example.com", "password": "correcthorse"}, 201, &projectAdmin)
	projectAdminID, _ := projectAdmin["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+projectAdminID,
		jmap{"roleId": projectAdminRoleID}, 204, nil)
	projectAdminCookie := loginCookie(t, handler, "exempt-project-admin@example.com", "correcthorse")

	// A Project Admin (even with manageProject, which gates the rest of
	// this same endpoint) cannot set the exemption.
	callAs(t, handler, projectAdminCookie, "PATCH", "/api/v1/projects/"+projectKey,
		jmap{"autoArchiveExempt": true}, 403, nil)

	var got jmap
	callAs(t, handler, admin, "GET", "/api/v1/projects/"+projectKey, nil, 200, &got)
	if got["autoArchiveExempt"] != false {
		t.Errorf("autoArchiveExempt after rejected PATCH = %v, want unchanged false", got["autoArchiveExempt"])
	}

	// A Tenant Admin can.
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"autoArchiveExempt": true}, 200, &got)
	if got["autoArchiveExempt"] != true {
		t.Errorf("autoArchiveExempt after Tenant Admin PATCH = %v, want true", got["autoArchiveExempt"])
	}
}

func TestScenario_DeleteProjectOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct {
		ID  string
		Key string
	}
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Legacy QA"}, 201, &p)
	call(t, h, "PATCH", "/api/v1/projects/"+p.Key, jmap{"archived": true}, 200, nil)

	call(t, h, "DELETE", "/api/v1/projects/"+p.Key, nil, 202, nil)

	var list []struct{ ID string }
	call(t, h, "GET", "/api/v1/projects", nil, 200, &list)
	for _, lp := range list {
		if lp.ID == p.ID {
			t.Errorf("project %s still listed immediately after DELETE (202 should hide it right away)", p.ID)
		}
	}
}

func TestScenario_DeleteActiveProjectIsRejected(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Still Active"}, 201, &p)

	var errBody jmap
	call(t, h, "DELETE", "/api/v1/projects/"+p.Key, nil, 400, &errBody)
}

func TestScenario_DeleteProjectRequiresProjectDeletePermission(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	projectAdminRoleID := roleIDByName(t, handler, admin, "Project Admin")

	// A hand-rolled role with manageProject but not projectDelete, to prove
	// the two flags are genuinely independent (design.md D3).
	var managerRole jmap
	callAs(t, handler, admin, "POST", "/api/v1/roles", jmap{"name": "Archiver Only", "canRead": true, "canManageProject": true}, 201, &managerRole)
	managerRoleID, _ := managerRole["id"].(string)

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var manager jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "archiver-only@example.com", "password": "correcthorse"}, 201, &manager)
	managerID, _ := manager["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+managerID,
		jmap{"roleId": managerRoleID}, 204, nil)
	managerCookie := loginCookie(t, handler, "archiver-only@example.com", "correcthorse")

	var projectAdmin jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "project-deleter@example.com", "password": "correcthorse"}, 201, &projectAdmin)
	projectAdminID, _ := projectAdmin["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+projectAdminID,
		jmap{"roleId": projectAdminRoleID}, 204, nil)
	projectAdminCookie := loginCookie(t, handler, "project-deleter@example.com", "correcthorse")

	// Manager can archive (manageProject) but not delete (no projectDelete).
	callAs(t, handler, managerCookie, "PATCH", "/api/v1/projects/"+projectKey, jmap{"archived": true}, 200, nil)
	callAs(t, handler, managerCookie, "DELETE", "/api/v1/projects/"+projectKey, nil, 403, nil)

	// Project Admin has projectDelete.
	callAs(t, handler, projectAdminCookie, "DELETE", "/api/v1/projects/"+projectKey, nil, 202, nil)
}
