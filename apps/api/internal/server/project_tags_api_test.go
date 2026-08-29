package server_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// HTTP-level scenarios for add-project-tags: shared vocabulary, per-project
// assignment at the same permission bar as favoriting, and tag state
// surfaced in the summaries response — mirrors project_enrichment_api_test.go's
// favorites coverage.

func TestScenario_AssignAndRemoveProjectTagOverHTTP(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	callAs(t, h, adminCookie, "PUT", "/api/v1/projects/"+projectKey+"/tags/mobile", nil, 204, nil)

	var summaries []jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/projects/summaries", nil, 200, &summaries)
	if len(summaries) != 1 {
		t.Fatalf("summaries = %+v", summaries)
	}
	tags, _ := summaries[0]["tags"].([]any)
	if len(tags) != 1 || tags[0] != "mobile" {
		t.Errorf("tags after assign = %+v, want [mobile]", tags)
	}

	callAs(t, h, adminCookie, "DELETE", "/api/v1/projects/"+projectKey+"/tags/mobile", nil, 204, nil)
	callAs(t, h, adminCookie, "GET", "/api/v1/projects/summaries", nil, 200, &summaries)
	tags, _ = summaries[0]["tags"].([]any)
	if len(tags) != 0 {
		t.Errorf("tags after remove = %+v, want empty", tags)
	}
}

func TestScenario_AssigningReusesExistingVocabularyEntry(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p1 jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "First"}, 201, &p1)
	var p2 jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "Second"}, 201, &p2)

	callAs(t, h, adminCookie, "PUT", "/api/v1/projects/"+p1["key"].(string)+"/tags/Mobile", nil, 204, nil)
	callAs(t, h, adminCookie, "PUT", "/api/v1/projects/"+p2["key"].(string)+"/tags/mobile", nil, 204, nil)

	var names []string
	callAs(t, h, adminCookie, "GET", "/api/v1/tags", nil, 200, &names)
	if len(names) != 1 || names[0] != "mobile" {
		t.Errorf("GET /tags = %v, want exactly one shared entry", names)
	}
}

func TestScenario_TagWithoutPermissionForbidden(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var outsider jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "outsider@example.com", "password": "correcthorse"}, 201, &outsider)
	outsiderCookie := loginCookie(t, handler, "outsider@example.com", "correcthorse")

	callAs(t, handler, outsiderCookie, "PUT", "/api/v1/projects/"+projectKey+"/tags/mobile", nil, 403, nil)
}

func TestScenario_MemberWithReadCanTagProject(t *testing.T) {
	h, svc := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)
	projectKey, _ := p["key"].(string)

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "member@example.com", "password": "correcthorse"}, 201, &member)
	memberID, _ := member["id"].(string)
	memberCookie := loginCookie(t, h, "member@example.com", "correcthorse")

	adminActor := domain.Actor{IsTenantAdmin: true}
	roles, err := svc.ListRoles(context.Background())
	if err != nil {
		t.Fatalf("ListRoles: %v", err)
	}
	var testerRoleID string
	for _, r := range roles {
		if r.Name == "Tester" {
			testerRoleID = r.ID
		}
	}
	if testerRoleID == "" {
		t.Fatalf("no seeded Tester role found in %+v", roles)
	}
	if err := svc.SetProjectMember(context.Background(), adminActor, projectID, memberID, testerRoleID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}

	callAs(t, h, memberCookie, "PUT", "/api/v1/projects/"+projectKey+"/tags/mobile", nil, 204, nil)
}

func TestScenario_TagUnknownProjectNotFound(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	callAs(t, h, adminCookie, "PUT", "/api/v1/projects/NOPE/tags/mobile", nil, 404, nil)
}
