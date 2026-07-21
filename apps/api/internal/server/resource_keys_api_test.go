package server_test

import (
	"fmt"
	"testing"
)

// add-human-readable-keys: path params and the identifier-carrying request
// body fields for projects/cases/runs/suites resolve by key, not id, and an
// unrecognized key 404s the same way an unresolved id does today.

func TestScenario_ResourcesAreAddressedByKey(t *testing.T) {
	h := apiServer(t)

	var p struct {
		ID, Key string
	}
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "Login Service"}, 201, &p)
	if p.Key != "LS" {
		t.Fatalf("project Key = %q, want %q", p.Key, "LS")
	}

	// Project fetched by key, not id.
	var got struct{ Key string }
	call(t, h, "GET", "/api/v1/projects/"+p.Key, nil, 200, &got)
	if got.Key != p.Key {
		t.Errorf("GET by key returned %+v", got)
	}

	var c struct{ ID, Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key),
		jmap{"title": "Login works"}, 201, &c)
	if c.Key != "LS-1" {
		t.Fatalf("case Key = %q, want %q", c.Key, "LS-1")
	}
	call(t, h, "GET", "/api/v1/cases/"+c.Key, nil, 200, nil)

	var suite struct{ ID, Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/suites", p.Key), jmap{"name": "smoke"}, 201, &suite)
	if suite.Key != "LS-S1" {
		t.Fatalf("suite Key = %q, want %q", suite.Key, "LS-S1")
	}
	// Suite membership addressed by case key, not id.
	call(t, h, "PUT", fmt.Sprintf("/api/v1/suites/%s/cases/%s", suite.Key, c.Key), nil, 204, nil)

	var run struct{ ID, Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "sprint 1", "caseKeys": []string{c.Key}}, 201, &run)
	if run.Key != "LS-R1" {
		t.Fatalf("run Key = %q, want %q", run.Key, "LS-R1")
	}
	call(t, h, "GET", "/api/v1/runs/"+run.Key, nil, 200, nil)

	// addRunItem's body identifies the case by key too.
	var c2 struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "second case"}, 201, &c2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/runs/%s/items", run.Key), jmap{"caseKey": c2.Key}, 201, nil)

	// Run-from-suite creation via suiteKey.
	var run2 struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "from suite", "suiteKey": suite.Key}, 201, &run2)
	if run2.Key != "LS-R2" {
		t.Errorf("run2 Key = %q, want %q", run2.Key, "LS-R2")
	}
}

func TestScenario_UnknownKeyIsNotFound(t *testing.T) {
	h := apiServer(t)
	call(t, h, "GET", "/api/v1/projects/NOPE", nil, 404, nil)
	call(t, h, "GET", "/api/v1/cases/NOPE-1", nil, 404, nil)
	call(t, h, "GET", "/api/v1/runs/NOPE-R1", nil, 404, nil)
	call(t, h, "PUT", "/api/v1/suites/NOPE-S1/cases/NOPE-1", nil, 404, nil)
}
