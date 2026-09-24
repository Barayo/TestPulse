package server_test

import (
	"context"
	"log/slog"
	"net/http"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/server"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

// importJobServer builds a server with a real encryption key wired (import
// job credentials are always encrypted at rest, add-testrail-importer
// design.md D2) and a bootstrap admin's cookie ready.
func importJobServer(t *testing.T) (h http.Handler, admin string) {
	t.Helper()
	pool := testutil.Pool(t, "server")
	svc := service.New(store.New(pool)).WithEncryptionKey("a-real-encryption-key")
	handler := server.New(slog.New(slog.DiscardHandler), ok{}, svc, 5, 5, nil, true)
	if err := svc.BootstrapAdmin(context.Background(), "importer-admin@example.com", "correcthorse"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	admin = loginCookie(t, handler, "importer-admin@example.com", "correcthorse")
	return handler, admin
}

// scopedImporterToken creates a project-scoped agent token with the
// Project Admin role (which carries manageProject) — the same shape a
// real tools/import-connector deployment authenticates with (design.md D4).
func scopedImporterToken(t *testing.T, h http.Handler, admin, projectID string) string {
	t.Helper()
	roleID := roleIDByName(t, h, admin, "Project Admin")
	var created jmap
	callAs(t, h, admin, "POST", "/api/v1/tokens",
		jmap{"name": "import-connector", "projectId": projectID, "roleId": roleID}, 201, &created)
	full, _ := created["token"].(string)
	if full == "" {
		t.Fatalf("created token missing full value: %+v", created)
	}
	return "Bearer " + full
}

func TestScenario_CreateImportJobRequiresManageProjectOverHTTP(t *testing.T) {
	h, admin := importJobServer(t)
	var p jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var member jmap
	callAs(t, h, admin, "POST", "/api/v1/users",
		jmap{"email": "tester@example.com", "password": "correcthorse"}, 201, &member)
	userID, _ := member["id"].(string)
	testerRoleID := roleIDByName(t, h, admin, "Tester")
	callAs(t, h, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+userID,
		jmap{"roleId": testerRoleID}, 204, nil)
	testerCookie := loginCookie(t, h, "tester@example.com", "correcthorse")

	var errBody jmap
	callAs(t, h, testerCookie, "POST", "/api/v1/projects/"+projectKey+"/import-jobs",
		jmap{"source": "testrail", "mode": "dry_run", "credentials": jmap{"apiKey": "x"}}, 403, &errBody)
}

func TestScenario_CreateAndPollImportJobOverHTTP(t *testing.T) {
	h, admin := importJobServer(t)
	var p jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var job jmap
	callAs(t, h, admin, "POST", "/api/v1/projects/"+projectKey+"/import-jobs",
		jmap{"source": "testrail", "mode": "dry_run", "credentials": jmap{"apiKey": "super-secret"}}, 201, &job)
	if job["status"] != "pending" || job["source"] != "testrail" {
		t.Fatalf("created job = %+v, want pending/testrail", job)
	}
	if _, leaked := job["credentials"]; leaked {
		t.Errorf("created job response leaked credentials: %+v", job)
	}
	jobID, _ := job["id"].(string)

	var polled jmap
	callAs(t, h, admin, "GET", "/api/v1/projects/"+projectKey+"/import-jobs/"+jobID, nil, 200, &polled)
	if polled["id"] != jobID || polled["status"] != "pending" {
		t.Fatalf("polled job = %+v, want matching pending job", polled)
	}
	if _, leaked := polled["credentials"]; leaked {
		t.Errorf("polled job response leaked credentials: %+v", polled)
	}
}

// #IDOR (found by automated security review): GetImportJob's route was
// gated by requirePermission(PermManageProject, projectIDParam) — which
// checks the caller has manageProject on the URL's own projectKey, but
// never confirms jobId actually belongs to that project. A caller with
// manageProject on project A could fetch project B's job (including its
// report) by putting B's jobId under A's URL. Fixed by resolving the
// permission check from the job's own project (projectIDFromImportJob),
// matching the PATCH route's existing resolver.
func TestScenario_GetImportJobRejectsCrossProjectJobID(t *testing.T) {
	h, admin := importJobServer(t)
	var pA, pB jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "Project A"}, 201, &pA)
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "Project B"}, 201, &pB)
	projectAKey, _ := pA["key"].(string)
	projectBKey, _ := pB["key"].(string)

	var jobB jmap
	callAs(t, h, admin, "POST", "/api/v1/projects/"+projectBKey+"/import-jobs",
		jmap{"source": "testrail", "mode": "real", "credentials": jmap{"apiKey": "project-b-secret"}}, 201, &jobB)
	jobBID, _ := jobB["id"].(string)

	var member jmap
	callAs(t, h, admin, "POST", "/api/v1/users",
		jmap{"email": "a-admin@example.com", "password": "correcthorse"}, 201, &member)
	userID, _ := member["id"].(string)
	projectAdminRoleID := roleIDByName(t, h, admin, "Project Admin")
	callAs(t, h, admin, "PUT", "/api/v1/projects/"+projectAKey+"/members/"+userID,
		jmap{"roleId": projectAdminRoleID}, 204, nil)
	memberCookie := loginCookie(t, h, "a-admin@example.com", "correcthorse")

	// Project Admin on A only, never B — must not see B's job by putting
	// B's jobId under A's URL.
	var errBody jmap
	callAs(t, h, memberCookie, "GET", "/api/v1/projects/"+projectAKey+"/import-jobs/"+jobBID, nil, 403, &errBody)
}

func TestScenario_ClaimPendingImportJobOverHTTPScopedToProjectAndSource(t *testing.T) {
	h, admin := importJobServer(t)
	var pA, pB jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "Project A"}, 201, &pA)
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "Project B"}, 201, &pB)
	projectAID, _ := pA["id"].(string)
	projectAKey, _ := pA["key"].(string)
	projectBKey, _ := pB["key"].(string)

	var jobA jmap
	callAs(t, h, admin, "POST", "/api/v1/projects/"+projectAKey+"/import-jobs",
		jmap{"source": "testrail", "mode": "real", "credentials": jmap{"apiKey": "project-a-secret"}}, 201, &jobA)
	var jobB jmap
	callAs(t, h, admin, "POST", "/api/v1/projects/"+projectBKey+"/import-jobs",
		jmap{"source": "testrail", "mode": "real", "credentials": jmap{"apiKey": "project-b-secret"}}, 201, &jobB)

	agentToken := scopedImporterToken(t, h, admin, projectAID)

	var claimed jmap
	callAs(t, h, agentToken, "GET", "/api/v1/import-jobs?status=pending&source=testrail", nil, 200, &claimed)
	claimedJob, _ := claimed["job"].(map[string]any)
	if claimedJob == nil || claimedJob["projectId"] != projectAID {
		t.Fatalf("claimed = %+v, want project A's job", claimed)
	}
	creds, _ := claimed["credentials"].(map[string]any)
	if creds["apiKey"] != "project-a-secret" {
		t.Errorf("claimed credentials = %+v, want project A's decrypted apiKey", creds)
	}

	// Nothing more pending for project A — never reaches into project B's.
	callAs(t, h, agentToken, "GET", "/api/v1/import-jobs?status=pending&source=testrail", nil, 204, nil)
}

func TestScenario_ClaimPendingImportJobRejectsHumanSessionOverHTTP(t *testing.T) {
	h, admin := importJobServer(t)
	var p jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)
	callAs(t, h, admin, "POST", "/api/v1/projects/"+projectKey+"/import-jobs",
		jmap{"source": "testrail", "mode": "real", "credentials": jmap{"apiKey": "x"}}, 201, nil)

	var errBody jmap
	callAs(t, h, admin, "GET", "/api/v1/import-jobs?status=pending&source=testrail", nil, 401, &errBody)
}

func TestScenario_ListImportJobsRequiresManageProject(t *testing.T) {
	h, admin := importJobServer(t)
	var p jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var member jmap
	callAs(t, h, admin, "POST", "/api/v1/users",
		jmap{"email": "tester@example.com", "password": "correcthorse"}, 201, &member)
	userID, _ := member["id"].(string)
	testerRoleID := roleIDByName(t, h, admin, "Tester")
	callAs(t, h, admin, "PUT", "/api/v1/projects/"+projectKey+"/members/"+userID,
		jmap{"roleId": testerRoleID}, 204, nil)
	testerCookie := loginCookie(t, h, "tester@example.com", "correcthorse")

	var errBody jmap
	callAs(t, h, testerCookie, "GET", "/api/v1/projects/"+projectKey+"/import-jobs", nil, 403, &errBody)
}

func TestScenario_ListImportJobsReturnsAllJobsForProjectNewestFirst(t *testing.T) {
	h, admin := importJobServer(t)
	var p jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectKey, _ := p["key"].(string)

	var dryRun jmap
	callAs(t, h, admin, "POST", "/api/v1/projects/"+projectKey+"/import-jobs",
		jmap{"source": "testrail", "mode": "dry_run", "credentials": jmap{"apiKey": "x"}}, 201, &dryRun)
	var real jmap
	callAs(t, h, admin, "POST", "/api/v1/projects/"+projectKey+"/import-jobs",
		jmap{"source": "testrail", "mode": "real", "credentials": jmap{"apiKey": "x"}}, 201, &real)

	var list []jmap
	callAs(t, h, admin, "GET", "/api/v1/projects/"+projectKey+"/import-jobs", nil, 200, &list)
	if len(list) != 2 {
		t.Fatalf("len(list) = %d, want 2", len(list))
	}
	if list[0]["id"] != real["id"] || list[1]["id"] != dryRun["id"] {
		t.Errorf("list = %+v, want [real, dryRun] (newest first)", list)
	}
}

func TestScenario_PatchImportJobProgressAndCompletionOverHTTP(t *testing.T) {
	h, admin := importJobServer(t)
	var p jmap
	callAs(t, h, admin, "POST", "/api/v1/projects", jmap{"name": "QA"}, 201, &p)
	projectID, _ := p["id"].(string)
	projectKey, _ := p["key"].(string)

	var job jmap
	callAs(t, h, admin, "POST", "/api/v1/projects/"+projectKey+"/import-jobs",
		jmap{"source": "testrail", "mode": "real", "credentials": jmap{"apiKey": "x"}}, 201, &job)
	jobID, _ := job["id"].(string)

	agentToken := scopedImporterToken(t, h, admin, projectID)
	var claimed jmap
	callAs(t, h, agentToken, "GET", "/api/v1/import-jobs?status=pending&source=testrail", nil, 200, &claimed)

	callAs(t, h, agentToken, "PATCH", "/api/v1/import-jobs/"+jobID,
		jmap{"progressCurrent": 187, "progressTotal": 340}, 204, nil)

	var polled jmap
	callAs(t, h, admin, "GET", "/api/v1/projects/"+projectKey+"/import-jobs/"+jobID, nil, 200, &polled)
	if polled["progressCurrent"] != float64(187) || polled["progressTotal"] != float64(340) {
		t.Fatalf("progress = %+v, want 187/340", polled)
	}

	callAs(t, h, agentToken, "PATCH", "/api/v1/import-jobs/"+jobID,
		jmap{"status": "succeeded", "report": jmap{"counts": jmap{"cases": 340}, "unmapped": []string{"Automation Type"}}}, 204, nil)

	callAs(t, h, admin, "GET", "/api/v1/projects/"+projectKey+"/import-jobs/"+jobID, nil, 200, &polled)
	if polled["status"] != "succeeded" {
		t.Fatalf("status = %+v, want succeeded", polled)
	}
	report, _ := polled["report"].(map[string]any)
	counts, _ := report["counts"].(map[string]any)
	if counts["cases"] != float64(340) {
		t.Errorf("report = %+v, want counts.cases=340", report)
	}
}
