package server_test

import (
	"fmt"
	"testing"
)

// HTTP-level scenarios for add-step-level-results —
// openspec/changes/add-step-level-results/specs/step-level-results/spec.md.

func TestScenario_SetStepResultUpdatesLiveStepStates(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "one", "steps": []jmap{{"action": "a"}, {"action": "b"}, {"action": "c"}}}, 201, &c)

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	var items struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	itemID := items.Items[0].ID

	var got jmap
	call(t, h, "PUT", fmt.Sprintf("/api/v1/items/%s/steps/1", itemID), jmap{"verdict": "failed"}, 200, &got)
	if got["stepIndex"] != float64(1) || got["verdict"] != "failed" {
		t.Fatalf("PUT steps response = %+v, want {stepIndex: 1, verdict: failed}", got)
	}

	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	var withStates struct {
		Items []struct {
			ID         string
			StepStates []jmap
		}
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &withStates)
	if len(withStates.Items[0].StepStates) != 1 || withStates.Items[0].StepStates[0]["stepIndex"] != float64(1) {
		t.Fatalf("item stepStates = %+v, want [{stepIndex: 1, verdict: failed}]", withStates.Items[0].StepStates)
	}
}

func TestScenario_SetStepResultRejectsOutOfBoundsIndexWith400(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "one", "steps": []jmap{{"action": "a"}}}, 201, &c)

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	var items struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	itemID := items.Items[0].ID

	var errBody jmap
	call(t, h, "PUT", fmt.Sprintf("/api/v1/items/%s/steps/5", itemID), jmap{"verdict": "pass"}, 400, &errBody)
}

func TestScenario_SetStepResultRequiresRunRecordResultPermission(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")

	var viewerRole jmap
	callAs(t, handler, admin, "POST", "/api/v1/roles",
		jmap{"name": "Viewer (step-results-test)", "rank": 5, "canRead": true}, 201, &viewerRole)
	viewerRoleID, _ := viewerRole["id"].(string)

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "Step Results"}, 201, &p)
	projectKey, _ := p["key"].(string)
	var c jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", projectKey),
		jmap{"title": "one", "steps": []jmap{{"action": "a"}, {"action": "b"}}}, 201, &c)
	caseKey, _ := c["key"].(string)
	var run jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", projectKey), jmap{"name": "sprint 1", "caseKeys": []string{caseKey}}, 201, &run)
	runKey, _ := run["key"].(string)
	var items struct{ Items []jmap }
	callAs(t, handler, admin, "GET", fmt.Sprintf("/api/v1/runs/%s/items", runKey), nil, 200, &items)
	itemID, _ := items.Items[0]["id"].(string)

	var viewer jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "step-viewer@example.com", "password": "correcthorse"}, 201, &viewer)
	viewerID, _ := viewer["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+viewerID,
		jmap{"roleId": viewerRoleID}, 204, nil)
	viewerCookie := loginCookie(t, handler, "step-viewer@example.com", "correcthorse")

	var errBody jmap
	callAs(t, handler, viewerCookie, "PUT", fmt.Sprintf("/api/v1/items/%s/steps/0", itemID), jmap{"verdict": "pass"}, 403, &errBody)
}

// TestScenario_RecordResultAcceptsStepResultsField covers tasks.md 5.4: an
// end-to-end check that POST .../results accepts and echoes back an
// optional stepResults body field.
func TestScenario_RecordResultAcceptsStepResultsField(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "one", "steps": []jmap{{"action": "a"}, {"action": "b"}}}, 201, &c)

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	var items struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	itemID := items.Items[0].ID

	var result jmap
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", itemID),
		jmap{
			"actor": "ana", "verdict": "failed",
			"stepResults": []jmap{{"stepIndex": 0, "verdict": "pass"}, {"stepIndex": 1, "verdict": "failed"}},
		}, 201, &result)

	stepResults, ok := result["stepResults"].([]any)
	if !ok || len(stepResults) != 2 {
		t.Fatalf("result.stepResults = %+v, want 2 entries", result["stepResults"])
	}
}
