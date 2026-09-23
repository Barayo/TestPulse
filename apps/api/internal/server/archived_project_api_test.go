package server_test

import (
	"fmt"
	"testing"
)

// HTTP-level scenarios for enforce-archived-project-readonly —
// openspec/changes/enforce-archived-project-readonly/specs/test-authoring/spec.md
// and specs/project-membership/spec.md.

func TestScenario_ArchivedProjectRejectsMutationsWith409(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin-archived-writes@example.com", "correcthorse")
	admin := loginCookie(t, h, "admin-archived-writes@example.com", "correcthorse")
	testerRoleID := roleIDByName(t, h, admin, "Tester")

	var p, c, run struct{ Key string }
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "Archived Writes QA"}, 201, &p)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	var items struct {
		Items []struct{ ID string }
	}
	callAs(t, h, admin, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	itemID := items.Items[0].ID

	var user jmap
	callAs(t, h, admin, "POST", "/api/v1/users", jmap{"email": "archived-member@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)

	callAs(t, h, admin, "PATCH", "/api/v1/projects/"+p.Key, jmap{"archived": true}, 200, nil)

	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "two"}, 409, nil)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), jmap{"name": "Smoke"}, 409, nil)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 2"}, 409, nil)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), jmap{"name": "Regression"}, 409, nil)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.1"}, 409, nil)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", p.Key), jmap{"title": "Req 1"}, 409, nil)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/custom-fields", p.Key), jmap{"name": "Env", "type": "text"}, 409, nil)
	callAs(t, h, admin, "PUT", "/api/v1/cases/"+c.Key, jmap{"title": "renamed"}, 409, nil)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), jmap{"caseKey": c.Key}, 409, nil)
	callAs(t, h, admin, "POST", fmt.Sprintf("/api/v1/items/%s/results", itemID), jmap{"actor": "ana", "verdict": "pass"}, 409, nil)
	callAs(t, h, admin, "PUT", fmt.Sprintf("/api/v1/items/%s/status", itemID), jmap{"status": "retest"}, 409, nil)
	callAs(t, h, admin, "PUT", "/api/v1/projects/"+p.Key+"/members/"+userID, jmap{"roleId": testerRoleID}, 409, nil)
}

func TestScenario_ArchivedProjectStillAllowsReadsAndUnarchive(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Archived Reads QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)

	call(t, h, "PATCH", "/api/v1/projects/"+p.Key, jmap{"archived": true}, 200, nil)

	call(t, h, "GET", "/api/v1/projects/"+p.Key, nil, 200, nil)
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), nil, 200, nil)
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), nil, 200, nil)
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), nil, 200, nil)

	// Unarchiving alone must still succeed while archived.
	call(t, h, "PATCH", "/api/v1/projects/"+p.Key, jmap{"archived": false}, 200, nil)

	// And with the project active again, writes succeed normally.
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "two"}, 201, nil)
}

func TestScenario_ArchivedProjectRejectsBundledUnarchiveUpdate(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Archived Bundle QA"}, 201, &p)
	call(t, h, "PATCH", "/api/v1/projects/"+p.Key, jmap{"archived": true}, 200, nil)

	// Unarchiving bundled with any other field change is rejected — the
	// only permitted write on an archived project is a bare unarchive.
	call(t, h, "PATCH", "/api/v1/projects/"+p.Key, jmap{"archived": false, "name": "Renamed"}, 409, nil)

	// A non-unarchive update on an archived project is rejected too.
	call(t, h, "PATCH", "/api/v1/projects/"+p.Key, jmap{"name": "Still Archived"}, 409, nil)
}
