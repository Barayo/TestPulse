package server_test

import (
	"fmt"
	"testing"
)

// Integration tests for add-run-comparison-view's comparison endpoint:
// full HTTP → service → store → PostgreSQL loop, matching the pattern
// TestScenario_SuiteTrendOverHTTP already established for the sibling
// reporting endpoint.

func TestScenario_CompareRunsOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c1, c2, run1, run2 struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "regresses"}, 201, &c1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "stable"}, 201, &c2)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "older", "caseKeys": []string{c1.Key, c2.Key}}, 201, &run1)
	var items1 struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run1.Key), nil, 200, &items1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items1.Items[0].ID), jmap{"actor": "ana", "verdict": "pass"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items1.Items[1].ID), jmap{"actor": "ana", "verdict": "pass"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", run1.Key), nil, 204, nil)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "newer", "caseKeys": []string{c1.Key, c2.Key}}, 201, &run2)
	var items2 struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run2.Key), nil, 200, &items2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items2.Items[0].ID), jmap{"actor": "ana", "verdict": "failed"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items2.Items[1].ID), jmap{"actor": "ana", "verdict": "pass"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", run2.Key), nil, 204, nil)

	var cmp struct {
		OlderRun  struct{ RunKey string }    `json:"olderRun"`
		NewerRun  struct{ RunKey string }    `json:"newerRun"`
		Regressed []struct{ CaseKey string } `json:"regressed"`
		Unchanged []struct{ CaseKey string } `json:"unchanged"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/compare/%s", run1.Key, run2.Key), nil, 200, &cmp)
	if cmp.OlderRun.RunKey != run1.Key || cmp.NewerRun.RunKey != run2.Key {
		t.Errorf("OlderRun=%q NewerRun=%q, want older=%q newer=%q", cmp.OlderRun.RunKey, cmp.NewerRun.RunKey, run1.Key, run2.Key)
	}
	if len(cmp.Regressed) != 1 || cmp.Regressed[0].CaseKey != c1.Key {
		t.Errorf("Regressed = %+v, want [%s]", cmp.Regressed, c1.Key)
	}
	if len(cmp.Unchanged) != 1 || cmp.Unchanged[0].CaseKey != c2.Key {
		t.Errorf("Unchanged = %+v, want [%s]", cmp.Unchanged, c2.Key)
	}

	// Reversed order in the URL: same categorization, order-independent.
	var reversed struct {
		OlderRun  struct{ RunKey string }    `json:"olderRun"`
		NewerRun  struct{ RunKey string }    `json:"newerRun"`
		Regressed []struct{ CaseKey string } `json:"regressed"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/compare/%s", run2.Key, run1.Key), nil, 200, &reversed)
	if reversed.OlderRun.RunKey != run1.Key || reversed.NewerRun.RunKey != run2.Key {
		t.Errorf("reversed URL order: OlderRun=%q NewerRun=%q, want older=%q newer=%q", reversed.OlderRun.RunKey, reversed.NewerRun.RunKey, run1.Key, run2.Key)
	}
}

// TestScenario_CompareRunsEmptyCategoriesAreArraysNotNull is a regression
// test for a real bug found while validating this feature end-to-end: a
// nil Go slice marshals to JSON `null`, not `[]` — which broke the web
// client's `.length` calls on any empty diff category. Caught by decoding
// into typed (non-`any`) slice fields, where encoding/json preserves the
// null-vs-empty-array distinction on unmarshal.
func TestScenario_CompareRunsEmptyCategoriesAreArraysNotNull(t *testing.T) {
	h := apiServer(t)
	var p, c, run1, run2 struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "older", "caseKeys": []string{c.Key}}, 201, &run1)
	var items1 struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run1.Key), nil, 200, &items1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items1.Items[0].ID), jmap{"actor": "ana", "verdict": "pass"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", run1.Key), nil, 204, nil)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "newer", "caseKeys": []string{c.Key}}, 201, &run2)
	var items2 struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run2.Key), nil, 200, &items2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items2.Items[0].ID), jmap{"actor": "ana", "verdict": "failed"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", run2.Key), nil, 204, nil)

	var cmp struct {
		Improved  []struct{ CaseKey string } `json:"improved"`
		Unchanged []struct{ CaseKey string } `json:"unchanged"`
		Added     []struct{ CaseKey string } `json:"added"`
		Removed   []struct{ CaseKey string } `json:"removed"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/compare/%s", run1.Key, run2.Key), nil, 200, &cmp)
	if cmp.Improved == nil {
		t.Error("Improved = nil (JSON null), want a non-nil empty array")
	}
	if cmp.Unchanged == nil {
		t.Error("Unchanged = nil (JSON null), want a non-nil empty array")
	}
	if cmp.Added == nil {
		t.Error("Added = nil (JSON null), want a non-nil empty array")
	}
	if cmp.Removed == nil {
		t.Error("Removed = nil (JSON null), want a non-nil empty array")
	}
}

// TestScenario_CompareRunsIncludesTotalDurationOverHTTP covers
// add-run-comparison-timing: a run whose only result carries start/end
// timestamps reports totalDurationMs on the comparison response; a run
// with no timed results reports it absent (nil), not zero.
func TestScenario_CompareRunsIncludesTotalDurationOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c, timedRun, untimedRun struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "timed", "caseKeys": []string{c.Key}}, 201, &timedRun)
	var timedItems struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", timedRun.Key), nil, 200, &timedItems)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", timedItems.Items[0].ID), jmap{
		"actor": "ci", "verdict": "pass",
		"startTime": "2026-08-01T09:00:00Z", "endTime": "2026-08-01T09:00:04Z",
	}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", timedRun.Key), nil, 204, nil)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "untimed", "caseKeys": []string{c.Key}}, 201, &untimedRun)
	var untimedItems struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", untimedRun.Key), nil, 200, &untimedItems)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", untimedItems.Items[0].ID), jmap{"actor": "ana", "verdict": "pass"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", untimedRun.Key), nil, 204, nil)

	var cmp struct {
		OlderRun struct {
			RunKey          string `json:"runKey"`
			TotalDurationMs *int64 `json:"totalDurationMs"`
		} `json:"olderRun"`
		NewerRun struct {
			RunKey          string `json:"runKey"`
			TotalDurationMs *int64 `json:"totalDurationMs"`
		} `json:"newerRun"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/compare/%s", timedRun.Key, untimedRun.Key), nil, 200, &cmp)

	if cmp.OlderRun.RunKey != timedRun.Key {
		t.Fatalf("OlderRun.RunKey = %q, want %q", cmp.OlderRun.RunKey, timedRun.Key)
	}
	if cmp.OlderRun.TotalDurationMs == nil || *cmp.OlderRun.TotalDurationMs != 4000 {
		t.Errorf("OlderRun.TotalDurationMs = %v, want 4000", cmp.OlderRun.TotalDurationMs)
	}
	if cmp.NewerRun.TotalDurationMs != nil {
		t.Errorf("NewerRun.TotalDurationMs = %v, want nil (no timed results)", *cmp.NewerRun.TotalDurationMs)
	}
}

func TestScenario_CompareRunsRejectsOpenRunOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c, closedRun, openRun struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "closed", "caseKeys": []string{c.Key}}, 201, &closedRun)
	var items struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", closedRun.Key), nil, 200, &items)
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", items.Items[0].ID), jmap{"actor": "ana", "verdict": "pass"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/close", closedRun.Key), nil, 204, nil)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "open", "caseKeys": []string{c.Key}}, 201, &openRun)

	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/compare/%s", closedRun.Key, openRun.Key), nil, 400, nil)
}

func TestScenario_CompareRunsUnknownKeyOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p, c, run struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "r", "caseKeys": []string{c.Key}}, 201, &run)

	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/compare/NOPE", run.Key), nil, 404, nil)
}

func TestPublicProject_CompareRunsSucceedsWhenPublic(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Open Book"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, handler, admin, "PATCH", "/api/v1/projects/"+projectKey, jmap{"publicAccess": true}, 200, nil)

	var c jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/cases", jmap{"title": "one"}, 201, &c)
	caseKey, _ := c["key"].(string)

	var run1 jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/runs", jmap{"name": "older", "caseKeys": []string{caseKey}}, 201, &run1)
	run1Key, _ := run1["key"].(string)
	var items1 struct{ Items []jmap }
	callAs(t, handler, admin, "GET", "/api/v1/runs/"+run1Key+"/items", nil, 200, &items1)
	item1ID, _ := items1.Items[0]["id"].(string)
	callAs(t, handler, admin, "POST", "/api/v1/items/"+item1ID+"/results", jmap{"actor": "ana", "verdict": "pass"}, 201, nil)
	callAs(t, handler, admin, "POST", "/api/v1/runs/"+run1Key+"/close", nil, 204, nil)

	var run2Res jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects/"+projectKey+"/runs", jmap{"name": "newer", "caseKeys": []string{caseKey}}, 201, &run2Res)
	run2Key, _ := run2Res["key"].(string)
	var items2 struct{ Items []jmap }
	callAs(t, handler, admin, "GET", "/api/v1/runs/"+run2Key+"/items", nil, 200, &items2)
	item2ID, _ := items2.Items[0]["id"].(string)
	callAs(t, handler, admin, "POST", "/api/v1/items/"+item2ID+"/results", jmap{"actor": "ana", "verdict": "pass"}, 201, nil)
	callAs(t, handler, admin, "POST", "/api/v1/runs/"+run2Key+"/close", nil, 204, nil)

	callAs(t, handler, "", "GET", "/api/v1/public/runs/"+run1Key+"/compare/"+run2Key, nil, 200, nil)
}
