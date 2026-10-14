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

func TestScenario_TestPlanCoverageMatrixOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var rel struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.1"}, 201, &rel)
	var plan struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/releases/%s/plans", rel.Key), jmap{"name": "Cross-browser"}, 201, &plan)

	var login, logout struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "Login works"}, 201, &login)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/cases", p.Key), jmap{"title": "Logout works"}, 201, &logout)

	var chromeRun struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "Chrome run", "testPlanKey": plan.Key, "configuration": "Chrome", "caseKeys": []string{login.Key, logout.Key}},
		201, &chromeRun)
	var smokeRun struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "Smoke run", "testPlanKey": plan.Key, "caseKeys": []string{login.Key}},
		201, &smokeRun)

	var matrix struct {
		Configurations []struct {
			RunKey string
			Label  string
		}
		Cases []struct {
			CaseKey string
			Title   string
			Cells   map[string]struct {
				RunItemKey string
				Status     string
			}
		}
	}
	call(t, h, "GET", "/api/v1/plans/"+plan.Key+"/coverage-matrix", nil, 200, &matrix)

	if len(matrix.Configurations) != 2 {
		t.Fatalf("len(Configurations) = %d, want 2", len(matrix.Configurations))
	}
	labelByRunKey := map[string]string{}
	for _, c := range matrix.Configurations {
		labelByRunKey[c.RunKey] = c.Label
	}
	if labelByRunKey[chromeRun.Key] != "Chrome" {
		t.Errorf("chrome run label = %q, want %q", labelByRunKey[chromeRun.Key], "Chrome")
	}
	if labelByRunKey[smokeRun.Key] != "Smoke run" {
		t.Errorf("smoke run label = %q, want its Name %q", labelByRunKey[smokeRun.Key], "Smoke run")
	}

	if len(matrix.Cases) != 2 {
		t.Fatalf("len(Cases) = %d, want 2", len(matrix.Cases))
	}
	for _, row := range matrix.Cases {
		if row.CaseKey == logout.Key {
			if _, ok := row.Cells[chromeRun.Key]; !ok {
				t.Errorf("logout row missing cell for chrome run, which covers it")
			}
			if _, ok := row.Cells[smokeRun.Key]; ok {
				t.Errorf("logout row has a cell for smoke run, which doesn't cover it — want gap (absent)")
			}
		}
	}
}
