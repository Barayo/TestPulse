package server_test

import (
	"fmt"
	"testing"
)

// add-reusable-steps: HTTP-level coverage for the step-groups CRUD
// surface — list/get require read, write (create/update/delete) requires
// manageProject, and delete is a soft delete.

func TestScenario_StepGroupsCRUDOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Step Groups"}, 201, &p)

	var created struct {
		ID    string
		Key   string
		Name  string
		Steps []jmap
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/step-groups", p.Key),
		jmap{"name": "Log in as admin", "steps": []jmap{
			{"action": "open login page"},
			{"action": "enter admin credentials"},
			{"action": "click login", "expected": "dashboard is shown"},
		}}, 201, &created)
	if created.Name != "Log in as admin" {
		t.Fatalf("created = %+v", created)
	}
	if len(created.Steps) != 3 {
		t.Fatalf("Steps = %d, want 3", len(created.Steps))
	}
	if created.Key == "" {
		t.Error("Key = empty, want set")
	}

	var got struct{ Name string }
	call(t, h, "GET", "/api/v1/step-groups/"+created.ID, nil, 200, &got)
	if got.Name != "Log in as admin" {
		t.Fatalf("got = %+v", got)
	}

	var groups []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/step-groups", p.Key), nil, 200, &groups)
	if len(groups) != 1 {
		t.Fatalf("groups = %+v, want 1", groups)
	}

	var updated struct {
		Name  string
		Steps []jmap
	}
	call(t, h, "PUT", "/api/v1/step-groups/"+created.ID,
		jmap{"name": "Log in as admin (updated)", "steps": []jmap{{"action": "x"}}}, 200, &updated)
	if updated.Name != "Log in as admin (updated)" || len(updated.Steps) != 1 {
		t.Fatalf("updated = %+v", updated)
	}

	call(t, h, "DELETE", "/api/v1/step-groups/"+created.ID, nil, 204, nil)

	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/step-groups", p.Key), nil, 200, &groups)
	if len(groups) != 0 {
		t.Fatalf("groups after delete = %+v, want empty", groups)
	}
}

func TestScenario_StepGroupWriteRequiresManageProjectReadDoesNot(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	contributorRoleID := roleIDByName(t, handler, admin, "Contributor")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var group jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/step-groups", projectKey),
		jmap{"name": "Log in as admin", "steps": []jmap{{"action": "a"}}}, 201, &group)
	groupID, _ := group["id"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "contributor@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+userID,
		jmap{"roleId": contributorRoleID}, 204, nil)
	contributorCookie := loginCookie(t, handler, "contributor@example.com", "correcthorse")

	// Read: granted to a Contributor (has read, not manageProject).
	callAs(t, handler, contributorCookie, "GET", fmt.Sprintf("/api/v1/projects/%s/step-groups", projectKey), nil, 200, nil)
	callAs(t, handler, contributorCookie, "GET", "/api/v1/step-groups/"+groupID, nil, 200, nil)

	// Write: rejected for a Contributor (lacks manageProject).
	var errBody jmap
	callAs(t, handler, contributorCookie, "POST", fmt.Sprintf("/api/v1/projects/%s/step-groups", projectKey),
		jmap{"name": "Sneaky", "steps": []jmap{{"action": "a"}}}, 403, &errBody)
	callAs(t, handler, contributorCookie, "PUT", "/api/v1/step-groups/"+groupID,
		jmap{"name": "Renamed", "steps": []jmap{{"action": "a"}}}, 403, &errBody)
	callAs(t, handler, contributorCookie, "DELETE", "/api/v1/step-groups/"+groupID, nil, 403, &errBody)
}

func TestScenario_CaseReferencingStepGroupOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Ref Over HTTP"}, 201, &p)

	var group struct {
		ID  string
		Key string
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/step-groups", p.Key),
		jmap{"name": "Log in as admin", "steps": []jmap{
			{"action": "open login page"},
			{"action": "enter admin credentials"},
		}}, 201, &group)

	var c struct {
		Key     string
		Content struct {
			Steps []jmap
		}
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "Admin can view settings", "steps": []jmap{
			{"groupRef": jmap{"groupKey": group.Key}},
			{"action": "open settings"},
		}}, 201, &c)
	if len(c.Content.Steps) != 3 {
		t.Fatalf("Steps = %d, want 3 (2 from the group + 1 own step)", len(c.Content.Steps))
	}
	if c.Content.Steps[0]["action"] != "open login page" {
		t.Errorf("Steps[0] = %+v, want the group's first step", c.Content.Steps[0])
	}

	// Editing the source group afterward must NOT change the already-saved
	// case version's content.
	call(t, h, "PUT", "/api/v1/step-groups/"+group.ID,
		jmap{"name": "Log in as admin", "steps": []jmap{{"action": "changed step"}}}, 200, nil)

	var versions []jmap
	call(t, h, "GET", "/api/v1/cases/"+c.Key+"/versions", nil, 200, &versions)
	if len(versions) != 1 {
		t.Fatalf("versions = %+v, want 1", versions)
	}
	content, _ := versions[0]["content"].(jmap)
	steps, _ := content["steps"].([]any)
	if len(steps) != 3 {
		t.Fatalf("saved version's steps = %+v, want 3 (unchanged by the later group edit)", steps)
	}
	first, _ := steps[0].(jmap)
	if first["action"] != "open login page" {
		t.Errorf("saved version's first step = %+v, want unchanged %q", first, "open login page")
	}
}
