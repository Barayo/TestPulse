package server_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// HTTP-level scenarios for enrich-project-list: description on projects,
// and per-user favorites folded into the summaries response. The owner
// concept (ownerId) was removed by add-project-rbac — project access is
// now entirely determined by membership, not a single nominal owner.

func TestScenario_ProjectDescriptionOptionalAtCreate(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var bare jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "Bare"}, 201, &bare)
	if bare["description"] != "" {
		t.Errorf("description = %v, want empty", bare["description"])
	}

	var full jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects",
		jmap{"name": "Full", "description": "a real project"}, 201, &full)
	if full["description"] != "a real project" {
		t.Errorf("description = %v, want %q", full["description"], "a real project")
	}
}

func TestScenario_ProjectDescriptionSetLater(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var updated jmap
	callAs(t, h, adminCookie, "PATCH", "/api/v1/projects/"+projectID,
		jmap{"description": "added afterwards"}, 200, &updated)
	if updated["description"] != "added afterwards" {
		t.Errorf("description = %v", updated["description"])
	}

	var got jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/projects/"+projectID, nil, 200, &got)
	if got["description"] != "added afterwards" {
		t.Errorf("GET after update = %+v", got)
	}
}

func TestScenario_StarAndUnstarProjectOverHTTP(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	callAs(t, h, adminCookie, "POST", "/api/v1/projects/"+projectID+"/favorite", nil, 204, nil)

	var summaries []jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/projects/summaries", nil, 200, &summaries)
	if len(summaries) != 1 || summaries[0]["isFavorite"] != true {
		t.Errorf("summaries after star = %+v", summaries)
	}

	callAs(t, h, adminCookie, "DELETE", "/api/v1/projects/"+projectID+"/favorite", nil, 204, nil)
	callAs(t, h, adminCookie, "GET", "/api/v1/projects/summaries", nil, 200, &summaries)
	if len(summaries) != 1 || summaries[0]["isFavorite"] != false {
		t.Errorf("summaries after unstar = %+v", summaries)
	}
}

func TestScenario_FavoritesAreNotSharedAcrossUsers(t *testing.T) {
	h, svc := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "member@example.com", "password": "correcthorse"}, 201, &member)
	memberID, _ := member["id"].(string)
	memberCookie := loginCookie(t, h, "member@example.com", "correcthorse")

	// Grant the member Tester access — without any project membership the
	// project wouldn't appear in their summaries at all (add-project-rbac
	// design.md D6), which would defeat the point of this scenario.
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

	callAs(t, h, adminCookie, "POST", "/api/v1/projects/"+projectID+"/favorite", nil, 204, nil)

	var memberSummaries []jmap
	callAs(t, h, memberCookie, "GET", "/api/v1/projects/summaries", nil, 200, &memberSummaries)
	if len(memberSummaries) != 1 || memberSummaries[0]["isFavorite"] != false {
		t.Errorf("member summaries = %+v, want isFavorite false (admin's star shouldn't leak)", memberSummaries)
	}
}

func TestScenario_StarUnknownProjectNotFound(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	missing := "00000000-0000-0000-0000-000000000000"
	callAs(t, h, adminCookie, "POST", "/api/v1/projects/"+missing+"/favorite", nil, 404, nil)
}
