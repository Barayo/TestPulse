package server_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/server"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

// API integration tests: full HTTP → service → store → PostgreSQL loop.
// Each test name maps to a spec scenario in the add-core-domain change.

type ok struct{}

func (ok) Ready(context.Context) error { return nil }

// apiServer builds a server backed by a real database and wraps it so
// every request authenticates as a bootstrap admin unless the test sets
// its own Cookie header — existing scenario tests exercise domain
// behavior, not auth, so they get authentication for free (task 5.2,
// add-identity-basics). Tests specifically about auth/authorization use
// apiServerWithAdmin (identity_api_test.go) instead.
func apiServer(t *testing.T) http.Handler {
	t.Helper()
	pool := testutil.Pool(t, "server")
	svc := service.New(store.New(pool))
	cookie := testutil.AuthCookie(t, svc)
	return authInjectingHandler{inner: server.New(slog.New(slog.DiscardHandler), ok{}, svc, 5, 5, nil, true), cookie: cookie}
}

// authInjectingHandler attaches a fixed Cookie header to any request that
// doesn't already carry one.
type authInjectingHandler struct {
	inner  http.Handler
	cookie string
}

func (a authInjectingHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Cookie") == "" {
		r.Header.Set("Cookie", a.cookie)
	}
	a.inner.ServeHTTP(w, r)
}

// call performs a JSON request and decodes the response into out (if non-nil).
func call(t *testing.T, h http.Handler, method, path string, body any, wantStatus int, out any) {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != wantStatus {
		t.Fatalf("%s %s = %d, want %d; body: %s", method, path, rec.Code, wantStatus, rec.Body.String())
	}
	if out != nil {
		if err := json.Unmarshal(rec.Body.Bytes(), out); err != nil {
			t.Fatalf("decoding %s %s response: %v", method, path, err)
		}
	}
}

type jmap = map[string]any

func TestScenario_ProjectCreateAndValidation(t *testing.T) {
	h := apiServer(t)

	var p struct{ ID, Name string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	if p.Name != "QA" || p.ID == "" {
		t.Errorf("created project = %+v", p)
	}

	// "Project name is required" scenario: 400 naming the field.
	var errBody struct{ Error string }
	call(t, h, "POST", "/api/v1/projects", jmap{}, 400, &errBody)
	if errBody.Error == "" || !bytes.Contains([]byte(errBody.Error), []byte("name")) {
		t.Errorf("validation error = %q, want mention of name", errBody.Error)
	}

	var list []jmap
	call(t, h, "GET", "/api/v1/projects", nil, 200, &list)
	if len(list) != 1 {
		t.Errorf("project list = %d entries", len(list))
	}
}

func TestScenario_CaseVersioningOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var c struct {
		Key            string
		CurrentVersion int `json:"currentVersion"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "Login works", "steps": []jmap{{"action": "open page"}}}, 201, &c)
	if c.CurrentVersion != 1 {
		t.Errorf("new case version = %d, want 1", c.CurrentVersion)
	}

	// "Title is required" scenario.
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"description": "no title"}, 400, nil)

	// "Editing creates a new version" scenario.
	call(t, h, "PUT", "/api/v1/cases/"+c.Key, jmap{"title": "Login works v2"}, 200, &c)
	if c.CurrentVersion != 2 {
		t.Errorf("after edit version = %d, want 2", c.CurrentVersion)
	}

	// "Version history is listable" scenario.
	var versions []struct {
		Version int
		Content jmap
	}
	call(t, h, "GET", "/api/v1/cases/"+c.Key+"/versions", nil, 200, &versions)
	if len(versions) != 2 || versions[0].Content["title"] != "Login works" {
		t.Errorf("versions = %+v", versions)
	}
}

func TestScenario_RestoreCaseVersionOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var c struct {
		Key            string
		CurrentVersion int `json:"currentVersion"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "v1 title", "steps": []jmap{{"action": "open page"}}}, 201, &c)
	call(t, h, "PUT", "/api/v1/cases/"+c.Key, jmap{"title": "v2 title"}, 200, &c)

	// Restoring version 1 creates a new (3rd) version with v1's content.
	call(t, h, "POST", "/api/v1/cases/"+c.Key+"/versions/1/restore", nil, 201, &c)
	if c.CurrentVersion != 3 {
		t.Errorf("after restore version = %d, want 3", c.CurrentVersion)
	}

	var caseBody struct {
		Content jmap
	}
	call(t, h, "GET", "/api/v1/cases/"+c.Key, nil, 200, &caseBody)
	if caseBody.Content["title"] != "v1 title" {
		t.Errorf("restored content = %+v, want title v1 title", caseBody.Content)
	}

	// Restoring a nonexistent version is rejected.
	call(t, h, "POST", "/api/v1/cases/"+c.Key+"/versions/99/restore", nil, 404, nil)
}

// "updatedAt reflects the current version, not original creation" scenario
// (rework-library-ux: the Library's staleness badge needs a case's last-
// touched time, which for an immutably-versioned case is the current
// version's own createdAt, not the case row's own createdAt).
func TestScenario_CaseUpdatedAtOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var c struct {
		Key       string
		CreatedAt time.Time `json:"createdAt"`
		UpdatedAt time.Time `json:"updatedAt"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "Login works"}, 201, &c)
	if c.UpdatedAt.IsZero() {
		t.Fatalf("newly created case has zero updatedAt")
	}
	firstCreatedAt, firstUpdatedAt := c.CreatedAt, c.UpdatedAt

	call(t, h, "PUT", "/api/v1/cases/"+c.Key, jmap{"title": "Login works v2"}, 200, &c)
	if !c.UpdatedAt.After(firstUpdatedAt) {
		t.Errorf("updatedAt after edit = %v, want strictly after %v", c.UpdatedAt, firstUpdatedAt)
	}
	if !c.CreatedAt.Equal(firstCreatedAt) {
		t.Errorf("createdAt changed after edit: was %v, now %v — should stay the case's original creation time", firstCreatedAt, c.CreatedAt)
	}
}

func TestScenario_SuiteMembershipOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c1, c2, suite struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "two"}, 201, &c2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), jmap{"name": "smoke"}, 201, &suite)

	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.Key, c1.Key), nil, 204, nil)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.Key, c2.Key), nil, 204, nil)

	var suitesResp struct {
		Items []struct {
			CaseIDs []string `json:"caseIds"`
		}
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), nil, 200, &suitesResp)
	if len(suitesResp.Items) != 1 || len(suitesResp.Items[0].CaseIDs) != 2 {
		t.Fatalf("suites = %+v", suitesResp.Items)
	}

	// "Removing a case from a suite does not delete the case" scenario.
	call(t, h, "DELETE", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.Key, c1.Key), nil, 204, nil)
	var casesResp struct{ Items []jmap }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), nil, 200, &casesResp)
	if len(casesResp.Items) != 2 {
		t.Errorf("cases after suite removal = %d, want 2", len(casesResp.Items))
	}
}

func TestScenario_RunLifecycleOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c1, c2 struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "two"}, 201, &c2)

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "sprint 1", "caseKeys": []string{c1.Key, c2.Key}}, 201, &run)

	// "Items start pending" scenario.
	var itemsResp struct {
		Items []struct {
			ID            string
			CaseVersion   int    `json:"caseVersion"`
			CurrentStatus string `json:"currentStatus"`
			NewerVersion  bool   `json:"newerVersion"`
			Content       jmap
		}
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &itemsResp)
	items := itemsResp.Items
	if len(items) != 2 || items[0].CurrentStatus != "pending" {
		t.Fatalf("items = %+v", items)
	}

	// "Run pins versions at creation" scenario: edit case, pin must hold.
	call(t, h, "PUT", "/api/v1/cases/"+c1.Key, jmap{"title": "one EDITED"}, 200, nil)
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &itemsResp)
	items = itemsResp.Items
	if items[0].CaseVersion != 1 || items[0].Content["title"] != "one" {
		t.Errorf("pin broken: %+v", items[0])
	}
	if !items[0].NewerVersion {
		t.Error("newerVersion hint missing after edit")
	}

	// "Recording a verdict updates status" + "Results accumulate" scenarios.
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items[0].ID),
		jmap{"actor": "ana", "verdict": "failed", "comment": "broken"}, 201, nil)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/items/%s/status", items[0].ID), jmap{"status": "retest"}, 204, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items[0].ID),
		jmap{"actor": "ana", "verdict": "pass"}, 201, nil)

	var results []struct{ Verdict string }
	call(t, h, "GET", fmt.Sprintf("/api/v1/items/%s/results", items[0].ID), nil, 200, &results)
	if len(results) != 2 || results[0].Verdict != "failed" || results[1].Verdict != "pass" {
		t.Errorf("result log = %+v", results)
	}

	// "Actor defaults to the authenticated caller" scenario
	// (link-result-actor-to-identity): omitting actor no longer errors, it
	// records the caller's own identity.
	var defaulted struct {
		Actor      string `json:"actor"`
		ActorKind  string `json:"actorKind"`
		ActorRefID string `json:"actorRefId"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items[0].ID), jmap{"verdict": "pass"}, 201, &defaulted)
	if defaulted.Actor == "" || defaulted.ActorKind != "user" || defaulted.ActorRefID == "" {
		t.Errorf("defaulted result = %+v, want a non-empty actor/user/actorRefId", defaulted)
	}

	// "Invalid status rejected" scenario.
	call(t, h, "PUT", fmt.Sprintf("/api/v1/items/%s/status", items[0].ID), jmap{"status": "bogus"}, 400, nil)

	// "Assign and filter" scenario (link-run-item-assignee-to-identity):
	// assignment only accepts a real project member.
	var member struct{ ID string }
	call(t, h, "POST", "/api/v1/users", jmap{"email": "ana-scenario@example.com", "password": "correcthorse1"}, 201, &member)
	var rolesResp struct {
		Items []struct {
			ID   string
			Name string
		}
	}
	call(t, h, "GET", "/api/v1/roles", nil, 200, &rolesResp)
	var testerRoleID string
	for _, role := range rolesResp.Items {
		if role.Name == "Tester" {
			testerRoleID = role.ID
		}
	}
	if testerRoleID == "" {
		t.Fatal("Tester role not found")
	}
	call(t, h, "PUT", fmt.Sprintf("/api/v1/projects/%s/members/%s", p.Key, member.ID), jmap{"roleId": testerRoleID}, 204, nil)

	call(t, h, "PUT", fmt.Sprintf("/api/v1/items/%s/status", items[0].ID), jmap{"assigneeUserId": member.ID}, 204, nil)
	var filteredResp struct{ Items []jmap }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items?assignee=%s", run.Key, member.ID), nil, 200, &filteredResp)
	filtered := filteredResp.Items
	if len(filtered) != 1 {
		t.Errorf("assignee filter = %d items, want 1", len(filtered))
	}
	if assignee, ok := filtered[0]["assignee"].(map[string]any); !ok || assignee["id"] != member.ID || assignee["kind"] != "user" {
		t.Errorf("assignee = %+v, want linked user %s", filtered[0]["assignee"], member.ID)
	}

	// "Assigning to a non-member is rejected" scenario.
	var outsider struct{ ID string }
	call(t, h, "POST", "/api/v1/users", jmap{"email": "outsider-scenario@example.com", "password": "correcthorse1"}, 201, &outsider)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/items/%s/status", items[0].ID), jmap{"assigneeUserId": outsider.ID}, 404, nil)

	// "Summary counts by status" scenario: 1 pass, 1 pending.
	var sum struct {
		Total  int
		Counts map[string]int
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/summary", run.Key), nil, 200, &sum)
	if sum.Total != 2 || sum.Counts["pass"] != 1 || sum.Counts["pending"] != 1 {
		t.Errorf("summary = %+v", sum)
	}
}

func TestScenario_RunFromSuite(t *testing.T) {
	h := apiServer(t)
	var p, c1, c2, suite, run struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "two"}, 201, &c2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), jmap{"name": "smoke"}, 201, &suite)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.Key, c1.Key), nil, 204, nil)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.Key, c2.Key), nil, 204, nil)

	// Suite + overlapping explicit case: must dedupe to 2 items.
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "from suite", "suiteKey": suite.Key, "caseKeys": []string{c1.Key}}, 201, &run)
	var itemsResp struct{ Items []jmap }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &itemsResp)
	if len(itemsResp.Items) != 2 {
		t.Errorf("run from suite = %d items, want 2 (deduped)", len(itemsResp.Items))
	}
}

func TestScenario_SuiteTrendOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c, suite, run struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), jmap{"name": "smoke"}, 201, &suite)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "sprint 1", "suiteKey": suite.Key, "caseKeys": []string{c.Key}}, 201, &run)

	var items struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items.Items[0].ID), jmap{"actor": "ana", "verdict": "pass"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", run.Key), nil, 204, nil)

	var trend struct {
		SuiteKey string `json:"suiteKey"`
		Points   []struct {
			RunKey string         `json:"runKey"`
			Total  int            `json:"total"`
			Counts map[string]int `json:"counts"`
		} `json:"points"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/suites/%s/trend", suite.Key), nil, 200, &trend)
	if trend.SuiteKey != suite.Key {
		t.Errorf("SuiteKey = %q, want %q", trend.SuiteKey, suite.Key)
	}
	if len(trend.Points) != 1 || trend.Points[0].RunKey != run.Key || trend.Points[0].Counts["pass"] != 1 {
		t.Errorf("Points = %+v", trend.Points)
	}

	call(t, h, "GET", "/api/v1/suites/NOPE/trend", nil, 404, nil)
}

// TestScenario_SuiteTrendIncludeOpenOverHTTP covers
// add-suite-run-breakdown-trend: ?includeOpen=true adds the suite's current
// open run as a trailing, IsOpen-marked point; omitting it (or the plain
// endpoint) excludes the open run exactly as before.
func TestScenario_SuiteTrendIncludeOpenOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c, suite, closedRun, openRun struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), jmap{"name": "smoke"}, 201, &suite)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "closed", "suiteKey": suite.Key, "caseKeys": []string{c.Key}}, 201, &closedRun)
	var closedItems struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", closedRun.Key), nil, 200, &closedItems)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", closedItems.Items[0].ID), jmap{"actor": "ana", "verdict": "pass"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", closedRun.Key), nil, 204, nil)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "open", "suiteKey": suite.Key, "caseKeys": []string{c.Key}}, 201, &openRun)
	var openItems struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", openRun.Key), nil, 200, &openItems)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", openItems.Items[0].ID), jmap{"actor": "ana", "verdict": "failed"}, 201, nil)

	type point struct {
		RunKey string         `json:"runKey"`
		Counts map[string]int `json:"counts"`
		IsOpen bool           `json:"isOpen"`
	}
	var withoutOpen struct {
		Points []point `json:"points"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/suites/%s/trend", suite.Key), nil, 200, &withoutOpen)
	if len(withoutOpen.Points) != 1 || withoutOpen.Points[0].RunKey != closedRun.Key {
		t.Fatalf("default trend Points = %+v, want only the closed run", withoutOpen.Points)
	}

	var withOpen struct {
		Points []point `json:"points"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/suites/%s/trend?includeOpen=true", suite.Key), nil, 200, &withOpen)
	if len(withOpen.Points) != 2 {
		t.Fatalf("includeOpen=true Points = %+v, want 2", withOpen.Points)
	}
	last := withOpen.Points[len(withOpen.Points)-1]
	if last.RunKey != openRun.Key || !last.IsOpen || last.Counts["failed"] != 1 {
		t.Errorf("trailing point = %+v, want the open run marked IsOpen with 1 failed", last)
	}
}

// TestPublicProject_SuiteTrendIncludeOpenSucceedsWhenPublic confirms the
// public route (mounted on the same handler) supports includeOpen too.
func TestPublicProject_SuiteTrendIncludeOpenSucceedsWhenPublic(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Open Book"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)

	var c, suite jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/cases", jmap{"title": "one"}, 201, &c)
	caseKey, _ := c["key"].(string)
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/suites", jmap{"name": "smoke"}, 201, &suite)
	suiteKey, _ := suite["key"].(string)

	var openRun jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/runs",
		jmap{"name": "open", "suiteKey": suiteKey, "caseKeys": []string{caseKey}}, 201, &openRun)

	var trend struct {
		Points []struct{ IsOpen bool } `json:"points"`
	}
	callAs(t, handler, "", "GET", "/api/v1/public/suites/"+suiteKey+"/trend?includeOpen=true", nil, 200, &trend)
	if len(trend.Points) != 1 || !trend.Points[0].IsOpen {
		t.Errorf("public includeOpen trend Points = %+v, want one open point", trend.Points)
	}
}

func TestScenario_FlakyCasesOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "flaky one"}, 201, &c)

	var run1, run2 struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "run 1", "caseKeys": []string{c.Key}}, 201, &run1)
	var items1 struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run1.Key), nil, 200, &items1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items1.Items[0].ID), jmap{"actor": "ana", "verdict": "pass"}, 201, nil)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "run 2", "caseKeys": []string{c.Key}}, 201, &run2)
	var items2 struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run2.Key), nil, 200, &items2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items2.Items[0].ID), jmap{"actor": "ana", "verdict": "failed"}, 201, nil)

	var flaky []struct {
		CaseKey        string `json:"caseKey"`
		CaseTitle      string `json:"caseTitle"`
		CurrentVersion int    `json:"currentVersion"`
		Rate           int    `json:"rate"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/flaky-cases", p.Key), nil, 200, &flaky)
	if len(flaky) != 1 || flaky[0].CaseKey != c.Key || flaky[0].Rate != 50 {
		t.Errorf("flaky = %+v, want exactly case %q at rate 50", flaky, c.Key)
	}
}

func TestScenario_SuiteDetailOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c, suite struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), jmap{"name": "smoke"}, 201, &suite)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.Key, c.Key), nil, 204, nil)

	var got struct {
		Name    string   `json:"name"`
		CaseIDs []string `json:"caseIds"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/suites/%s", suite.Key), nil, 200, &got)
	if got.Name != "smoke" || len(got.CaseIDs) != 1 {
		t.Errorf("GET suite = %+v", got)
	}

	var renamed struct{ Name string }
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s", suite.Key), jmap{"name": "smoke v2"}, 200, &renamed)
	if renamed.Name != "smoke v2" {
		t.Errorf("rename response name = %q, want %q", renamed.Name, "smoke v2")
	}

	call(t, h, "DELETE", fmt.Sprintf("/api/v1/suites/%s", suite.Key), nil, 204, nil)
	call(t, h, "GET", fmt.Sprintf("/api/v1/suites/%s", suite.Key), nil, 404, nil)

	call(t, h, "GET", "/api/v1/suites/NOPE", nil, 404, nil)
	call(t, h, "PUT", "/api/v1/suites/NOPE", jmap{"name": "x"}, 404, nil)
	call(t, h, "DELETE", "/api/v1/suites/NOPE", nil, 404, nil)
}

func TestScenario_NotFoundMapsTo404(t *testing.T) {
	h := apiServer(t)
	missing := "NOPE"
	call(t, h, "GET", "/api/v1/projects/"+missing, nil, 404, nil)
	call(t, h, "GET", "/api/v1/cases/"+missing, nil, 404, nil)
	call(t, h, "GET", "/api/v1/runs/"+missing+"/summary", nil, 404, nil)
	call(t, h, "PUT", "/api/v1/items/00000000-0000-0000-0000-000000000000/status", jmap{"status": "retest"}, 404, nil)
}

func TestScenario_DeletedCaseStillVisibleInRun(t *testing.T) {
	h := apiServer(t)
	var p, c, run struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "keep"}, 201, &c)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "r", "caseKeys": []string{c.Key}}, 201, &run)

	call(t, h, "DELETE", "/api/v1/cases/"+c.Key, nil, 204, nil)

	var casesResp struct{ Items []jmap }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), nil, 200, &casesResp)
	if len(casesResp.Items) != 0 {
		t.Errorf("deleted case still listed")
	}
	var items struct{ Items []struct{ Content jmap } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	if len(items.Items) != 1 || items.Items[0].Content["title"] != "keep" {
		t.Errorf("run lost pinned content after delete: %+v", items.Items)
	}
}
