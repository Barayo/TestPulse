package server_test

import (
	"fmt"
	"testing"
)

// HTTP-level scenarios for add-run-lifecycle-status —
// openspec/changes/add-run-lifecycle-status/specs/test-execution/spec.md.

func TestScenario_NewRunStartsOpenAndCanBeClosed(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)

	var run struct {
		Key    string
		Status string
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	if run.Status != "open" {
		t.Fatalf("new run status = %q, want open", run.Status)
	}

	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", run.Key), nil, 204, nil)

	var got struct{ Status string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s", run.Key), nil, 200, &got)
	if got.Status != "closed" {
		t.Fatalf("status after close = %q, want closed", got.Status)
	}
}

func TestScenario_ClosedRunRejectsMutationsWith409(t *testing.T) {
	h := apiServer(t)
	var p, c, c2 struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "two"}, 201, &c2)

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	var items struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	itemID := items.Items[0].ID

	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", run.Key), nil, 204, nil)

	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), jmap{"caseKey": c2.Key}, 409, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", itemID), jmap{"actor": "ana", "verdict": "pass"}, 409, nil)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/items/%s/status", itemID), jmap{"status": "retest"}, 409, nil)
}

func TestScenario_ReopenRequiresManageProject(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	contributorRoleID := roleIDByName(t, handler, admin, "Contributor")
	projectAdminRoleID := roleIDByName(t, handler, admin, "Project Admin")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var contributor jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "contributor@example.com", "password": "correcthorse"}, 201, &contributor)
	contributorID, _ := contributor["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+contributorID,
		jmap{"roleId": contributorRoleID}, 204, nil)
	contributorCookie := loginCookie(t, handler, "contributor@example.com", "correcthorse")

	var projectAdmin jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "projectadmin@example.com", "password": "correcthorse"}, 201, &projectAdmin)
	projectAdminID, _ := projectAdmin["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+projectAdminID,
		jmap{"roleId": projectAdminRoleID}, 204, nil)
	projectAdminCookie := loginCookie(t, handler, "projectadmin@example.com", "correcthorse")

	var run jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/runs", jmap{"name": "sprint 1"}, 201, &run)
	runKey, _ := run["key"].(string)

	// Contributor (runRecordResult, no manageProject) can close but not reopen.
	callAs(t, handler, contributorCookie, "POST", "/api/v1/runs/"+runKey+"/close", nil, 204, nil)
	var errBody jmap
	callAs(t, handler, contributorCookie, "POST", "/api/v1/runs/"+runKey+"/reopen", nil, 403, &errBody)

	// Project Admin (has manageProject) can reopen.
	callAs(t, handler, projectAdminCookie, "POST", "/api/v1/runs/"+runKey+"/reopen", nil, 204, nil)

	var got jmap
	callAs(t, handler, admin, "GET", "/api/v1/runs/"+runKey, nil, 200, &got)
	if got["status"] != "open" {
		t.Errorf("status after reopen = %v, want open", got["status"])
	}
}
