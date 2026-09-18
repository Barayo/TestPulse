package server_test

import (
	"testing"
)

// Integration tests for add-configurable-project-landing's settings, at the
// HTTP layer — catches wiring gaps between the OpenAPI contract and the
// handlers' own request-decoding structs that a service-layer-only test
// wouldn't (each handler manually maps decoded JSON fields into
// service.ProjectUpdate/domain.InstanceSettingsUpdate; the field must be
// added there too).
func TestPatchProjectSetsAndClearsLandingView(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Landing HTTP"}, 201, &p)
	projectKey, _ := p["key"].(string)
	if p["landingView"] != nil {
		t.Fatalf("landingView on create = %v, want nil", p["landingView"])
	}

	var got jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"landingView": "suites"}, 200, &got)
	if got["landingView"] != "suites" {
		t.Errorf("landingView after PATCH = %v, want \"suites\"", got["landingView"])
	}

	var cleared jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"clearLandingView": true}, 200, &cleared)
	if cleared["landingView"] != nil {
		t.Errorf("landingView after clearLandingView = %v, want nil", cleared["landingView"])
	}
}

func TestPatchInstanceSettingsSetsDefaultLandingView(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var got jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings", jmap{"defaultLandingView": "reports"}, 200, &got)
	if got["defaultLandingView"] != "reports" {
		t.Errorf("defaultLandingView after PATCH = %v, want \"reports\"", got["defaultLandingView"])
	}

	var meta jmap
	callAs(t, handler, "", "GET", "/api/v1/meta", nil, 200, &meta)
	if meta["defaultLandingView"] != "reports" {
		t.Errorf("meta.defaultLandingView = %v, want \"reports\"", meta["defaultLandingView"])
	}
}
