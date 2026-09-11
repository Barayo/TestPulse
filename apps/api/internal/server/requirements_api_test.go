package server_test

import (
	"fmt"
	"testing"
)

// API integration tests for add-requirements-traceability: Requirement CRUD,
// case linking, and the Release-scoped coverage matrix.

func TestScenario_CreateRequirementOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var req struct {
		Key, Name, ExternalRef string
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", p.Key),
		jmap{"name": "Guest checkout", "externalRef": "JIRA-1"}, 201, &req)
	if req.Key == "" || req.Name != "Guest checkout" || req.ExternalRef != "JIRA-1" {
		t.Errorf("created requirement = %+v, want key set, name Guest checkout, externalRef JIRA-1", req)
	}

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", p.Key), jmap{}, 400, nil)
}

func TestScenario_ListRequirementsOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", p.Key), jmap{"name": "Guest checkout"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", p.Key), jmap{"name": "Saved-card checkout"}, 201, nil)

	var all []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/requirements", p.Key), nil, 200, &all)
	if len(all) != 2 {
		t.Fatalf("requirements = %d, want 2", len(all))
	}
}

func TestScenario_UpdateAndDeleteRequirementOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var req struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", p.Key), jmap{"name": "Guest checkout"}, 201, &req)

	var updated struct{ Name string }
	call(t, h, "PUT", "/api/v1/requirements/"+req.Key, jmap{"name": "Guest checkout v2"}, 200, &updated)
	if updated.Name != "Guest checkout v2" {
		t.Errorf("Name after update = %q, want Guest checkout v2", updated.Name)
	}

	call(t, h, "DELETE", "/api/v1/requirements/"+req.Key, nil, 204, nil)
	call(t, h, "GET", "/api/v1/requirements/"+req.Key, nil, 404, nil)
}

func TestScenario_DeleteRequirementRejectedWithLinkedCasesOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var req struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", p.Key), jmap{"name": "Guest checkout"}, 201, &req)
	var c struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "case one"}, 201, &c)

	call(t, h, "PUT", fmt.Sprintf("/api/v1/requirements/%s/cases/%s", req.Key, c.Key), nil, 204, nil)
	call(t, h, "DELETE", "/api/v1/requirements/"+req.Key, nil, 409, nil)
}

func TestScenario_LinkAndUnlinkRequirementCaseOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var req struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", p.Key), jmap{"name": "Guest checkout"}, 201, &req)
	var c struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "case one"}, 201, &c)

	call(t, h, "PUT", fmt.Sprintf("/api/v1/requirements/%s/cases/%s", req.Key, c.Key), nil, 204, nil)

	var got struct {
		CaseIds []string `json:"caseIds"`
	}
	call(t, h, "GET", "/api/v1/requirements/"+req.Key, nil, 200, &got)
	if len(got.CaseIds) != 1 {
		t.Fatalf("caseIds after link = %v, want 1 entry", got.CaseIds)
	}

	call(t, h, "DELETE", fmt.Sprintf("/api/v1/requirements/%s/cases/%s", req.Key, c.Key), nil, 204, nil)
	call(t, h, "GET", "/api/v1/requirements/"+req.Key, nil, 200, &got)
	if len(got.CaseIds) != 0 {
		t.Errorf("caseIds after unlink = %v, want empty", got.CaseIds)
	}
}

func TestScenario_ReleaseRequirementsCoverageOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var rel struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.1"}, 201, &rel)
	var plan struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/releases/%s/plans", rel.Key), jmap{"name": "iOS"}, 201, &plan)
	var req struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", p.Key), jmap{"name": "Guest checkout"}, 201, &req)
	var c struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "case one"}, 201, &c)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/requirements/%s/cases/%s", req.Key, c.Key), nil, 204, nil)

	var beforeRun []jmap
	call(t, h, "GET", "/api/v1/releases/"+rel.Key+"/requirements-coverage", nil, 200, &beforeRun)
	if len(beforeRun) != 1 || beforeRun[0]["status"] != "notRun" {
		t.Errorf("coverage before any run = %+v, want one notRun entry", beforeRun)
	}

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "smoke", "testPlanKey": plan.Key, "caseKeys": []string{c.Key}}, 201, &run)
	var itemsPage struct {
		Items []jmap `json:"items"`
	}
	call(t, h, "GET", "/api/v1/runs/"+run.Key+"/items", nil, 200, &itemsPage)
	itemID, _ := itemsPage.Items[0]["id"].(string)
	call(t, h, "PUT", "/api/v1/items/"+itemID+"/status", jmap{"status": "pass"}, 204, nil)

	var afterRun []jmap
	call(t, h, "GET", "/api/v1/releases/"+rel.Key+"/requirements-coverage", nil, 200, &afterRun)
	if len(afterRun) != 1 || afterRun[0]["status"] != "covered" {
		t.Errorf("coverage after pass = %+v, want one covered entry", afterRun)
	}
}

// TestScenario_RequirementWriteRequiresManageProjectOverHTTP covers a role
// without manageProject (Tester) getting 403 on create/edit/delete/link,
// mirroring TestScenario_CreateReleaseRequiresManageProjectOverHTTP's
// pattern exactly.
func TestScenario_RequirementWriteRequiresManageProjectOverHTTP(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	testerRoleID := roleIDByName(t, handler, admin, "Tester")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "tester-requirement@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+userID,
		jmap{"roleId": testerRoleID}, 204, nil)
	testerCookie := loginCookie(t, handler, "tester-requirement@example.com", "correcthorse")

	callAs(t, handler, testerCookie, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", projectKey),
		jmap{"name": "Guest checkout"}, 403, nil)

	var req jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/requirements", projectKey),
		jmap{"name": "Guest checkout"}, 201, &req)
	requirementKey, _ := req["key"].(string)

	var c jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", projectKey), jmap{"title": "case one"}, 201, &c)
	caseKey, _ := c["key"].(string)

	// A Tester can read the requirement (has `read`) but not edit, delete,
	// or link/unlink cases.
	callAs(t, handler, testerCookie, "GET", "/api/v1/requirements/"+requirementKey, nil, 200, nil)
	callAs(t, handler, testerCookie, "PUT", "/api/v1/requirements/"+requirementKey, jmap{"name": "renamed"}, 403, nil)
	callAs(t, handler, testerCookie, "PUT", fmt.Sprintf("/api/v1/requirements/%s/cases/%s", requirementKey, caseKey), nil, 403, nil)
	callAs(t, handler, testerCookie, "DELETE", "/api/v1/requirements/"+requirementKey, nil, 403, nil)
}
