package server_test

import (
	"fmt"
	"testing"
)

// API integration tests for introduce-release-test-plan: Release and Test
// Plan as new, optional entities between Project and Run.

func TestScenario_CreateReleaseOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	var rel struct {
		Key, Name, Status string
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key),
		jmap{"name": "2026.1", "description": "First GA"}, 201, &rel)
	if rel.Key == "" || rel.Name != "2026.1" || rel.Status != "active" {
		t.Errorf("created release = %+v, want key set, name 2026.1, status active", rel)
	}

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{}, 400, nil)
}

func TestScenario_ListTestPlansAcrossProjectReleasesOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var rel1, rel2 struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.1"}, 201, &rel1)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.2"}, 201, &rel2)
	call(t, h, "POST", fmt.Sprintf("/api/v1/releases/%s/plans", rel1.Key), jmap{"name": "iOS"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/releases/%s/plans", rel2.Key), jmap{"name": "Web"}, 201, nil)

	var plans []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/plans", p.Key), nil, 200, &plans)
	if len(plans) != 2 {
		t.Fatalf("plans across project = %d, want 2", len(plans))
	}
}

func TestScenario_ListAndFilterReleasesOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.1"}, 201, nil)
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2025.9", "status": "eol"}, 201, nil)

	var all []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), nil, 200, &all)
	if len(all) != 2 {
		t.Fatalf("all releases = %d, want 2", len(all))
	}

	var active []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/projects/%s/releases?status=active", p.Key), nil, 200, &active)
	if len(active) != 1 {
		t.Errorf("active releases = %d, want 1", len(active))
	}
}

func TestScenario_UpdateAndDeleteReleaseOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var rel struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.1"}, 201, &rel)

	var updated struct{ Status string }
	call(t, h, "PUT", "/api/v1/releases/"+rel.Key, jmap{"name": "2026.1", "status": "maintained"}, 200, &updated)
	if updated.Status != "maintained" {
		t.Errorf("Status after update = %q, want maintained", updated.Status)
	}

	call(t, h, "DELETE", "/api/v1/releases/"+rel.Key, nil, 204, nil)
	call(t, h, "GET", "/api/v1/releases/"+rel.Key, nil, 404, nil)
}

func TestScenario_CreateTestPlanOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var rel struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.1"}, 201, &rel)

	var plan struct {
		Key        string
		Name       string
		ReleaseKey string `json:"releaseKey"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/releases/%s/plans", rel.Key), jmap{"name": "iOS"}, 201, &plan)
	if plan.Key == "" || plan.Name != "iOS" {
		t.Errorf("created test plan = %+v", plan)
	}

	var plans []jmap
	call(t, h, "GET", fmt.Sprintf("/api/v1/releases/%s/plans", rel.Key), nil, 200, &plans)
	if len(plans) != 1 {
		t.Errorf("plans list = %d, want 1", len(plans))
	}

	call(t, h, "POST", fmt.Sprintf("/api/v1/releases/%s/plans", rel.Key), jmap{}, 400, nil)
}

func TestScenario_DeleteTestPlanRejectedWithRunsOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var rel struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.1"}, 201, &rel)
	var plan struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/releases/%s/plans", rel.Key), jmap{"name": "iOS"}, 201, &plan)

	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "smoke", "testPlanKey": plan.Key}, 201, nil)

	call(t, h, "DELETE", "/api/v1/plans/"+plan.Key, nil, 409, nil)
	// Releases with test plans are likewise protected.
	call(t, h, "DELETE", "/api/v1/releases/"+rel.Key, nil, 409, nil)
}

func TestScenario_CreateRunScopedToTestPlanOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var rel struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.1"}, 201, &rel)
	var plan struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/releases/%s/plans", rel.Key), jmap{"name": "iOS"}, 201, &plan)

	var run struct {
		Key         string
		TestPlanKey *string `json:"testPlanKey"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key),
		jmap{"name": "smoke", "testPlanKey": plan.Key}, 201, &run)
	if run.TestPlanKey == nil || *run.TestPlanKey != plan.Key {
		t.Errorf("run.TestPlanKey = %v, want %q", run.TestPlanKey, plan.Key)
	}

	var runsByPlan []jmap
	call(t, h, "GET", "/api/v1/plans/"+plan.Key+"/runs", nil, 200, &runsByPlan)
	if len(runsByPlan) != 1 {
		t.Errorf("runs by plan = %d, want 1", len(runsByPlan))
	}

	var plainRun struct {
		TestPlanKey *string `json:"testPlanKey"`
	}
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/runs", p.Key), jmap{"name": "no plan"}, 201, &plainRun)
	if plainRun.TestPlanKey != nil {
		t.Errorf("plainRun.TestPlanKey = %v, want nil", plainRun.TestPlanKey)
	}
}

func TestScenario_ReleaseAndTestPlanRollupOverHTTP(t *testing.T) {
	h := apiServer(t)
	var p struct{ Key string }
	call(t, h, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	var rel struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", p.Key), jmap{"name": "2026.1"}, 201, &rel)
	var plan struct{ Key string }
	call(t, h, "POST", fmt.Sprintf("/api/v1/releases/%s/plans", rel.Key), jmap{"name": "iOS"}, 201, &plan)

	var planRollup struct {
		RunCount int
		PassRate *int `json:"passRate"`
	}
	call(t, h, "GET", "/api/v1/plans/"+plan.Key+"/rollup", nil, 200, &planRollup)
	if planRollup.RunCount != 0 || planRollup.PassRate != nil {
		t.Errorf("empty plan rollup = %+v, want zero runs and nil pass rate", planRollup)
	}

	var relRollup struct {
		RunCount int
		PassRate *int `json:"passRate"`
	}
	call(t, h, "GET", "/api/v1/releases/"+rel.Key+"/rollup", nil, 200, &relRollup)
	if relRollup.RunCount != 0 || relRollup.PassRate != nil {
		t.Errorf("empty release rollup = %+v, want zero runs and nil pass rate", relRollup)
	}
}

// TestScenario_CreateReleaseRequiresManageProjectOverHTTP covers task 4.2: a
// role without manageProject (Tester) gets 403 creating/editing/deleting a
// Release or Test Plan, not a silent success — mirroring
// TestScenario_MoveFolderRequiresSectionEditOverHTTP's pattern.
func TestScenario_CreateReleaseRequiresManageProjectOverHTTP(t *testing.T) {
	handler, _ := apiServerWithAdmin(t, "admin@example.com", "correcthorse")
	admin := loginCookie(t, handler, "admin@example.com", "correcthorse")
	testerRoleID := roleIDByName(t, handler, admin, "Tester")

	var p jmap
	callAs(t, handler, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var user jmap
	callAs(t, handler, admin, "POST", "/api/v1/users",
		jmap{"email": "tester-release@example.com", "password": "correcthorse"}, 201, &user)
	userID, _ := user["id"].(string)
	callAs(t, handler, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+userID,
		jmap{"roleId": testerRoleID}, 204, nil)
	testerCookie := loginCookie(t, handler, "tester-release@example.com", "correcthorse")

	callAs(t, handler, testerCookie, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", projectKey),
		jmap{"name": "2026.1"}, 403, nil)

	var rel jmap
	callAs(t, handler, admin, "POST", fmt.Sprintf("/api/v1/projects/%s/releases", projectKey),
		jmap{"name": "2026.1"}, 201, &rel)
	releaseKey, _ := rel["key"].(string)

	// A Tester can read the release (has `read`) but not edit or delete it.
	callAs(t, handler, testerCookie, "GET", "/api/v1/releases/"+releaseKey, nil, 200, nil)
	callAs(t, handler, testerCookie, "PUT", "/api/v1/releases/"+releaseKey, jmap{"name": "2026.1", "status": "eol"}, 403, nil)
	callAs(t, handler, testerCookie, "DELETE", "/api/v1/releases/"+releaseKey, nil, 403, nil)
	callAs(t, handler, testerCookie, "POST", "/api/v1/releases/"+releaseKey+"/plans", jmap{"name": "iOS"}, 403, nil)
}
