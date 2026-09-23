package server_test

import "testing"

// Integration tests for project-activity-feed's project-scoped audit
// endpoint, backing the dashboard Activity panel.

func TestScenario_ProjectActivityRequiresReadPermission(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "Activity QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var entries []jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/projects/"+projectKey+"/audit", nil, 200, &entries)
	if len(entries) == 0 {
		t.Errorf("expected at least the project-creation entry, got %+v", entries)
	}

	var outsider jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "outsider-activity@example.com", "password": "correcthorse"}, 201, &outsider)
	outsiderCookie := loginCookie(t, h, "outsider-activity@example.com", "correcthorse")

	callAs(t, h, outsiderCookie, "GET", "/api/v1/projects/"+projectKey+"/audit", nil, 403, nil)
}

func TestScenario_ProjectActivityPublicReadsGatedByPublicAccess(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "Public Activity"}, 201, &p)
	projectKey, _ := p["key"].(string)

	callAs(t, h, "", "GET", "/api/v1/public/projects/"+projectKey+"/audit", nil, 404, nil)

	callAs(t, h, adminCookie, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)

	var entries []jmap
	callAs(t, h, "", "GET", "/api/v1/public/projects/"+projectKey+"/audit", nil, 200, &entries)
	if len(entries) == 0 {
		t.Errorf("expected at least the project-creation entry, got %+v", entries)
	}
}
