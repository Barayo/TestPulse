package server_test

import (
	"testing"
)

// Integration test for restrict-run-item-status-to-assignee's project
// setting, at the HTTP layer — catches wiring gaps between the OpenAPI
// contract and the handler's own request-decoding struct that a
// service-layer-only test wouldn't (the handler manually maps decoded JSON
// fields into service.ProjectUpdate; the field must be added there too).
func TestPatchProjectSetsAssigneeRestrictedRecording(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Owned Items"}, 201, &p)
	projectKey, _ := p["key"].(string)
	if p["assigneeRestrictedRecording"] != false {
		t.Fatalf("assigneeRestrictedRecording on create = %v, want false", p["assigneeRestrictedRecording"])
	}

	var got jmap
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"assigneeRestrictedRecording": true}, 200, &got)
	if got["assigneeRestrictedRecording"] != true {
		t.Errorf("assigneeRestrictedRecording after PATCH = %v, want true", got["assigneeRestrictedRecording"])
	}
}
