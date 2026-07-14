package server_test

import (
	"testing"
)

// HTTP-level scenarios for enrich-project-list: description/ownerId on
// projects, and per-user favorites folded into the summaries response.

func TestScenario_ProjectDescriptionAndOwnerOptionalAtCreate(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	// "Description and owner are optional" scenario: name only.
	var bare jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "Bare"}, 201, &bare)
	if bare["description"] != "" {
		t.Errorf("description = %v, want empty", bare["description"])
	}
	if bare["ownerId"] != nil {
		t.Errorf("ownerId = %v, want nil", bare["ownerId"])
	}

	// "Create a project" with description + owner set at creation.
	var owner jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "owner@example.com", "password": "correcthorse", "role": "member"}, 201, &owner)
	ownerID, _ := owner["id"].(string)

	var full jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects",
		jmap{"name": "Full", "description": "a real project", "ownerId": ownerID}, 201, &full)
	if full["description"] != "a real project" {
		t.Errorf("description = %v, want %q", full["description"], "a real project")
	}
	if full["ownerId"] != ownerID {
		t.Errorf("ownerId = %v, want %q", full["ownerId"], ownerID)
	}
}

func TestScenario_ProjectDescriptionAndOwnerSetLater(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var owner jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "later-owner@example.com", "password": "correcthorse", "role": "member"}, 201, &owner)
	ownerID, _ := owner["id"].(string)

	var updated jmap
	callAs(t, h, adminCookie, "PATCH", "/api/v1/projects/"+projectID,
		jmap{"description": "added afterwards", "ownerId": ownerID}, 200, &updated)
	if updated["description"] != "added afterwards" {
		t.Errorf("description = %v", updated["description"])
	}
	if updated["ownerId"] != ownerID {
		t.Errorf("ownerId = %v, want %q", updated["ownerId"], ownerID)
	}

	var got jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/projects/"+projectID, nil, 200, &got)
	if got["description"] != "added afterwards" || got["ownerId"] != ownerID {
		t.Errorf("GET after update = %+v", got)
	}
}

func TestScenario_UnknownOwnerIDRejected(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var errBody jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects",
		jmap{"name": "QA", "ownerId": "00000000-0000-0000-0000-000000000000"}, 400, &errBody)
	if errBody["error"] == "" || errBody["error"] == nil {
		t.Errorf("expected validation error body, got %+v", errBody)
	}
}

func TestScenario_OwnerStillShownAfterDeactivation(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var owner jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "soon-deactivated@example.com", "password": "correcthorse", "role": "member"}, 201, &owner)
	ownerID, _ := owner["id"].(string)

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects",
		jmap{"name": "QA", "ownerId": ownerID}, 201, &p)
	projectID, _ := p["id"].(string)

	callAs(t, h, adminCookie, "PATCH", "/api/v1/users/"+ownerID, jmap{"deactivate": true}, 204, nil)

	var got jmap
	callAs(t, h, adminCookie, "GET", "/api/v1/projects/"+projectID, nil, 200, &got)
	if got["ownerId"] != ownerID {
		t.Errorf("ownerId after deactivation = %v, want %q still shown", got["ownerId"], ownerID)
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
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	adminCookie := loginCookie(t, h, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)

	var member jmap
	callAs(t, h, adminCookie, "POST", "/api/v1/users",
		jmap{"email": "member@example.com", "password": "correcthorse", "role": "member"}, 201, &member)
	memberCookie := loginCookie(t, h, "member@example.com", "correcthorse")

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
