package server_test

import (
	"fmt"
	"testing"
)

// HTTP-level scenarios for link-result-actor-to-identity —
// openspec/changes/link-result-actor-to-identity/specs/test-execution/spec.md.

func TestScenario_RecordResultOverrideKeepsRealActorLink(t *testing.T) {
	h := apiServer(t)
	var p, c struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "one"}, 201, &c)

	var run struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	var items struct{ Items []struct{ ID string } }
	call(t, h, "GET", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), nil, 200, &items)
	itemID := items.Items[0].ID

	var recorded struct {
		Actor      string `json:"actor"`
		ActorKind  string `json:"actorKind"`
		ActorRefID string `json:"actorRefId"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/items/%s/results", itemID),
		jmap{"actor": "Manual Tester", "verdict": "pass"}, 201, &recorded)
	if recorded.Actor != "Manual Tester" {
		t.Errorf("Actor = %q, want the override Manual Tester", recorded.Actor)
	}
	if recorded.ActorKind != "user" || recorded.ActorRefID == "" {
		t.Errorf("ActorKind/ActorRefID = %q/%q, want user/<non-empty> even with an override display name", recorded.ActorKind, recorded.ActorRefID)
	}

	// GET .../results exposes the same fields to any authenticated caller.
	var results []struct {
		Actor      string `json:"actor"`
		ActorKind  string `json:"actorKind"`
		ActorRefID string `json:"actorRefId"`
	}
	call(t, h, "GET", fmt.Sprintf("/api/v1/items/%s/results", itemID), nil, 200, &results)
	if len(results) != 1 || results[0].Actor != "Manual Tester" || results[0].ActorKind != "user" || results[0].ActorRefID == "" {
		t.Errorf("results = %+v, want one entry with override actor and real actorKind/actorRefId", results)
	}
}
