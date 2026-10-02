package server_test

import (
	"fmt"
	"testing"
)

// Integration tests for enable-public-project-access's public-project-access
// capability: an unauthenticated route group gated by both the project's own
// publicAccess flag and the instance-wide publicProjectsEnabled kill switch.

func TestPublicProject_UnauthenticatedReadsSucceedWhenPublic(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Open Book"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)

	var got jmap
	callAs(t, handler, "", "GET", "/api/v1/public/projects/"+projectKey, nil, 200, &got)
	if got["key"] != projectKey {
		t.Errorf("public project GET = %+v, want key %q", got, projectKey)
	}

	var cases struct{ Items []jmap }
	callAs(t, handler, "", "GET", "/api/v1/public/projects/"+projectKey+"/cases", nil, 200, &cases)

	var sum jmap
	callAs(t, handler, "", "GET", "/api/v1/public/projects/"+projectKey+"/runs/status-summary", nil, 200, &sum)

	var fields []jmap
	callAs(t, handler, "", "GET", "/api/v1/public/projects/"+projectKey+"/custom-fields", nil, 200, &fields)
}

func TestPublicProject_UnauthenticatedReadsRejectedWhenNotPublic(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Private Book"}, 201, &p)
	projectKey, _ := p["key"].(string)

	callAs(t, handler, "", "GET", "/api/v1/public/projects/"+projectKey, nil, 404, nil)
}

func TestPublicProject_UnknownProjectKeyRejected(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	callAs(t, handler, "", "GET", "/api/v1/public/projects/NOPE", nil, 404, nil)
}

func TestPublicProject_InstanceWideSwitchOverridesProjectFlag(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Toggled"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)
	callAs(t, handler, "", "GET", "/api/v1/public/projects/"+projectKey, nil, 200, nil)

	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings", jmap{"publicProjectsEnabled": false}, 200, nil)
	callAs(t, handler, "", "GET", "/api/v1/public/projects/"+projectKey, nil, 404, nil)

	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings", jmap{"publicProjectsEnabled": true}, 200, nil)
	callAs(t, handler, "", "GET", "/api/v1/public/projects/"+projectKey, nil, 200, nil)
}

func TestPatchInstanceSettings_RequiresTenantAdmin(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "regular@example.com", "password": "correcthorse"}, 201, &user)
	regular := loginCookie(t, handler, "regular@example.com", "correcthorse")

	callAs(t, handler, regular, "PATCH", "/api/v1/instance-settings", jmap{"publicProjectsEnabled": false}, 403, nil)
}

func TestPublicProject_MembershipAndPermissionsNeverExposed(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "No Peeking"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)

	callAs(t, handler, "", "GET", "/api/v1/public/projects/"+projectKey+"/members", nil, 404, nil)
	callAs(t, handler, "", "GET", "/api/v1/public/projects/"+projectKey+"/permissions", nil, 404, nil)
}

func TestPublicProject_WritesRejected(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Read Only"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)

	callAs(t, handler, "", "POST", "/api/v1/public/projects/"+projectKey+"/cases",
		jmap{"content": jmap{"title": "sneaky"}}, 404, nil)
	callAs(t, handler, "", "POST", "/api/v1/public/projects/"+projectKey+"/runs", jmap{"name": "sneaky"}, 404, nil)
}

// A resource keyed independently of the project URL (a suite, run, case,
// item, or attachment) must still resolve its OWN project and check that
// project's public flags — not simply trust whatever {projectKey} segment
// happens to be in the URL.
func TestPublicProject_ResourceScopedToItsOwnProjectNotURLProject(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var pub jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Public Project"}, 201, &pub)
	pubKey, _ := pub["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+pubKey, jmap{"publicAccess": true}, 200, nil)

	var priv jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Private Project"}, 201, &priv)
	privKey, _ := priv["key"].(string)
	var suite jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+privKey+"/suites", jmap{"name": "hidden suite"}, 201, &suite)
	suiteKey, _ := suite["key"].(string)

	// The suite belongs to the PRIVATE project, so it must stay hidden even
	// though a public project exists on the instance.
	callAs(t, handler, "", "GET", "/api/v1/public/suites/"+suiteKey, nil, 404, nil)
}

// TestPublicProject_CaseAttachmentsReadableWhenOwningProjectIsPublic covers
// add-case-reference-attachments design.md D7: a public project's cases'
// reference attachments are readable the same way their content/versions/
// executions already are.
func TestPublicProject_CaseAttachmentsReadableWhenOwningProjectIsPublic(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Public Attachments"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)
	var c jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", projectKey), jmap{"title": "case one"}, 201, &c)
	caseKey, _ := c["key"].(string)

	var att jmap
	uploadCaseFileAs(t, handler, admin, fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "mock.png", caseAttachmentFixture(t, "sample.png"), 201, &att)
	attachmentID, _ := att["id"].(string)

	var list []jmap
	callAs(t, handler, "", "GET", fmt.Sprintf("/api/v1/public/cases/%s/attachments", caseKey), nil, 200, &list)
	if len(list) != 1 {
		t.Fatalf("public case attachment list = %d, want 1", len(list))
	}

	callAs(t, handler, "", "GET", "/api/v1/public/case-attachments/"+attachmentID, nil, 200, nil)
}

// TestPublicProject_CaseAttachmentWritesRejected covers design.md D7: no
// upload/delete route exists on the public API regardless of project
// visibility.
func TestPublicProject_CaseAttachmentWritesRejected(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Public Attachments Write"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)
	var c jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", projectKey), jmap{"title": "case one"}, 201, &c)
	caseKey, _ := c["key"].(string)

	var errBody jmap
	uploadCaseFileAs(t, handler, "", fmt.Sprintf("/api/v1/public/cases/%s/attachments", caseKey), "mock.png", caseAttachmentFixture(t, "sample.png"), 404, &errBody)

	var att jmap
	uploadCaseFileAs(t, handler, admin, fmt.Sprintf("/api/v1/cases/%s/attachments", caseKey), "mock.png", caseAttachmentFixture(t, "sample.png"), 201, &att)
	attachmentID, _ := att["id"].(string)
	callAs(t, handler, "", "DELETE", "/api/v1/public/case-attachments/"+attachmentID, nil, 404, nil)
}

// TestListPublicProjects covers add-public-project-discovery: an
// unauthenticated GET /api/v1/public/projects returns every public
// project, an empty list when none are public, and an empty list when the
// instance-wide switch is off even with a public project present.
func TestListPublicProjects(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var empty []jmap
	callAs(t, handler, "", "GET", "/api/v1/public/projects", nil, 200, &empty)
	if len(empty) != 0 {
		t.Errorf("with no public projects, list = %+v, want empty", empty)
	}

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Discoverable"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)

	var list []jmap
	callAs(t, handler, "", "GET", "/api/v1/public/projects", nil, 200, &list)
	if len(list) != 1 || list[0]["key"] != projectKey {
		t.Errorf("list = %+v, want only %q", list, projectKey)
	}

	callAs(t, handler, admin, "PATCH", "/api/v1/instance-settings", jmap{"publicProjectsEnabled": false}, 200, nil)
	var off []jmap
	callAs(t, handler, "", "GET", "/api/v1/public/projects", nil, 200, &off)
	if len(off) != 0 {
		t.Errorf("with instance switch off, list = %+v, want empty", off)
	}
}

func TestMetaEndpoint_IncludesPublicProjectsEnabled(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")

	var meta jmap
	callAs(t, handler, "", "GET", "/api/v1/meta", nil, 200, &meta)
	enabled, ok := meta["publicProjectsEnabled"].(bool)
	if !ok || !enabled {
		t.Errorf("meta = %+v, want publicProjectsEnabled=true", meta)
	}
}

func TestPublicProject_SuiteRunCaseReadableWhenOwningProjectIsPublic(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Full Read"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)

	var c jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/cases",
		jmap{"title": "Login works", "steps": []jmap{{"action": "go", "expected": "ok"}}, "priority": "medium"}, 201, &c)
	caseKey, _ := c["key"].(string)

	var suite jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/suites", jmap{"name": "smoke"}, 201, &suite)
	suiteKey, _ := suite["key"].(string)

	var run jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/runs", jmap{"name": "r1"}, 201, &run)
	runKey, _ := run["key"].(string)

	callAs(t, handler, "", "GET", "/api/v1/public/cases/"+caseKey, nil, 200, nil)
	callAs(t, handler, "", "GET", "/api/v1/public/suites/"+suiteKey, nil, 200, nil)
	callAs(t, handler, "", "GET", "/api/v1/public/runs/"+runKey, nil, 200, nil)
}
