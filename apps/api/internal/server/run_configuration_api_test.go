package server_test

import (
	"fmt"
	"testing"
)

// API integration test for add-run-configurations (#129): a run's optional
// free-text configuration label round-trips through the create-run endpoint.

func TestScenario_CreateRunWithConfigurationOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var run struct {
		Key           string
		Configuration *string `json:"configuration"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "cross-browser", "configuration": "Firefox"}, 201, &run)
	if run.Configuration == nil || *run.Configuration != "Firefox" {
		t.Errorf("run.Configuration = %v, want %q", run.Configuration, "Firefox")
	}

	var plainRun struct {
		Configuration *string `json:"configuration"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "no config"}, 201, &plainRun)
	if plainRun.Configuration != nil {
		t.Errorf("plainRun.Configuration = %v, want nil", plainRun.Configuration)
	}
}
