package server_test

import (
	"testing"
)

// HTTP-level scenarios for add-run-notifications —
// openspec/changes/add-run-notifications/specs/run-notifications/spec.md.

func TestScenario_ListWebhookDestinationsRequiresManageProject(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "webhook-admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "webhook-admin@example.com", "correcthorse")
	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "Webhooks"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "webhook-tester@example.com", "password": "correcthorse"}, 201, &member)
	userID, _ := member["id"].(string)
	testerRoleID := roleIDByName(t, h, adminCookie, "Tester")
	callAs(t, h, adminCookie, "PUT", "/api/v1/projects/"+projectKey+"/members/"+userID,
		jmap{"roleId": testerRoleID}, 204, nil)
	testerCookie := loginCookie(t, h, "webhook-tester@example.com", "correcthorse")

	callAs(t, h, testerCookie, "GET", "/api/v1/projects/"+projectKey+"/webhooks", nil, 403, nil)
}

func TestScenario_AddAndRemoveWebhookDestination(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "webhook-admin2@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "webhook-admin2@example.com", "correcthorse")
	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "Webhooks"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var dest jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects/"+projectKey+"/webhooks",
		jmap{"url": "https://hooks.slack.com/services/T00/B00/xyz"}, 201, &dest)
	destID, _ := dest["id"].(string)
	if destID == "" {
		t.Fatalf("created destination has no id: %+v", dest)
	}

	var list []jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/projects/"+projectKey+"/webhooks", nil, 200, &list)
	if len(list) != 1 || list[0]["id"] != destID {
		t.Fatalf("list = %+v, want exactly the created destination", list)
	}

	callAs(t, h, adminCookie, "DELETE", "/api/v1/webhooks/"+destID, nil, 204, nil)

	callAs(t, h, adminCookie, "GET", "/api/v1/projects/"+projectKey+"/webhooks", nil, 200, &list)
	if len(list) != 0 {
		t.Fatalf("list after delete = %+v, want empty", list)
	}
}

func TestScenario_AddWebhookDestinationRejectsUnsafeURL(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "webhook-admin3@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "webhook-admin3@example.com", "correcthorse")
	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "Webhooks"}, 201, &p)
	projectKey, _ := p["key"].(string)

	callAs(t, h, adminCookie, "POST", "/api/v1/projects/"+projectKey+"/webhooks",
		jmap{"url": "http://example.com/not-https"}, 400, nil)
	callAs(t, h, adminCookie, "POST", "/api/v1/projects/"+projectKey+"/webhooks",
		jmap{"url": "https://localhost/hooks"}, 400, nil)
}
