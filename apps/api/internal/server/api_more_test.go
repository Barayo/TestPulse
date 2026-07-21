package server_test

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestScenario_ProjectRenameAndArchive(t *testing.T) {
	h := apiServer(t)
	var p struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var updated struct {
		Name     string
		Archived bool
	}
	call(t, h, "PATCH", "/api/v1/projects/"+p.ID,
		jmap{"name": "QA Platform", "archived": true}, 200, &updated)
	if updated.Name != "QA Platform" || !updated.Archived {
		t.Errorf("updated = %+v", updated)
	}

	// Nothing-to-update is a validation error.
	call(t, h, "PATCH", "/api/v1/projects/"+p.ID, jmap{}, 400, nil)

	var got struct{ Name string }
	call(t, h, "GET", "/api/v1/projects/"+p.ID, nil, 200, &got)
	if got.Name != "QA Platform" {
		t.Errorf("get after patch = %+v", got)
	}
}

func TestScenario_AddItemToOpenRunOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c, run struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "late joiner"}, 201, &c)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.ID), jmap{"name": "open run"}, 201, &run)

	// Edit before adding: the item must pin the then-current version (2).
	call(t, h, "PUT", "/api/v1/cases/"+c.ID, jmap{"title": "late joiner v2"}, 200, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/items", run.ID), jmap{"caseId": c.ID}, 201, nil)

	var items []struct {
		CaseVersion int `json:"caseVersion"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.ID), nil, 200, &items)
	if len(items) != 1 || items[0].CaseVersion != 2 {
		t.Errorf("added item = %+v, want pinned v2", items)
	}

	// Runs listing and get.
	var runs []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/runs", p.ID), nil, 200, &runs)
	if len(runs) != 1 {
		t.Errorf("runs = %d, want 1", len(runs))
	}
	var got struct{ Name string }
	call(t, h, "GET", "/api/v1/runs/"+run.ID, nil, 200, &got)
	if got.Name != "open run" {
		t.Errorf("get run = %+v", got)
	}

	// Get case endpoint.
	var single struct {
		CurrentVersion int `json:"currentVersion"`
	}
	call(t, h, "GET", "/api/v1/cases/"+c.ID, nil, 200, &single)
	if single.CurrentVersion != 2 {
		t.Errorf("get case = %+v", single)
	}
}

func TestInvalidJSONBodyIs400(t *testing.T) {
	h := apiServer(t)
	for _, tc := range []struct{ method, path string }{
		{"POST", "/api/v1/projects"},
		{"PATCH", "/api/v1/projects/x"},
		{"POST", "/api/v1/projects/x/cases"},
		{"PUT", "/api/v1/cases/x"},
		{"POST", "/api/v1/projects/x/suites"},
		{"POST", "/api/v1/projects/x/runs"},
		{"POST", "/api/v1/runs/x/items"},
		{"POST", "/api/v1/items/x/results"},
		{"PUT", "/api/v1/items/x/status"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, strings.NewReader("{not json"))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != 400 {
			t.Errorf("%s %s with bad JSON = %d, want 400", tc.method, tc.path, rec.Code)
		}
	}
}

func TestScenario_CaseExecutionsGroupedByVersionOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c, run1, run2 struct{ ID string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.ID), jmap{"title": "Login works"}, 201, &c)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.ID), jmap{"name": "run 1", "caseIds": []string{c.ID}}, 201, &run1)
	call(t, h, "PUT", "/api/v1/cases/"+c.ID, jmap{"title": "Login works v2"}, 200, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.ID), jmap{"name": "run 2", "caseIds": []string{c.ID}}, 201, &run2)

	var execs []struct {
		RunName     string `json:"runName"`
		CaseVersion int    `json:"caseVersion"`
		Status      string `json:"status"`
	}
	call(t, h, "GET", "/api/v1/cases/"+c.ID+"/executions", nil, 200, &execs)
	if len(execs) != 2 {
		t.Fatalf("executions = %d, want 2: %+v", len(execs), execs)
	}
	if execs[0].CaseVersion != 1 || execs[0].RunName != "run 1" || execs[0].Status != "pending" {
		t.Errorf("execs[0] = %+v", execs[0])
	}
	if execs[1].CaseVersion != 2 || execs[1].RunName != "run 2" {
		t.Errorf("execs[1] = %+v", execs[1])
	}
}
