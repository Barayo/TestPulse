package mcp_test

import (
	"context"
	"strings"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/mcp"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// --- Requirement: MCP authentication ---

func TestMCPAuthenticationRejectsMissingToken(t *testing.T) {
	ts, _ := testMCPServer(t)
	_, err := connectMCP(t, ts, "")
	if err == nil {
		t.Fatal("connecting with no bearer token succeeded, want an error")
	}
}

func TestMCPAuthenticationRejectsInvalidToken(t *testing.T) {
	ts, _ := testMCPServer(t)
	_, err := connectMCP(t, ts, "not-a-real-token")
	if err == nil {
		t.Fatal("connecting with an invalid bearer token succeeded, want an error")
	}
}

func TestMCPAuthenticationAcceptsValidUnscopedToken(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-unscoped-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "unscoped-agent")

	session := mustConnectMCP(t, ts, token)
	var out mcp.ListProjectsOutput
	callTool(t, session, "list_projects", struct{}{}, &out)
}

// --- Requirement: upsert_test_case tool ---

func TestMCPUpsertTestCaseCreatesThenEdits(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-case-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "case-agent")
	project, err := svc.CreateProject(context.Background(), service.ProjectInput{Name: "MCP Case Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)

	var created domain.TestCase
	callTool(t, session, "upsert_test_case", map[string]any{
		"projectKey": project.Key,
		"title":      "Login succeeds with valid credentials",
		"priority":   "high",
	}, &created)
	if created.Key == "" || created.Content.Title != "Login succeeds with valid credentials" {
		t.Fatalf("created case = %+v, want a real key and matching title", created)
	}

	var edited domain.TestCase
	callTool(t, session, "upsert_test_case", map[string]any{
		"caseKey":  created.Key,
		"title":    "Login succeeds with valid credentials (edited)",
		"priority": "high",
	}, &edited)
	if edited.CurrentVersion <= created.CurrentVersion {
		t.Errorf("edited.CurrentVersion = %d, want > %d (a new immutable version)", edited.CurrentVersion, created.CurrentVersion)
	}
	if edited.Content.Title != "Login succeeds with valid credentials (edited)" {
		t.Errorf("edited title = %q", edited.Content.Title)
	}
}

// TestMCPUpsertTestCaseCreateWithIdempotencyKeyReturnsOriginalOnRetry
// covers add-mcp-idempotency-keys: a retried create with the same key
// returns the original case, not a second one.
func TestMCPUpsertTestCaseCreateWithIdempotencyKeyReturnsOriginalOnRetry(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-case-idem-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "case-idem-agent")
	project, err := svc.CreateProject(context.Background(), service.ProjectInput{Name: "MCP Case Idempotency Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)

	var first domain.TestCase
	callTool(t, session, "upsert_test_case", map[string]any{
		"projectKey":     project.Key,
		"title":          "Idempotent create",
		"priority":       "high",
		"idempotencyKey": "case-key-1",
	}, &first)

	var second domain.TestCase
	callTool(t, session, "upsert_test_case", map[string]any{
		"projectKey":     project.Key,
		"title":          "Idempotent create",
		"priority":       "high",
		"idempotencyKey": "case-key-1",
	}, &second)

	if second.Key != first.Key {
		t.Errorf("retried create returned a different case: first = %q, second = %q", first.Key, second.Key)
	}

	cases, err := svc.ListCases(context.Background(), project.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if len(cases) != 1 {
		t.Errorf("ListCases = %d cases, want 1 (retry must not double-create)", len(cases))
	}
}

// TestMCPUpsertTestCaseFailedCreateIsRetryableWithSameKey covers design.md
// D2: only successful results are cached, so a failed attempt is always
// safe to retry with the same key.
func TestMCPUpsertTestCaseFailedCreateIsRetryableWithSameKey(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-case-idem-fail-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "case-idem-fail-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Case Idempotency Failure Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)

	// First attempt: no title, expect a validation failure.
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "upsert_test_case", Arguments: map[string]any{
		"projectKey": project.Key, "idempotencyKey": "case-key-retry",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("upsert_test_case with no title succeeded, want a validation error")
	}

	// Retry with the same key, now with valid fields: must succeed normally.
	var created domain.TestCase
	callTool(t, session, "upsert_test_case", map[string]any{
		"projectKey": project.Key, "title": "Now valid", "priority": "high", "idempotencyKey": "case-key-retry",
	}, &created)
	if created.Key == "" {
		t.Fatalf("retry after a failed attempt did not create a case: %+v", created)
	}
}

func TestMCPUpsertTestCaseDeniedWithoutPermission(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-case-noperm-admin@example.com"))
	owner, err := svc.CreateUser(ctx, "mcp-case-noperm-owner@example.com", "correcthorse1", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP No-Perm Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	// A role that can read but not create cases.
	readOnlyToken := mustCreateScopedToken(t, svc, admin, actorForUser(owner), project.ID, domain.Role{Name: "Read Only (mcp test)", CanRead: true})

	session := mustConnectMCP(t, ts, readOnlyToken)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "upsert_test_case", Arguments: map[string]any{
		"projectKey": project.Key, "title": "Should be denied",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("upsert_test_case with a read-only scoped token succeeded, want a permission error")
	}
}

func TestMCPUpsertTestCaseResolvesGroupKeyStep(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-case-groupref-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "case-groupref-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Case GroupRef Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	group, err := svc.CreateStepGroup(ctx, project.ID, "Log in as admin", []domain.Step{
		{Action: "open login page"}, {Action: "enter admin credentials"},
	})
	if err != nil {
		t.Fatalf("CreateStepGroup: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var created domain.TestCase
	callTool(t, session, "upsert_test_case", map[string]any{
		"projectKey": project.Key,
		"title":      "Admin can view settings",
		"priority":   "medium",
		"steps": []map[string]any{
			{"groupKey": group.Key},
			{"action": "open settings"},
		},
	}, &created)
	if len(created.Content.Steps) != 3 {
		t.Fatalf("Steps = %d, want 3 (2 from the group + 1 own step)", len(created.Content.Steps))
	}
	if created.Content.Steps[0].Action != "open login page" {
		t.Errorf("Steps[0] = %+v, want the group's first step", created.Content.Steps[0])
	}
}

// --- Requirement: upsert_step_group tool ---

func TestMCPUpsertStepGroupCreatesThenEdits(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-stepgroup-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "stepgroup-agent")
	project, err := svc.CreateProject(context.Background(), service.ProjectInput{Name: "MCP StepGroup Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)

	var created domain.StepGroup
	callTool(t, session, "upsert_step_group", map[string]any{
		"projectKey": project.Key,
		"name":       "Log in as admin",
		"steps":      []map[string]any{{"action": "open login page"}},
	}, &created)
	if created.Key == "" || created.Name != "Log in as admin" || len(created.Steps) != 1 {
		t.Fatalf("created = %+v", created)
	}

	var edited domain.StepGroup
	callTool(t, session, "upsert_step_group", map[string]any{
		"groupKey": created.Key,
		"name":     "Log in as admin (edited)",
		"steps":    []map[string]any{{"action": "a"}, {"action": "b"}},
	}, &edited)
	if edited.ID != created.ID {
		t.Errorf("edited.ID = %q, want %q (edit in place, not a duplicate)", edited.ID, created.ID)
	}
	if edited.Name != "Log in as admin (edited)" || len(edited.Steps) != 2 {
		t.Fatalf("edited = %+v", edited)
	}
}

func TestMCPUpsertStepGroupDeniedWithoutManageProject(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-stepgroup-noperm-admin@example.com"))
	owner, err := svc.CreateUser(ctx, "mcp-stepgroup-noperm-owner@example.com", "correcthorse1", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP StepGroup No-Perm Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	readOnlyToken := mustCreateScopedToken(t, svc, admin, actorForUser(owner), project.ID, domain.Role{Name: "Read Only (mcp stepgroup test)", CanRead: true})

	session := mustConnectMCP(t, ts, readOnlyToken)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "upsert_step_group", Arguments: map[string]any{
		"projectKey": project.Key, "name": "Should be denied", "steps": []map[string]any{{"action": "a"}},
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("upsert_step_group with a read-only scoped token succeeded, want a permission error")
	}
}

// --- Requirement: upsert_test_suite tool ---

func TestMCPUpsertTestSuiteCreates(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suite-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "suite-agent")
	project, err := svc.CreateProject(context.Background(), service.ProjectInput{Name: "MCP Suite Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var suite domain.Suite
	callTool(t, session, "upsert_test_suite", map[string]any{
		"projectKey": project.Key, "name": "Regression suite",
	}, &suite)
	if suite.Key == "" || suite.Name != "Regression suite" {
		t.Fatalf("created suite = %+v", suite)
	}
}

func TestMCPUpsertTestSuiteRenamesExisting(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suite-rename-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "suite-rename-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite Rename Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "Original name")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var renamed domain.Suite
	callTool(t, session, "upsert_test_suite", map[string]any{
		"suiteKey": suite.Key, "name": "Renamed suite",
	}, &renamed)
	if renamed.Key != suite.Key || renamed.Name != "Renamed suite" {
		t.Fatalf("renamed suite = %+v", renamed)
	}
}

func TestMCPUpsertTestSuiteDeniedWithoutPermission(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suite-noperm-admin@example.com"))
	owner, err := svc.CreateUser(ctx, "mcp-suite-noperm-owner@example.com", "correcthorse1", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite No-Perm Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	readOnlyToken := mustCreateScopedToken(t, svc, admin, actorForUser(owner), project.ID, domain.Role{Name: "Suite Read Only (mcp test)", CanRead: true})

	session := mustConnectMCP(t, ts, readOnlyToken)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "upsert_test_suite", Arguments: map[string]any{
		"projectKey": project.Key, "name": "Should be denied",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("upsert_test_suite with a read-only scoped token succeeded, want a permission error")
	}
}

// --- Requirement: bulk_add_cases tool ---

func TestMCPBulkAddCasesCreatesAllInOneCall(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-bulk-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "bulk-agent")
	project, err := svc.CreateProject(context.Background(), service.ProjectInput{Name: "MCP Bulk Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out mcp.BulkAddCasesOutput
	callTool(t, session, "bulk_add_cases", map[string]any{
		"projectKey": project.Key,
		"cases": []map[string]any{
			{"title": "Case one", "priority": "high"},
			{"title": "Case two", "priority": "medium"},
			{"title": "Case three", "priority": "low"},
		},
	}, &out)
	if len(out.Cases) != 3 {
		t.Fatalf("created %d cases, want 3", len(out.Cases))
	}
}

func TestMCPBulkAddCasesRollsBackOnInvalidCase(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-bulk-rollback-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "bulk-rollback-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Bulk Rollback Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "bulk_add_cases", Arguments: map[string]any{
		"projectKey": project.Key,
		"cases": []map[string]any{
			{"title": "Valid case", "priority": "high"},
			{"title": "", "priority": "high"}, // invalid: empty title
		},
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("bulk_add_cases with an invalid case succeeded, want an error")
	}

	all, err := svc.ListCases(ctx, project.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if len(all) != 0 {
		t.Fatalf("project has %d cases after a rejected batch, want 0", len(all))
	}
}

// TestMCPBulkAddCasesWithIdempotencyKeyReturnsOriginalOnRetry covers
// add-mcp-idempotency-keys: a retried batch with the same key returns the
// original cases, not a second batch.
func TestMCPBulkAddCasesWithIdempotencyKeyReturnsOriginalOnRetry(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-bulk-idem-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "bulk-idem-agent")
	project, err := svc.CreateProject(context.Background(), service.ProjectInput{Name: "MCP Bulk Idempotency Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	args := map[string]any{
		"projectKey": project.Key,
		"cases": []map[string]any{
			{"title": "Case one", "priority": "high"},
			{"title": "Case two", "priority": "medium"},
		},
		"idempotencyKey": "bulk-key-1",
	}

	var first mcp.BulkAddCasesOutput
	callTool(t, session, "bulk_add_cases", args, &first)

	var second mcp.BulkAddCasesOutput
	callTool(t, session, "bulk_add_cases", args, &second)

	if len(second.Cases) != len(first.Cases) || (len(first.Cases) > 0 && second.Cases[0].Key != first.Cases[0].Key) {
		t.Errorf("retried batch returned different cases: first = %+v, second = %+v", first.Cases, second.Cases)
	}

	all, err := svc.ListCases(context.Background(), project.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("ListCases = %d cases, want 2 (retry must not double-create)", len(all))
	}
}

// TestMCPCreateTestRunWithIdempotencyKeyReturnsOriginalOnRetry covers
// add-mcp-idempotency-keys: a retried call with the same key returns the
// original run, not a second one.
func TestMCPCreateTestRunWithIdempotencyKeyReturnsOriginalOnRetry(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-run-idem-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "run-idem-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Run Idempotency Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Runnable case", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	args := map[string]any{
		"projectKey": project.Key, "name": "Smoke run", "caseKeys": []string{c.Key}, "idempotencyKey": "run-key-1",
	}

	var first domain.Run
	callTool(t, session, "create_test_run", args, &first)

	var second domain.Run
	callTool(t, session, "create_test_run", args, &second)

	if second.Key != first.Key {
		t.Errorf("retried create returned a different run: first = %q, second = %q", first.Key, second.Key)
	}

	runs, err := svc.ListRuns(ctx, project.ID)
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 1 {
		t.Errorf("ListRuns = %d runs, want 1 (retry must not double-create)", len(runs))
	}
}

// --- Requirement: create_test_run tool + get_run_progress tool ---

func TestMCPCreateTestRunAndGetRunProgress(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-run-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "run-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Run Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Runnable case", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var run domain.Run
	callTool(t, session, "create_test_run", map[string]any{
		"projectKey": project.Key, "name": "Smoke run", "caseKeys": []string{c.Key},
	}, &run)
	if run.Key == "" {
		t.Fatalf("created run = %+v", run)
	}

	var progress domain.RunSummary
	callTool(t, session, "get_run_progress", map[string]any{"runKey": run.Key}, &progress)
	if progress.Total != 1 {
		t.Fatalf("progress.Total = %d, want 1", progress.Total)
	}
	if progress.Counts[domain.StatusPending] != 1 {
		t.Fatalf("progress.Counts = %+v, want 1 pending", progress.Counts)
	}
}

func TestMCPCreateTestRunFromSuiteAndTestPlan(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-run-suiteplan-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "run-suiteplan-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Run Suite+Plan Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Suite case", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "Run source suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	if err := svc.AddCaseToSuite(ctx, suite.ID, c.ID); err != nil {
		t.Fatalf("AddCaseToSuite: %v", err)
	}
	release, err := svc.CreateRelease(ctx, project.ID, "2026.1", "", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("CreateRelease: %v", err)
	}
	plan, err := svc.CreateTestPlan(ctx, project.ID, release.ID, "Regression plan", "")
	if err != nil {
		t.Fatalf("CreateTestPlan: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var run domain.Run
	callTool(t, session, "create_test_run", map[string]any{
		"projectKey": project.Key, "name": "Suite+Plan run", "suiteKey": suite.Key, "testPlanKey": plan.Key,
	}, &run)
	if run.Key == "" || run.TestPlanKey == nil || *run.TestPlanKey != plan.Key {
		t.Fatalf("run = %+v, want it scoped to test plan %q", run, plan.Key)
	}

	items, err := svc.RunItems(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items) != 1 || items[0].CaseKey != c.Key {
		t.Fatalf("run items = %+v, want the suite's one case", items)
	}
}

// --- Requirement: record_result tool + update_run_item_status tool ---

func TestMCPRecordResultThenUpdateRunItemStatus(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-result-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "result-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Result Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Result case", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := svc.CreateRun(ctx, project.ID, service.RunInput{Name: "Result run", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	session := mustConnectMCP(t, ts, token)

	var result domain.Result
	callTool(t, session, "record_result", map[string]any{
		"runKey": run.Key, "caseKey": c.Key, "verdict": "pass", "comment": "looks good",
	}, &result)
	if result.Verdict != domain.VerdictPass {
		t.Fatalf("result.Verdict = %q, want pass", result.Verdict)
	}

	items, err := svc.RunItems(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items) != 1 || items[0].CurrentStatus != domain.StatusPass {
		t.Fatalf("run items after record_result = %+v, want 1 item with status pass", items)
	}

	callTool(t, session, "update_run_item_status", map[string]any{
		"runKey": run.Key, "caseKey": c.Key, "status": "retest",
	}, nil)

	items, err = svc.RunItems(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("RunItems (after retest): %v", err)
	}
	if len(items) != 1 || items[0].CurrentStatus != domain.StatusRetest {
		t.Fatalf("run items after update_run_item_status = %+v, want status retest", items)
	}
}

// --- Requirement: search tool ---

func TestMCPSearchFindsMatchesAndRespectsProjectScoping(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-search-admin@example.com"))
	owner, err := svc.CreateUser(ctx, "mcp-search-owner@example.com", "correcthorse1", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	visible, err := svc.CreateProject(ctx, service.ProjectInput{Name: "Onboarding Flow"})
	if err != nil {
		t.Fatalf("CreateProject (visible): %v", err)
	}
	hidden, err := svc.CreateProject(ctx, service.ProjectInput{Name: "Onboarding Internal"})
	if err != nil {
		t.Fatalf("CreateProject (hidden): %v", err)
	}
	if _, err := svc.CreateSuite(ctx, visible.ID, "Onboarding regression"); err != nil {
		t.Fatalf("CreateSuite (visible): %v", err)
	}
	if _, err := svc.CreateSuite(ctx, hidden.ID, "Onboarding regression"); err != nil {
		t.Fatalf("CreateSuite (hidden): %v", err)
	}

	scopedToken := mustCreateScopedToken(t, svc, admin, actorForUser(owner), visible.ID, domain.Role{Name: "Search Scope Role (mcp test)", CanRead: true})

	session := mustConnectMCP(t, ts, scopedToken)
	var out mcp.SearchOutput
	callTool(t, session, "search", map[string]any{"query": "onboarding regression"}, &out)
	results := out.Results
	if len(results) != 1 {
		t.Fatalf("results = %+v, want exactly 1 (scoped to the visible project)", results)
	}
	if results[0].ProjectID != visible.ID {
		t.Errorf("result project = %q, want %q (hidden project must not leak to a scoped token)", results[0].ProjectID, visible.ID)
	}
}

// --- Requirement: get_details tool ---

func TestMCPGetDetailsFetchesByEntityTypeAndKey(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-getdetails-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "getdetails-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP GetDetails Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Detail case", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var fetched domain.TestCase
	callTool(t, session, "get_details", map[string]any{"entityType": "case", "key": c.Key}, &fetched)
	if fetched.Key != c.Key || fetched.Content.Title != "Detail case" {
		t.Fatalf("fetched case = %+v", fetched)
	}
}

func TestMCPGetDetailsFetchesEveryEntityType(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-getdetails-alltypes-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "getdetails-alltypes-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP GetDetails All Types Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "A suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	run, err := svc.CreateRun(ctx, project.ID, service.RunInput{Name: "A run"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	release, err := svc.CreateRelease(ctx, project.ID, "2026.1", "", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("CreateRelease: %v", err)
	}
	plan, err := svc.CreateTestPlan(ctx, project.ID, release.ID, "A plan", "")
	if err != nil {
		t.Fatalf("CreateTestPlan: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	for _, tc := range []struct{ entityType, key string }{
		{"project", project.Key},
		{"suite", suite.Key},
		{"run", run.Key},
		{"release", release.Key},
		{"testPlan", plan.Key},
	} {
		result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "get_details", Arguments: map[string]any{
			"entityType": tc.entityType, "key": tc.key,
		}})
		if err != nil {
			t.Fatalf("CallTool(%s): protocol error: %v", tc.entityType, err)
		}
		if result.IsError {
			t.Errorf("get_details(%s, %s) = error: %v", tc.entityType, tc.key, contentText(result))
		}
	}
}

func TestMCPGetDetailsRejectsUnknownEntityType(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-getdetails-unknown-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "getdetails-unknown-agent")

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "get_details", Arguments: map[string]any{
		"entityType": "widget", "key": "P1-W-1",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("get_details with an unknown entityType succeeded, want an error")
	}
}

func TestMCPGetDetailsRejectsTypeKeyMismatch(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-getdetails-mismatch-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "getdetails-mismatch-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP GetDetails Mismatch Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "A suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "get_details", Arguments: map[string]any{
		"entityType": "run", "key": suite.Key,
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("get_details with a suite's key as entityType run succeeded, want an error")
	}
}

// --- Requirement: list_projects tool ---

func TestMCPListProjectsScopedVsUnscoped(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-listprojects-admin@example.com"))
	owner, err := svc.CreateUser(ctx, "mcp-listprojects-owner@example.com", "correcthorse1", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	scoped, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP List Scoped Project"})
	if err != nil {
		t.Fatalf("CreateProject (scoped): %v", err)
	}
	if _, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP List Other Project"}); err != nil {
		t.Fatalf("CreateProject (other): %v", err)
	}
	scopedToken := mustCreateScopedToken(t, svc, admin, actorForUser(owner), scoped.ID, domain.Role{Name: "List Scope Role (mcp test)", CanRead: true})

	session := mustConnectMCP(t, ts, scopedToken)
	var out mcp.ListProjectsOutput
	callTool(t, session, "list_projects", struct{}{}, &out)
	projects := out.Projects
	if len(projects) != 1 || projects[0].ID != scoped.ID {
		t.Fatalf("projects = %+v, want exactly [%s]", projects, scoped.ID)
	}
}

// Not-found errors from a *ByKey lookup must name the entity kind and key,
// not propagate the store's bare "not found" — an agent otherwise has
// nothing to self-correct from (found via manual QA against a real client).
func TestMCPNotFoundErrorsNameTheEntityAndKey(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-notfound-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "notfound-agent")

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "get_details", Arguments: map[string]any{
		"entityType": "case", "key": "NOPE-C-999",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("get_details for a nonexistent case succeeded, want an error")
	}
	text := contentText(result)
	if !strings.Contains(text, "case") || !strings.Contains(text, "NOPE-C-999") {
		t.Errorf("error text = %q, want it to name the entity kind (case) and key (NOPE-C-999)", text)
	}
}

// Every tool must carry annotations honestly reflecting that this package
// registers no destructive tool at all (spec: "No delete operations via
// MCP") — real MCP clients (Claude Code, Claude Desktop) use these hints to
// decide whether a tool call needs extra confirmation.
func TestMCPToolsCarryAnnotations(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-annotations-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "annotations-agent")

	session := mustConnectMCP(t, ts, token)
	tools, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("ListTools: %v", err)
	}
	for _, tool := range tools.Tools {
		if tool.Annotations == nil {
			t.Errorf("tool %q has no annotations", tool.Name)
			continue
		}
		if tool.Annotations.DestructiveHint == nil || *tool.Annotations.DestructiveHint {
			t.Errorf("tool %q DestructiveHint = %v, want false (no delete tool exists)", tool.Name, tool.Annotations.DestructiveHint)
		}
	}
}

// --- Requirement: No delete operations via MCP ---

func TestMCPNoDeleteToolIsRegistered(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-nodelete-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "nodelete-agent")

	session := mustConnectMCP(t, ts, token)
	tools, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatalf("ListTools: %v", err)
	}
	if len(tools.Tools) == 0 {
		t.Fatal("ListTools returned no tools")
	}
	for _, tool := range tools.Tools {
		if containsDelete(tool.Name) {
			t.Errorf("tool %q looks like a delete operation, want none registered", tool.Name)
		}
	}
}

func containsDelete(name string) bool {
	for i := 0; i+6 <= len(name); i++ {
		if name[i:i+6] == "delete" {
			return true
		}
	}
	return false
}
