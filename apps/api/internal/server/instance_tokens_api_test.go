package server_test

import "testing"

// HTTP-level scenarios for add-instance-token-listing —
// openspec/changes/archive/add-instance-token-listing/specs/.

func TestScenario_ListInstanceTokensOverHTTP(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, h, "admin@example.com", "correcthorse")

	var other jmap
	callAs(t, h, admin, "POST", "/api/v1/users", jmap{"email": "instance-tokens-other@example.com", "password": "correcthorse1"}, 201, &other)
	otherCookie := loginCookie(t, h, "instance-tokens-other@example.com", "correcthorse1")

	callAs(t, h, admin, "POST", "/api/v1/tokens", jmap{"name": "admin-agent"}, 201, nil)
	callAs(t, h, otherCookie, "POST", "/api/v1/tokens", jmap{"name": "other-agent"}, 201, nil)

	var page jmap
	callAs(t, h, admin, "GET", "/api/v1/tokens/instance", nil, 200, &page)
	items, _ := page["items"].([]any)
	if len(items) != 2 {
		t.Fatalf("items = %+v, want 2 (both users' tokens)", page["items"])
	}
	owners := map[string]bool{}
	for _, raw := range items {
		item, _ := raw.(map[string]any)
		email, _ := item["ownerEmail"].(string)
		owners[email] = true
	}
	if !owners["admin@example.com"] || !owners["instance-tokens-other@example.com"] {
		t.Errorf("owners = %+v, want both admin@example.com and instance-tokens-other@example.com", owners)
	}
}

func TestScenario_ListInstanceTokensRejectsNonTenantAdmin(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, h, "admin@example.com", "correcthorse")

	var other jmap
	callAs(t, h, admin, "POST", "/api/v1/users", jmap{"email": "instance-tokens-nonadmin@example.com", "password": "correcthorse1"}, 201, &other)
	otherCookie := loginCookie(t, h, "instance-tokens-nonadmin@example.com", "correcthorse1")

	var errBody jmap
	callAs(t, h, otherCookie, "GET", "/api/v1/tokens/instance", nil, 403, &errBody)
}

func TestScenario_ListInstanceTokensRequiresAuthentication(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")

	call(t, h, "GET", "/api/v1/tokens/instance", nil, 401, nil)
}
