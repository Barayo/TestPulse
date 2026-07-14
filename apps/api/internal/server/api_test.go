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
	return authInjectingHandler{inner: server.New(slog.New(slog.DiscardHandler), ok{}, svc), cookie: cookie}
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
	var p struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var c struct {
		ID             string
		CurrentVersion int `json:"currentVersion"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID),
		jmap{"title": "Login works", "steps": []jmap{{"action": "open page"}}}, 201, &c)
	if c.CurrentVersion != 1 {
		t.Errorf("new case version = %d, want 1", c.CurrentVersion)
	}

	// "Title is required" scenario.
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"description": "no title"}, 400, nil)

	// "Editing creates a new version" scenario.
	call(t, h, "PUT", "/api/v1/cases/"+c.ID, jmap{"title": "Login works v2"}, 200, &c)
	if c.CurrentVersion != 2 {
		t.Errorf("after edit version = %d, want 2", c.CurrentVersion)
	}

	// "Version history is listable" scenario.
	var versions []struct {
		Version int
		Content jmap
	}
	call(t, h, "GET", "/api/v1/cases/"+c.ID+"/versions", nil, 200, &versions)
	if len(versions) != 2 || versions[0].Content["title"] != "Login works" {
		t.Errorf("versions = %+v", versions)
	}
}

func TestScenario_SuiteMembershipOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c1, c2, suite struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "one"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "two"}, 201, &c2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.ID), jmap{"name": "smoke"}, 201, &suite)

	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.ID, c1.ID), nil, 204, nil)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.ID, c2.ID), nil, 204, nil)

	var suites []struct {
		CaseIDs []string `json:"caseIds"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/suites", p.ID), nil, 200, &suites)
	if len(suites) != 1 || len(suites[0].CaseIDs) != 2 {
		t.Fatalf("suites = %+v", suites)
	}

	// "Removing a case from a suite does not delete the case" scenario.
	call(t, h, "DELETE", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.ID, c1.ID), nil, 204, nil)
	var cases []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), nil, 200, &cases)
	if len(cases) != 2 {
		t.Errorf("cases after suite removal = %d, want 2", len(cases))
	}
}

func TestScenario_RunLifecycleOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c1, c2 struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "one"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "two"}, 201, &c2)

	var run struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.ID),
		jmap{"name": "sprint 1", "caseIds": []string{c1.ID, c2.ID}}, 201, &run)

	// "Items start pending" scenario.
	var items []struct {
		ID            string
		CaseVersion   int    `json:"caseVersion"`
		CurrentStatus string `json:"currentStatus"`
		NewerVersion  bool   `json:"newerVersion"`
		Content       jmap
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.ID), nil, 200, &items)
	if len(items) != 2 || items[0].CurrentStatus != "pending" {
		t.Fatalf("items = %+v", items)
	}

	// "Run pins versions at creation" scenario: edit case, pin must hold.
	call(t, h, "PUT", "/api/v1/cases/"+c1.ID, jmap{"title": "one EDITED"}, 200, nil)
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.ID), nil, 200, &items)
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

	// "Actor is required" and "Invalid status rejected" scenarios.
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items[0].ID), jmap{"verdict": "pass"}, 400, nil)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/items/%s/status", items[0].ID), jmap{"status": "bogus"}, 400, nil)

	// "Assign and filter" scenario.
	call(t, h, "PUT", fmt.Sprintf("/api/v1/items/%s/status", items[0].ID), jmap{"assignee": "ana"}, 204, nil)
	var filtered []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items?assignee=ana", run.ID), nil, 200, &filtered)
	if len(filtered) != 1 {
		t.Errorf("assignee filter = %d items, want 1", len(filtered))
	}

	// "Summary counts by status" scenario: 1 pass, 1 pending.
	var sum struct {
		Total  int
		Counts map[string]int
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/summary", run.ID), nil, 200, &sum)
	if sum.Total != 2 || sum.Counts["pass"] != 1 || sum.Counts["pending"] != 1 {
		t.Errorf("summary = %+v", sum)
	}
}

func TestScenario_RunFromSuite(t *testing.T) {
	h := apiServer(t)
	var p, c1, c2, suite, run struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "one"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "two"}, 201, &c2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.ID), jmap{"name": "smoke"}, 201, &suite)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.ID, c1.ID), nil, 204, nil)
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.ID, c2.ID), nil, 204, nil)

	// Suite + overlapping explicit case: must dedupe to 2 items.
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.ID),
		jmap{"name": "from suite", "suiteId": suite.ID, "caseIds": []string{c1.ID}}, 201, &run)
	var items []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.ID), nil, 200, &items)
	if len(items) != 2 {
		t.Errorf("run from suite = %d items, want 2 (deduped)", len(items))
	}
}

func TestScenario_NotFoundMapsTo404(t *testing.T) {
	h := apiServer(t)
	missing := "00000000-0000-0000-0000-000000000000"
	call(t, h, "GET", "/api/v1/projects/"+missing, nil, 404, nil)
	call(t, h, "GET", "/api/v1/cases/"+missing, nil, 404, nil)
	call(t, h, "GET", "/api/v1/runs/"+missing+"/summary", nil, 404, nil)
	call(t, h, "PUT", "/api/v1/items/"+missing+"/status", jmap{"status": "retest"}, 404, nil)
}

func TestScenario_DeletedCaseStillVisibleInRun(t *testing.T) {
	h := apiServer(t)
	var p, c, run struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "keep"}, 201, &c)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.ID),
		jmap{"name": "r", "caseIds": []string{c.ID}}, 201, &run)

	call(t, h, "DELETE", "/api/v1/cases/"+c.ID, nil, 204, nil)

	var cases []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), nil, 200, &cases)
	if len(cases) != 0 {
		t.Errorf("deleted case still listed")
	}
	var items []struct{ Content jmap }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.ID), nil, 200, &items)
	if len(items) != 1 || items[0].Content["title"] != "keep" {
		t.Errorf("run lost pinned content after delete: %+v", items)
	}
}
