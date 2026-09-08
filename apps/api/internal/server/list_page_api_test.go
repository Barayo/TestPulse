package server_test

// add-cursor-pagination: HTTP-level coverage that each of the eight
// affected endpoints returns the new { items, nextCursor } envelope and
// paginates correctly end-to-end (query params -> handler -> service ->
// store -> back out over JSON).

import (
	"encoding/base64"
	"fmt"
	"testing"
)

func TestScenario_ListRunsOverHTTPReturnsPaginatedEnvelope(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Runs Page HTTP"}, 201, &p)
	var c struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "case"}, 201, &c)
	for i := 0; i < 3; i++ {
		call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
			jmap{"name": fmt.Sprintf("run %d", i), "caseKeys": []string{c.Key}}, 201, nil)
	}

	var page1 struct {
		Items      []jmap
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/runs?limit=2", p.Key), nil, 200, &page1)
	if len(page1.Items) != 2 {
		t.Fatalf("page1 items = %d, want 2", len(page1.Items))
	}
	if page1.NextCursor == nil || *page1.NextCursor == "" {
		t.Fatal("page1 nextCursor = nil/empty, want non-empty (1 more run remains)")
	}

	var page2 struct {
		Items      []jmap
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/runs?limit=2&cursor=%s", p.Key, *page1.NextCursor), nil, 200, &page2)
	if len(page2.Items) != 1 {
		t.Fatalf("page2 items = %d, want 1", len(page2.Items))
	}
	if page2.NextCursor != nil {
		t.Errorf("page2 nextCursor = %v, want nil (last page)", page2.NextCursor)
	}

	// No overlap between pages.
	seen := map[string]bool{}
	for _, it := range page1.Items {
		seen[it["id"].(string)] = true
	}
	for _, it := range page2.Items {
		if seen[it["id"].(string)] {
			t.Errorf("run %v appeared on both pages", it["id"])
		}
	}
}

func TestScenario_ListRunItemsOverHTTPReturnsPaginatedEnvelopeInInsertionOrder(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Run Items Page HTTP"}, 201, &p)
	var c1, c2, c3 struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "two"}, 201, &c2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "three"}, 201, &c3)
	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "run", "caseKeys": []string{c1.Key, c2.Key, c3.Key}}, 201, &run)

	var page1 struct {
		Items      []struct{ CaseKey string }
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items?limit=2", run.Key), nil, 200, &page1)
	if len(page1.Items) != 2 || page1.Items[0].CaseKey != c1.Key || page1.Items[1].CaseKey != c2.Key {
		t.Fatalf("page1 = %+v, want [%s, %s] (insertion order)", page1.Items, c1.Key, c2.Key)
	}
	if page1.NextCursor == nil {
		t.Fatal("page1 nextCursor = nil, want non-nil (1 more item remains)")
	}

	var page2 struct {
		Items      []struct{ CaseKey string }
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items?limit=2&cursor=%s", run.Key, *page1.NextCursor), nil, 200, &page2)
	if len(page2.Items) != 1 || page2.Items[0].CaseKey != c3.Key {
		t.Fatalf("page2 = %+v, want [%s]", page2.Items, c3.Key)
	}
	if page2.NextCursor != nil {
		t.Errorf("page2 nextCursor = %v, want nil (last page)", page2.NextCursor)
	}
}

func TestScenario_ListRunItemsJiraLinkedOverHTTPUsesSameEnvelope(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Run Items Jira Envelope"}, 201, &p)
	var c struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)
	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "run", "caseKeys": []string{c.Key}}, 201, &run)

	var resp struct {
		Items      []jmap
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items?jiraLinked=true", run.Key), nil, 200, &resp)
	if len(resp.Items) != 0 {
		t.Fatalf("items = %d, want 0 (nothing jira-linked yet)", len(resp.Items))
	}
	if resp.NextCursor != nil {
		t.Errorf("nextCursor = %v, want nil (jiraLinked is never paginated)", resp.NextCursor)
	}
}

func TestScenario_ListUsersOverHTTPReturnsPaginatedEnvelopeInInsertionOrder(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, h, "admin@example.com", "correcthorse")
	var u1, u2 struct{ ID string }
	callAs(t, h, admin, "POST", "/api/v1/users", jmap{"email": "one@example.com", "password": "correcthorse1"}, 201, &u1)
	callAs(t, h, admin, "POST", "/api/v1/users", jmap{"email": "two@example.com", "password": "correcthorse1"}, 201, &u2)

	var page1 struct {
		Items      []struct{ ID string }
		NextCursor *string
	}
	callAs(t, h, admin, "GET", "/api/v1/users?limit=2", nil, 200, &page1)
	// admin + u1 + u2 = 3 users total; first page of 2 is [admin, u1] in insertion order.
	if len(page1.Items) != 2 {
		t.Fatalf("page1 = %d items, want 2", len(page1.Items))
	}
	if page1.NextCursor == nil {
		t.Fatal("page1 nextCursor = nil, want non-nil (1 more user remains)")
	}

	var page2 struct {
		Items      []struct{ ID string }
		NextCursor *string
	}
	callAs(t, h, admin, "GET", fmt.Sprintf("/api/v1/users?limit=2&cursor=%s", *page1.NextCursor), nil, 200, &page2)
	if len(page2.Items) != 1 || page2.Items[0].ID != u2.ID {
		t.Fatalf("page2 = %+v, want exactly [%s]", page2.Items, u2.ID)
	}
	if page2.NextCursor != nil {
		t.Errorf("page2 nextCursor = %v, want nil (last page)", page2.NextCursor)
	}
}

func TestScenario_ListTeamsOverHTTPReturnsPaginatedEnvelopeInInsertionOrder(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, h, "admin@example.com", "correcthorse")
	var t1, t2 struct{ ID string }
	callAs(t, h, admin, "POST", "/api/v1/teams", jmap{"name": "Team One"}, 201, &t1)
	callAs(t, h, admin, "POST", "/api/v1/teams", jmap{"name": "Team Two"}, 201, &t2)

	var page1 struct {
		Items      []struct{ ID string }
		NextCursor *string
	}
	callAs(t, h, admin, "GET", "/api/v1/teams?limit=1", nil, 200, &page1)
	if len(page1.Items) != 1 || page1.Items[0].ID != t1.ID {
		t.Fatalf("page1 = %+v, want [%s] (insertion order)", page1.Items, t1.ID)
	}
	if page1.NextCursor == nil {
		t.Fatal("page1 nextCursor = nil, want non-nil (1 more team remains)")
	}

	var page2 struct {
		Items      []struct{ ID string }
		NextCursor *string
	}
	callAs(t, h, admin, "GET", fmt.Sprintf("/api/v1/teams?limit=1&cursor=%s", *page1.NextCursor), nil, 200, &page2)
	if len(page2.Items) != 1 || page2.Items[0].ID != t2.ID {
		t.Fatalf("page2 = %+v, want [%s]", page2.Items, t2.ID)
	}
	if page2.NextCursor != nil {
		t.Errorf("page2 nextCursor = %v, want nil (last page)", page2.NextCursor)
	}
}

func TestScenario_ListRolesOverHTTPReturnsPaginatedEnvelope(t *testing.T) {
	h, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, h, "admin@example.com", "correcthorse")

	// 4 seeded default roles always exist.
	var page1 struct {
		Items      []struct{ ID string }
		NextCursor *string
	}
	callAs(t, h, admin, "GET", "/api/v1/roles?limit=2", nil, 200, &page1)
	if len(page1.Items) != 2 {
		t.Fatalf("page1 = %d items, want 2", len(page1.Items))
	}
	if page1.NextCursor == nil {
		t.Fatal("page1 nextCursor = nil, want non-nil (2 more roles remain)")
	}

	var page2 struct {
		Items      []struct{ ID string }
		NextCursor *string
	}
	callAs(t, h, admin, "GET", fmt.Sprintf("/api/v1/roles?limit=2&cursor=%s", *page1.NextCursor), nil, 200, &page2)
	if len(page2.Items) != 2 {
		t.Fatalf("page2 = %d items, want 2", len(page2.Items))
	}
	if page2.NextCursor != nil {
		t.Errorf("page2 nextCursor = %v, want nil (last page)", page2.NextCursor)
	}
}

func TestScenario_ListCasesOverHTTPReturnsPaginatedEnvelopeInInsertionOrder(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Cases Page HTTP"}, 201, &p)
	var c1, c2, c3 struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "two"}, 201, &c2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "three"}, 201, &c3)

	var page1 struct {
		Items      []struct{ Key string }
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/cases?limit=2", p.Key), nil, 200, &page1)
	if len(page1.Items) != 2 || page1.Items[0].Key != c1.Key || page1.Items[1].Key != c2.Key {
		t.Fatalf("page1 = %+v, want [%s, %s] (insertion order)", page1.Items, c1.Key, c2.Key)
	}
	if page1.NextCursor == nil {
		t.Fatal("page1 nextCursor = nil, want non-nil (1 more case remains)")
	}

	var page2 struct {
		Items      []struct{ Key string }
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/cases?limit=2&cursor=%s", p.Key, *page1.NextCursor), nil, 200, &page2)
	if len(page2.Items) != 1 || page2.Items[0].Key != c3.Key {
		t.Fatalf("page2 = %+v, want [%s]", page2.Items, c3.Key)
	}
	if page2.NextCursor != nil {
		t.Errorf("page2 nextCursor = %v, want nil (last page)", page2.NextCursor)
	}
}

func TestScenario_ListCasesJiraLinkedOverHTTPUsesSameEnvelope(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Cases Jira Envelope"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, nil)

	var resp struct {
		Items      []jmap
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/cases?jiraLinked=true", p.Key), nil, 200, &resp)
	if len(resp.Items) != 0 {
		t.Fatalf("items = %d, want 0 (nothing jira-linked yet)", len(resp.Items))
	}
	if resp.NextCursor != nil {
		t.Errorf("nextCursor = %v, want nil (jiraLinked is never paginated)", resp.NextCursor)
	}
}

func TestScenario_ListFoldersOverHTTPReturnsPaginatedEnvelope(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Folders Page HTTP"}, 201, &p)
	var root struct {
		Items []struct{ ID string }
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), nil, 200, &root)
	if len(root.Items) != 1 {
		t.Fatalf("initial folders = %+v, want exactly the root folder", root.Items)
	}
	var f struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/folders", p.Key), jmap{"name": "Sub", "parentFolderId": root.Items[0].ID}, 201, &f)

	// root + Sub = 2 total.
	var page1 struct {
		Items      []struct{ ID string }
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders?limit=1", p.Key), nil, 200, &page1)
	if len(page1.Items) != 1 {
		t.Fatalf("page1 = %d items, want 1", len(page1.Items))
	}
	if page1.NextCursor == nil {
		t.Fatal("page1 nextCursor = nil, want non-nil (1 more folder remains)")
	}

	var page2 struct {
		Items      []struct{ ID string }
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/folders?limit=1&cursor=%s", p.Key, *page1.NextCursor), nil, 200, &page2)
	if len(page2.Items) != 1 {
		t.Fatalf("page2 = %d items, want 1", len(page2.Items))
	}
	if page2.NextCursor != nil {
		t.Errorf("page2 nextCursor = %v, want nil (last page)", page2.NextCursor)
	}
}

func TestScenario_ListSuitesOverHTTPReturnsPaginatedEnvelope(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Suites Page HTTP"}, 201, &p)
	var s1, s2 struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), jmap{"name": "Suite One"}, 201, &s1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), jmap{"name": "Suite Two"}, 201, &s2)

	var page1 struct {
		Items      []struct{ ID string }
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/suites?limit=1", p.Key), nil, 200, &page1)
	if len(page1.Items) != 1 || page1.Items[0].ID != s1.ID {
		t.Fatalf("page1 = %+v, want [%s] (insertion order)", page1.Items, s1.ID)
	}
	if page1.NextCursor == nil {
		t.Fatal("page1 nextCursor = nil, want non-nil (1 more suite remains)")
	}

	var page2 struct {
		Items      []struct{ ID string }
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/suites?limit=1&cursor=%s", p.Key, *page1.NextCursor), nil, 200, &page2)
	if len(page2.Items) != 1 || page2.Items[0].ID != s2.ID {
		t.Fatalf("page2 = %+v, want [%s]", page2.Items, s2.ID)
	}
	if page2.NextCursor != nil {
		t.Errorf("page2 nextCursor = %v, want nil (last page)", page2.NextCursor)
	}
}

func TestScenario_ListRunsOverHTTPDefaultsToBareArrayNeverAgain(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Runs Page Envelope"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "r"}, 201, nil)

	var resp struct {
		Items      []jmap
		NextCursor *string
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), nil, 200, &resp)
	if len(resp.Items) != 1 {
		t.Fatalf("items = %d, want 1", len(resp.Items))
	}
	if resp.NextCursor != nil {
		t.Errorf("nextCursor = %v, want nil (only page)", resp.NextCursor)
	}
}

// TestScenario_MalformedCursorReturns400NotAnArbitraryPage covers the spec's
// "A malformed or unrecognized cursor is rejected" scenario (spec.md):
// found unenforced by Paco's pre-commit QA pass — every *Page store method's
// decodeCursor/decodeCursorWithRank error reached handlers.go's respond()
// unwrapped, matching none of its typed-error cases, so it fell through to
// the default 500 branch instead of the documented 400. Covers a
// representative slice of the eight affected endpoints (owning cursor vs.
// rank-aware cursor, project-scoped vs. instance-scoped, authenticated vs.
// public) since the fix is a single shared root cause, not eight separate
// ones.
func TestScenario_MalformedCursorReturns400NotAnArbitraryPage(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Malformed Cursor"}, 201, &p)
	call(t, h, "PATCH", fmt.Sprintf("/api/v1/projects/%s", p.Key), jmap{"publicAccess": true}, 200, nil)

	const garbage = "garbage!!!notbase64"
	var errResp jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/runs?cursor=%s", p.Key, garbage), nil, 400, &errResp)
	call(t, h, "GET", fmt.Sprintf("/api/v1/public/projects/%s/runs?cursor=%s", p.Key, garbage), nil, 400, nil)
	call(t, h, "GET", "/api/v1/users?cursor="+garbage, nil, 400, nil)
	call(t, h, "GET", "/api/v1/roles?cursor="+garbage, nil, 400, nil) // rank-aware cursor codec

	// Well-formed JSON but missing the required fields must also 400, not
	// silently return an arbitrary page (same decodeCursor validation path).
	emptyPayload := base64.URLEncoding.EncodeToString([]byte(`{}`))
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/runs?cursor=%s", p.Key, emptyPayload), nil, 400, nil)
}
