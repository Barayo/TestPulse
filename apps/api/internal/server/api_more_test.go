package server_test

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestScenario_ProjectRenameAndArchive(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var updated struct {
		Name     string
		Archived bool
	}
	call(t, h, "PATCH", "/api/v1/projects/"+p.Key,
		jmap{"name": "QA Platform", "archived": true}, 200, &updated)
	if updated.Name != "QA Platform" || !updated.Archived {
		t.Errorf("updated = %+v", updated)
	}

	// Nothing-to-update is a validation error.
	call(t, h, "PATCH", "/api/v1/projects/"+p.Key, jmap{}, 400, nil)

	var got struct{ Name string }
	call(t, h, "GET", "/api/v1/projects/"+p.Key, nil, 200, &got)
	if got.Name != "QA Platform" {
		t.Errorf("get after patch = %+v", got)
	}
}

func TestScenario_AddItemToOpenRunOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c, run struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "late joiner"}, 201, &c)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "open run"}, 201, &run)

	// Edit before adding: the item must pin the then-current version (2).
	call(t, h, "PUT", "/api/v1/cases/"+c.Key, jmap{"title": "late joiner v2"}, 200, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), jmap{"caseKey": c.Key}, 201, nil)

	var itemsPage struct {
		Items []struct {
			CaseVersion int `json:"caseVersion"`
		}
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &itemsPage)
	if len(itemsPage.Items) != 1 || itemsPage.Items[0].CaseVersion != 2 {
		t.Errorf("added item = %+v, want pinned v2", itemsPage.Items)
	}

	// Runs listing and get.
	var runsPage struct{ Items []jmap }
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), nil, 200, &runsPage)
	if len(runsPage.Items) != 1 {
		t.Errorf("runs = %d, want 1", len(runsPage.Items))
	}
	var got struct{ Name string }
	call(t, h, "GET", "/api/v1/runs/"+run.Key, nil, 200, &got)
	if got.Name != "open run" {
		t.Errorf("get run = %+v", got)
	}

	// Get case endpoint.
	var single struct {
		CurrentVersion int `json:"currentVersion"`
	}
	call(t, h, "GET", "/api/v1/cases/"+c.Key, nil, 200, &single)
	if single.CurrentVersion != 2 {
		t.Errorf("get case = %+v", single)
	}
}

func TestInvalidJSONBodyIs400(t *testing.T) {
	h := apiServer(t)
	// Key-addressed routes 404 on an unresolvable key before ever looking at
	// the body — resolution runs at the API boundary (add-human-readable-keys
	// D4), ahead of decode — so these cases need a real key to isolate body
	// validation from key resolution. /api/v1/items/... stays id-addressed
	// (out of scope), so "x" there still reaches decode() first as before.
	var p, c, run struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "seed"}, 201, &c)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "seed run"}, 201, &run)

	for _, tc := range []struct{ method, path string }{
		{"POST", "/api/v1/projects"},
		{"PATCH", "/api/v1/projects/" + p.Key},
		{"POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key)},
		{"PUT", "/api/v1/cases/" + c.Key},
		{"POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key)},
		{"POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key)},
		{"POST", fmt.Sprintf("/api/v1/runs/%s/items", run.Key)},
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
	var p, c, run1, run2 struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "Login works"}, 201, &c)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "run 1", "caseKeys": []string{c.Key}}, 201, &run1)
	call(t, h, "PUT", "/api/v1/cases/"+c.Key, jmap{"title": "Login works v2"}, 200, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "run 2", "caseKeys": []string{c.Key}}, 201, &run2)

	var execs []struct {
		RunName     string `json:"runName"`
		CaseVersion int    `json:"caseVersion"`
		Status      string `json:"status"`
	}
	call(t, h, "GET", "/api/v1/cases/"+c.Key+"/executions", nil, 200, &execs)
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

// TestScenario_CaseRecentExecutionsOverHTTP covers add-case-result-history's
// bounded, recency-ordered query mode over HTTP: order=recent&limit=N
// returns capped, recency-ordered results; limit without order=recent and
// limit above the max are both rejected; omitting both params leaves the
// existing version-grouped default untouched.
func TestScenario_CaseRecentExecutionsOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c, run1, run2, run3 struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "Login works"}, 201, &c)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "run 1", "caseKeys": []string{c.Key}}, 201, &run1)
	call(t, h, "PUT", "/api/v1/cases/"+c.Key, jmap{"title": "Login works v2"}, 200, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "run 2", "caseKeys": []string{c.Key}}, 201, &run2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "run 3", "caseKeys": []string{c.Key}}, 201, &run3)

	var recent []struct {
		RunName string `json:"runName"`
	}
	call(t, h, "GET", "/api/v1/cases/"+c.Key+"/executions?order=recent&limit=2", nil, 200, &recent)
	if len(recent) != 2 {
		t.Fatalf("recent executions = %d, want 2: %+v", len(recent), recent)
	}
	if recent[0].RunName != "run 3" || recent[1].RunName != "run 2" {
		t.Errorf("recent = %+v, want [run 3, run 2] most-recent-first", recent)
	}

	call(t, h, "GET", "/api/v1/cases/"+c.Key+"/executions?limit=2", nil, 400, nil)
	call(t, h, "GET", "/api/v1/cases/"+c.Key+"/executions?order=recent&limit=51", nil, 400, nil)

	var defaultOrder []struct {
		CaseVersion int `json:"caseVersion"`
	}
	call(t, h, "GET", "/api/v1/cases/"+c.Key+"/executions", nil, 200, &defaultOrder)
	if len(defaultOrder) != 3 || defaultOrder[0].CaseVersion != 1 {
		t.Errorf("default-order executions = %+v, want 3 items still grouped by version starting at v1", defaultOrder)
	}
}

func TestScenario_CustomFieldsOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var textField struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		FieldType string `json:"fieldType"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/custom-fields", p.Key),
		jmap{"name": "Automation Owner", "fieldType": "text"}, 201, &textField)
	if textField.Name != "Automation Owner" || textField.FieldType != "text" {
		t.Fatalf("textField = %+v", textField)
	}

	var selectField struct {
		ID string `json:"id"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/custom-fields", p.Key),
		jmap{"name": "Component", "fieldType": "select"}, 201, &selectField)

	var option struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/custom-fields/%s/options", selectField.ID),
		jmap{"value": "API"}, 201, &option)
	var option2 struct{ ID string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/custom-fields/%s/options", selectField.ID),
		jmap{"value": "Web"}, 201, &option2)

	call(t, h, "PUT", fmt.Sprintf("/api/v1/custom-fields/%s/options/order", selectField.ID),
		jmap{"optionIds": []string{option2.ID, option.ID}}, 204, nil)

	var fields []struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Options []struct {
			ID    string `json:"id"`
			Value string `json:"value"`
		} `json:"options"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/custom-fields", p.Key), nil, 200, &fields)
	if len(fields) != 2 || fields[0].ID != textField.ID || fields[1].ID != selectField.ID {
		t.Fatalf("fields = %+v", fields)
	}
	if len(fields[1].Options) != 2 || fields[1].Options[0].Value != "Web" || fields[1].Options[1].Value != "API" {
		t.Fatalf("fields[1].Options = %+v, want [Web, API] (reordered)", fields[1].Options)
	}

	call(t, h, "PUT", fmt.Sprintf("/api/v1/projects/%s/custom-fields/order", p.Key),
		jmap{"fieldIds": []string{selectField.ID, textField.ID}}, 204, nil)
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/custom-fields", p.Key), nil, 200, &fields)
	if fields[0].ID != selectField.ID || fields[1].ID != textField.ID {
		t.Fatalf("reordered fields = %+v", fields)
	}

	var renamed struct{ Name string }
	call(t, h, "PATCH", "/api/v1/custom-fields/"+textField.ID, jmap{"name": "Owner"}, 200, &renamed)
	if renamed.Name != "Owner" {
		t.Fatalf("renamed = %+v", renamed)
	}

	var preview struct{ CaseCount int }
	call(t, h, "GET", "/api/v1/custom-fields/"+textField.ID+"/deletion-preview", nil, 200, &preview)
	if preview.CaseCount != 0 {
		t.Fatalf("preview = %+v, want 0", preview)
	}

	call(t, h, "DELETE", fmt.Sprintf("/api/v1/custom-fields/%s/options/%s", selectField.ID, option.ID), nil, 204, nil)
	call(t, h, "DELETE", "/api/v1/custom-fields/"+textField.ID, nil, 204, nil)

	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/custom-fields", p.Key), nil, 200, &fields)
	if len(fields) != 1 || fields[0].ID != selectField.ID {
		t.Fatalf("fields after delete = %+v", fields)
	}
}

func TestScenario_ProjectStatusSummaryOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "Login works"}, 201, &c)

	var run1, run2 struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "run 1", "caseKeys": []string{c.Key}}, 201, &run1)
	var items1 struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run1.Key), nil, 200, &items1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items1.Items[0].ID), jmap{"actor": "ana", "verdict": "pass"}, 201, nil)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "run 2", "caseKeys": []string{c.Key}}, 201, &run2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", run2.Key), nil, 204, nil)

	var sum struct {
		Total  int            `json:"total"`
		Counts map[string]int `json:"counts"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/runs/status-summary", p.Key), nil, 200, &sum)
	if sum.Total != 2 || sum.Counts["pass"] != 1 || sum.Counts["pending"] != 1 {
		t.Errorf("status summary = %+v, want total 2, pass 1, pending 1 (spans open+closed runs)", sum)
	}
}
