package mcp_test

import (
	"context"
	"slices"
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

// --- Requirement: MCP tool-surface versioning policy (#226) ---

func TestMCPServerReportsAStableSemverNotTheOldPlaceholder(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-version-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "version-check-agent")

	session := mustConnectMCP(t, ts, token)
	got := session.InitializeResult().ServerInfo.Version
	if got == "0.1.0" {
		t.Fatalf("serverInfo.version = %q, want it updated past the old never-bumped placeholder (docs/mcp-server.md#versioning-policy)", got)
	}
	if got != "1.0.0" {
		t.Errorf("serverInfo.version = %q, want 1.0.0 (see docs/mcp-server.md#versioning-policy)", got)
	}
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

// TestMCPUpsertTestCaseOutputHasNoRawProjectOrFolderID covers
// fix-mcp-output-id-leaks: the returned case identifies its project by
// key, not internal ID, and has no folder ID at all.
func TestMCPUpsertTestCaseOutputHasNoRawProjectOrFolderID(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-case-idleak-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "case-idleak-agent")
	project, err := svc.CreateProject(context.Background(), service.ProjectInput{Name: "MCP Case ID Leak Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out map[string]any
	callTool(t, session, "upsert_test_case", map[string]any{
		"projectKey": project.Key,
		"title":      "A case",
		"priority":   "high",
	}, &out)
	if out["projectKey"] != project.Key {
		t.Errorf("out[projectKey] = %v, want %q", out["projectKey"], project.Key)
	}
	if _, present := out["projectId"]; present {
		t.Errorf("out contains projectId: %+v", out)
	}
	if _, present := out["folderId"]; present {
		t.Errorf("out contains folderId: %+v", out)
	}
}

// TestMCPUpsertTestCaseResultHasReadableSummary covers
// add-mcp-human-readable-results: a successful call's text content is a
// human-readable summary, not the raw JSON dump.
func TestMCPUpsertTestCaseResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-case-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "case-readable-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Case Readable Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "upsert_test_case", Arguments: map[string]any{
		"projectKey": project.Key, "title": "Readable summary case", "priority": "high",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("upsert_test_case failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, "Readable summary case") {
		t.Errorf("content text = %q, want it to mention the case title", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
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
	if edited.Key != created.Key {
		t.Errorf("edited.Key = %q, want %q (edit in place, not a duplicate)", edited.Key, created.Key)
	}
	if edited.Name != "Log in as admin (edited)" || len(edited.Steps) != 2 {
		t.Fatalf("edited = %+v", edited)
	}
}

// TestMCPUpsertStepGroupResultHasReadableSummary covers
// add-mcp-human-readable-results.
func TestMCPUpsertStepGroupResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-stepgroup-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "stepgroup-readable-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP StepGroup Readable Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "upsert_step_group", Arguments: map[string]any{
		"projectKey": project.Key, "name": "Readable step group",
		"steps": []map[string]any{{"action": "open login page"}},
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("upsert_step_group failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, "Readable step group") {
		t.Errorf("content text = %q, want it to mention the step group name", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
	}
}

// TestMCPUpsertStepGroupOutputHasNoRawProjectID covers
// fix-mcp-output-id-leaks: the returned step group identifies its project
// by key, not internal ID.
func TestMCPUpsertStepGroupOutputHasNoRawProjectID(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-stepgroup-idleak-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "stepgroup-idleak-agent")
	project, err := svc.CreateProject(context.Background(), service.ProjectInput{Name: "MCP StepGroup ID Leak Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out map[string]any
	callTool(t, session, "upsert_step_group", map[string]any{
		"projectKey": project.Key,
		"name":       "A step group",
		"steps":      []map[string]any{{"action": "open login page"}},
	}, &out)
	if out["projectKey"] != project.Key {
		t.Errorf("out[projectKey] = %v, want %q", out["projectKey"], project.Key)
	}
	if _, present := out["projectId"]; present {
		t.Errorf("out contains projectId: %+v", out)
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

// TestMCPUpsertTestSuiteResultHasReadableSummary covers
// add-mcp-human-readable-results.
func TestMCPUpsertTestSuiteResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suite-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "suite-readable-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite Readable Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "upsert_test_suite", Arguments: map[string]any{
		"projectKey": project.Key, "name": "Readable suite",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("upsert_test_suite failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, "Readable suite") {
		t.Errorf("content text = %q, want it to mention the suite name", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
	}
}

// TestMCPUpsertTestSuiteOutputHasNoRawIDs covers fix-mcp-output-id-leaks:
// the returned suite identifies its project by key and its member cases
// by key, not internal ID — the same shape update_suite_membership
// already returns.
func TestMCPUpsertTestSuiteOutputHasNoRawIDs(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suite-idleak-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "suite-idleak-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite ID Leak Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "Membership suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	if err := svc.AddCaseToSuite(ctx, suite.ID, c.ID); err != nil {
		t.Fatalf("AddCaseToSuite: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out map[string]any
	callTool(t, session, "upsert_test_suite", map[string]any{
		"suiteKey": suite.Key, "name": "Renamed",
	}, &out)
	if out["projectKey"] != project.Key {
		t.Errorf("out[projectKey] = %v, want %q", out["projectKey"], project.Key)
	}
	if _, present := out["projectId"]; present {
		t.Errorf("out contains projectId: %+v", out)
	}
	if _, present := out["caseIds"]; present {
		t.Errorf("out contains caseIds: %+v", out)
	}
	caseKeys, ok := out["caseKeys"].([]any)
	if !ok || len(caseKeys) != 1 || caseKeys[0] != c.Key {
		t.Errorf("out[caseKeys] = %v, want [%q]", out["caseKeys"], c.Key)
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

// --- Requirement: update_suite_membership tool ---

// TestMCPUpdateSuiteMembershipResultHasReadableSummary covers
// add-mcp-human-readable-results.
func TestMCPUpdateSuiteMembershipResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suitemember-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "suitemember-readable-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite Membership Readable Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "Membership suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "update_suite_membership", Arguments: map[string]any{
		"suiteKey": suite.Key, "caseKey": c.Key, "action": "add",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("update_suite_membership failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, c.Key) || !strings.Contains(text, suite.Key) {
		t.Errorf("content text = %q, want it to mention both the case key and suite key", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
	}
}

func TestMCPUpdateSuiteMembershipAddCase(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suitemember-add-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "suitemember-add-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite Membership Add Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "Membership suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var updated mcp.SuiteOutput
	callTool(t, session, "update_suite_membership", map[string]any{
		"suiteKey": suite.Key, "caseKey": c.Key, "action": "add",
	}, &updated)
	if !slices.Contains(updated.CaseKeys, c.Key) {
		t.Fatalf("updated.CaseKeys = %v, want it to contain %q", updated.CaseKeys, c.Key)
	}
}

func TestMCPUpdateSuiteMembershipRemoveCase(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suitemember-remove-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "suitemember-remove-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite Membership Remove Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "Membership suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	if err := svc.AddCaseToSuite(ctx, suite.ID, c.ID); err != nil {
		t.Fatalf("AddCaseToSuite: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var updated mcp.SuiteOutput
	callTool(t, session, "update_suite_membership", map[string]any{
		"suiteKey": suite.Key, "caseKey": c.Key, "action": "remove",
	}, &updated)
	if slices.Contains(updated.CaseKeys, c.Key) {
		t.Fatalf("updated.CaseKeys = %v, want it to NOT contain %q", updated.CaseKeys, c.Key)
	}
}

func TestMCPUpdateSuiteMembershipAddIsIdempotent(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suitemember-idem-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "suitemember-idem-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite Membership Idempotent Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "Membership suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	for i := 0; i < 2; i++ {
		var updated mcp.SuiteOutput
		callTool(t, session, "update_suite_membership", map[string]any{
			"suiteKey": suite.Key, "caseKey": c.Key, "action": "add",
		}, &updated)
		count := 0
		for _, k := range updated.CaseKeys {
			if k == c.Key {
				count++
			}
		}
		if count != 1 {
			t.Fatalf("call %d: case key %q appears %d times in %v, want exactly 1", i+1, c.Key, count, updated.CaseKeys)
		}
	}
}

func TestMCPUpdateSuiteMembershipRemoveNonMemberIsNoop(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suitemember-noop-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "suitemember-noop-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite Membership Noop Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "Membership suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var updated mcp.SuiteOutput
	callTool(t, session, "update_suite_membership", map[string]any{
		"suiteKey": suite.Key, "caseKey": c.Key, "action": "remove",
	}, &updated)
	if slices.Contains(updated.CaseKeys, c.Key) {
		t.Fatalf("updated.CaseKeys = %v, want it to NOT contain %q", updated.CaseKeys, c.Key)
	}
}

func TestMCPUpdateSuiteMembershipDeniedWithoutPermission(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suitemember-noperm-admin@example.com"))
	owner, err := svc.CreateUser(ctx, "mcp-suitemember-noperm-owner@example.com", "correcthorse1", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite Membership No-Perm Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "Membership suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	readOnlyToken := mustCreateScopedToken(t, svc, admin, actorForUser(owner), project.ID, domain.Role{Name: "Suite Membership Read Only (mcp test)", CanRead: true})

	session := mustConnectMCP(t, ts, readOnlyToken)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "update_suite_membership", Arguments: map[string]any{
		"suiteKey": suite.Key, "caseKey": c.Key, "action": "add",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("update_suite_membership with a read-only scoped token succeeded, want a permission error")
	}
}

func TestMCPUpdateSuiteMembershipRejectsCrossProjectCase(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-suitemember-crossproj-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "suitemember-crossproj-agent")
	project1, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite Membership Cross-Project 1"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	project2, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Suite Membership Cross-Project 2"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project1.ID, "Membership suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	c, err := svc.CreateCase(ctx, project2.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "update_suite_membership", Arguments: map[string]any{
		"suiteKey": suite.Key, "caseKey": c.Key, "action": "add",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("update_suite_membership across projects succeeded, want a validation error")
	}
}

// --- Requirement: bulk_add_cases tool ---

// TestMCPBulkAddCasesResultHasReadableSummary covers
// add-mcp-human-readable-results.
func TestMCPBulkAddCasesResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-bulk-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "bulk-readable-agent")
	project, err := svc.CreateProject(context.Background(), service.ProjectInput{Name: "MCP Bulk Readable Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(context.Background(), &sdkmcp.CallToolParams{Name: "bulk_add_cases", Arguments: map[string]any{
		"projectKey": project.Key,
		"cases": []map[string]any{
			{"title": "Case one", "priority": "high"},
			{"title": "Case two", "priority": "medium"},
		},
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("bulk_add_cases failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, "2") || !strings.Contains(text, project.Key) {
		t.Errorf("content text = %q, want it to mention the count (2) and project key", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
	}
}

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

// TestMCPBulkAddCasesOutputHasNoRawProjectOrFolderID covers
// fix-mcp-output-id-leaks: bulk_add_cases embeds the same per-case output
// shape upsert_test_case returns, so it must not leak either.
func TestMCPBulkAddCasesOutputHasNoRawProjectOrFolderID(t *testing.T) {
	ts, svc := testMCPServer(t)
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-bulk-idleak-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "bulk-idleak-agent")
	project, err := svc.CreateProject(context.Background(), service.ProjectInput{Name: "MCP Bulk ID Leak Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out map[string]any
	callTool(t, session, "bulk_add_cases", map[string]any{
		"projectKey": project.Key,
		"cases": []map[string]any{
			{"title": "Case one", "priority": "high"},
		},
	}, &out)
	cases, ok := out["cases"].([]any)
	if !ok || len(cases) != 1 {
		t.Fatalf("out[cases] = %+v, want a 1-element array", out["cases"])
	}
	c, ok := cases[0].(map[string]any)
	if !ok {
		t.Fatalf("cases[0] = %+v, want an object", cases[0])
	}
	if c["projectKey"] != project.Key {
		t.Errorf("cases[0][projectKey] = %v, want %q", c["projectKey"], project.Key)
	}
	if _, present := c["projectId"]; present {
		t.Errorf("cases[0] contains projectId: %+v", c)
	}
	if _, present := c["folderId"]; present {
		t.Errorf("cases[0] contains folderId: %+v", c)
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
// TestMCPCreateTestRunResultHasReadableSummary covers
// add-mcp-human-readable-results.
func TestMCPCreateTestRunResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-run-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "run-readable-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Run Readable Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "create_test_run", Arguments: map[string]any{
		"projectKey": project.Key, "name": "Readable run", "caseKeys": []string{c.Key},
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("create_test_run failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, "Readable run") {
		t.Errorf("content text = %q, want it to mention the run name", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
	}
}

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

// TestMCPCreateTestRunOutputHasProjectKeyNotRawIDs covers
// fix-mcp-run-output-id-leak: create_test_run's structured result must not
// leak the run's internal id or its project's internal id — only key/
// projectKey, matching every other create/get_details-reachable entity
// type's already-fixed output shape.
func TestMCPCreateTestRunOutputHasProjectKeyNotRawIDs(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-run-idleak-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "run-idleak-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Run ID Leak Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out map[string]any
	callTool(t, session, "create_test_run", map[string]any{
		"projectKey": project.Key, "name": "ID-safe run", "caseKeys": []string{c.Key},
	}, &out)

	if out["projectKey"] != project.Key {
		t.Errorf("out[projectKey] = %v, want %q", out["projectKey"], project.Key)
	}
	if _, present := out["id"]; present {
		t.Errorf("out contains id: %+v", out)
	}
	if _, present := out["projectId"]; present {
		t.Errorf("out contains projectId: %+v", out)
	}
}

// --- Requirement: create_test_run tool + get_run_progress tool ---

// TestMCPGetRunProgressResultHasReadableSummary covers
// add-mcp-human-readable-results.
func TestMCPGetRunProgressResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-runprogress-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "runprogress-readable-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Run Progress Readable Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := svc.CreateRun(ctx, project.ID, service.RunInput{Name: "A run", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	session := mustConnectMCP(t, ts, token)
	if _, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "record_result", Arguments: map[string]any{
		"runKey": run.Key, "caseKey": c.Key, "verdict": "pass",
	}}); err != nil {
		t.Fatalf("CallTool(record_result): %v", err)
	}

	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "get_run_progress", Arguments: map[string]any{"runKey": run.Key}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("get_run_progress failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, run.Key) || !strings.Contains(text, "1") {
		t.Errorf("content text = %q, want it to mention the run key and pass/total counts", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
	}
}

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

	// create_test_run's MCP output no longer carries the raw run ID
	// (fix-mcp-run-output-id-leak) — resolve it by key, same as any real
	// caller would.
	runID, err := svc.RunIDByKey(ctx, run.Key)
	if err != nil {
		t.Fatalf("RunIDByKey: %v", err)
	}
	items, err := svc.RunItems(ctx, runID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items) != 1 || items[0].CaseKey != c.Key {
		t.Fatalf("run items = %+v, want the suite's one case", items)
	}
}

// TestMCPCreateTestRunWithConfiguration covers add-run-configurations'
// (#129) agent-parity requirement: create_test_run must accept and echo
// back the same free-text configuration label the REST/web path already
// supports, not just a human-only field.
func TestMCPCreateTestRunWithConfiguration(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-run-config-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "run-config-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Run Config Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Cross-browser case", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var run domain.Run
	callTool(t, session, "create_test_run", map[string]any{
		"projectKey": project.Key, "name": "Chrome run", "caseKeys": []string{c.Key}, "configuration": "Chrome",
	}, &run)
	if run.Configuration == nil || *run.Configuration != "Chrome" {
		t.Fatalf("run.Configuration = %v, want %q", run.Configuration, "Chrome")
	}
}

// --- Requirement: record_result tool + update_run_item_status tool ---

// TestMCPRecordResultResultHasReadableSummary covers
// add-mcp-human-readable-results.
func TestMCPRecordResultResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-result-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "result-readable-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Result Readable Project"})
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
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "record_result", Arguments: map[string]any{
		"runKey": run.Key, "caseKey": c.Key, "verdict": "pass",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("record_result failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, "pass") || !strings.Contains(text, c.Key) || !strings.Contains(text, run.Key) {
		t.Errorf("content text = %q, want it to mention verdict, case key, and run key", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
	}
}

// TestMCPRecordResultOutputHasRunAndCaseKeyNotRunItemID covers
// fix-mcp-output-id-leaks: the returned result identifies its run and
// case by key (values the caller already supplied), not by internal run
// item ID.
func TestMCPRecordResultOutputHasRunAndCaseKeyNotRunItemID(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-result-idleak-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "result-idleak-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Result ID Leak Project"})
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
	var out map[string]any
	callTool(t, session, "record_result", map[string]any{
		"runKey": run.Key, "caseKey": c.Key, "verdict": "pass",
	}, &out)
	if out["runKey"] != run.Key {
		t.Errorf("out[runKey] = %v, want %q", out["runKey"], run.Key)
	}
	if out["caseKey"] != c.Key {
		t.Errorf("out[caseKey] = %v, want %q", out["caseKey"], c.Key)
	}
	if _, present := out["runItemId"]; present {
		t.Errorf("out contains runItemId: %+v", out)
	}
}

// TestMCPUpdateRunItemStatusResultHasReadableSummary covers
// add-mcp-human-readable-results.
func TestMCPUpdateRunItemStatusResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-runitemstatus-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "runitemstatus-readable-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Run Item Status Readable Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := svc.CreateRun(ctx, project.ID, service.RunInput{Name: "A run", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "update_run_item_status", Arguments: map[string]any{
		"runKey": run.Key, "caseKey": c.Key, "status": "retest",
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("update_run_item_status failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, "retest") || !strings.Contains(text, c.Key) || !strings.Contains(text, run.Key) {
		t.Errorf("content text = %q, want it to mention the case key, run key, and status", text)
	}
}

// TestMCPRecordResultWithStepResults covers add-mcp-step-level-results:
// record_result's optional stepResults input is forwarded through to the
// same service-layer logic REST's NewResult.stepResults already exercises
// (add-step-level-results) — the snapshot on the returned result and the
// run item's live per-step state both reflect it.
func TestMCPRecordResultWithStepResults(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-result-steps-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "result-steps-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Result Steps Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{
		Title:    "Multi-step case",
		Priority: domain.PriorityHigh,
		Steps: []domain.Step{
			{Action: "open login page", Expected: "form visible"},
			{Action: "submit credentials", Expected: "dashboard loads"},
		},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := svc.CreateRun(ctx, project.ID, service.RunInput{Name: "Result steps run", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var result domain.Result
	callTool(t, session, "record_result", map[string]any{
		"runKey": run.Key, "caseKey": c.Key, "verdict": "failed",
		"stepResults": []map[string]any{
			{"stepIndex": 0, "verdict": "pass"},
			{"stepIndex": 1, "verdict": "failed"},
		},
	}, &result)
	if len(result.StepResults) != 2 {
		t.Fatalf("result.StepResults = %+v, want 2 entries", result.StepResults)
	}
	if result.StepResults[0].Verdict != domain.VerdictPass || result.StepResults[1].Verdict != domain.VerdictFailed {
		t.Errorf("result.StepResults = %+v, want [pass, failed]", result.StepResults)
	}

	items, err := svc.RunItems(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items) != 1 || len(items[0].StepStates) != 2 {
		t.Fatalf("run item step states = %+v, want 2 live step states", items)
	}
	if items[0].StepStates[0].Verdict != domain.VerdictPass || items[0].StepStates[1].Verdict != domain.VerdictFailed {
		t.Errorf("run item StepStates = %+v, want [pass, failed]", items[0].StepStates)
	}
}

// TestMCPRecordResultRejectsOutOfBoundsStepIndex covers
// add-mcp-step-level-results: the same server-side bounds-check REST
// already enforces (checkStepIndicesInBounds) rejects an MCP call too.
func TestMCPRecordResultRejectsOutOfBoundsStepIndex(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-result-steps-oob-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "result-steps-oob-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Result Steps OOB Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{
		Title:    "Single-step case",
		Priority: domain.PriorityHigh,
		Steps:    []domain.Step{{Action: "do the one thing", Expected: "it works"}},
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := svc.CreateRun(ctx, project.ID, service.RunInput{Name: "Result steps OOB run", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "record_result", Arguments: map[string]any{
		"runKey": run.Key, "caseKey": c.Key, "verdict": "failed",
		"stepResults": []map[string]any{{"stepIndex": 5, "verdict": "failed"}},
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatalf("record_result with out-of-bounds stepIndex succeeded, want an error: %v", contentText(result))
	}

	items, err := svc.RunItems(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items) != 1 || items[0].CurrentStatus != domain.StatusPending {
		t.Fatalf("run item after rejected call = %+v, want status still pending (no result appended)", items)
	}
}

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

// TestMCPSearchResultHasReadableSummary covers add-mcp-human-readable-results.
func TestMCPSearchResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-search-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "search-readable-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Search Readable Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	if _, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Distinctivepenguin case", Priority: domain.PriorityMedium}); err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "search", Arguments: map[string]any{"query": "distinctivepenguin"}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("search failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, "1") || !strings.Contains(text, "distinctivepenguin") {
		t.Errorf("content text = %q, want it to mention the match count (1) and the query", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
	}
}

// TestMCPSearchPaginatesWithCursor covers
// add-mcp-search-listprojects-pagination.
func TestMCPSearchPaginatesWithCursor(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-search-page-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "search-page-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Search Page Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	for i := 0; i < 3; i++ {
		if _, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Distinctiveotter case", Priority: domain.PriorityMedium}); err != nil {
			t.Fatalf("CreateCase: %v", err)
		}
	}

	session := mustConnectMCP(t, ts, token)
	var page1 map[string]any
	callTool(t, session, "search", map[string]any{"query": "distinctiveotter", "limit": 2}, &page1)
	results1, _ := page1["results"].([]any)
	if len(results1) != 2 {
		t.Fatalf("page1 results = %+v, want 2", page1["results"])
	}
	cursor, _ := page1["nextCursor"].(string)
	if cursor == "" {
		t.Fatalf("page1 nextCursor = %+v, want a non-empty cursor", page1["nextCursor"])
	}

	var page2 map[string]any
	callTool(t, session, "search", map[string]any{"query": "distinctiveotter", "limit": 2, "cursor": cursor}, &page2)
	results2, _ := page2["results"].([]any)
	if len(results2) != 1 {
		t.Fatalf("page2 results = %+v, want 1", page2["results"])
	}
	if nc, present := page2["nextCursor"]; present && nc != nil && nc != "" {
		t.Errorf("page2 nextCursor = %v, want empty/absent (last page)", nc)
	}
}

// TestMCPSearchBrowsesWithoutQuery covers add-mcp-search-browse-mode: an
// empty query lists a project's entities instead of erroring, and
// entityType narrows the listing to one entity type.
func TestMCPSearchBrowsesWithoutQuery(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-search-browse-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "search-browse-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Search Browse Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	if _, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Browsable case", Priority: domain.PriorityMedium}); err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	suite, err := svc.CreateSuite(ctx, project.ID, "Browsable suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out mcp.SearchOutput
	callTool(t, session, "search", map[string]any{"entityType": "suite"}, &out)
	if len(out.Results) != 1 || out.Results[0].Key != suite.Key {
		t.Fatalf("results = %+v, want exactly the one suite", out.Results)
	}
	if out.Results[0].Rank != 0 {
		t.Errorf("Rank = %v, want 0 in browse mode", out.Results[0].Rank)
	}
}

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
	if results[0].ProjectKey != visible.Key {
		t.Errorf("result project = %q, want %q (hidden project must not leak to a scoped token)", results[0].ProjectKey, visible.Key)
	}
}

// TestMCPSearchOutputHasNoRawProjectID covers fix-mcp-output-id-leaks:
// results spanning multiple projects each identify their project by key,
// resolved with a single batched lookup, not internal ID.
func TestMCPSearchOutputHasNoRawProjectID(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-search-idleak-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "search-idleak-agent")
	p1, err := svc.CreateProject(ctx, service.ProjectInput{Name: "Search ID Leak One"})
	if err != nil {
		t.Fatalf("CreateProject p1: %v", err)
	}
	p2, err := svc.CreateProject(ctx, service.ProjectInput{Name: "Search ID Leak Two"})
	if err != nil {
		t.Fatalf("CreateProject p2: %v", err)
	}
	if _, err := svc.CreateCase(ctx, p1.ID, "", domain.CaseContent{Title: "Distinctivewombat case", Priority: domain.PriorityMedium}); err != nil {
		t.Fatalf("CreateCase p1: %v", err)
	}
	if _, err := svc.CreateCase(ctx, p2.ID, "", domain.CaseContent{Title: "Distinctivewombat case", Priority: domain.PriorityMedium}); err != nil {
		t.Fatalf("CreateCase p2: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out map[string]any
	callTool(t, session, "search", map[string]any{"query": "distinctivewombat"}, &out)
	results, ok := out["results"].([]any)
	if !ok || len(results) != 2 {
		t.Fatalf("out[results] = %+v, want a 2-element array", out["results"])
	}
	validKeys := map[string]bool{p1.Key: true, p2.Key: true}
	for _, r := range results {
		m, ok := r.(map[string]any)
		if !ok {
			t.Fatalf("result = %+v, want an object", r)
		}
		if _, present := m["projectId"]; present {
			t.Errorf("result contains projectId: %+v", m)
		}
		if !validKeys[m["projectKey"].(string)] {
			t.Errorf("result[projectKey] = %v, want one of %v", m["projectKey"], validKeys)
		}
	}
}

// --- Requirement: get_details tool ---

// TestMCPGetDetailsResultHasReadableSummary covers
// add-mcp-human-readable-results.
func TestMCPGetDetailsResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-getdetails-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "getdetails-readable-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP GetDetails Readable Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Detail case", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "get_details", Arguments: map[string]any{
		"entityType": "case", "key": c.Key,
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("get_details failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, "case") || !strings.Contains(text, c.Key) {
		t.Errorf("content text = %q, want it to mention the entity type and key", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
	}
}

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

// TestMCPGetDetailsReleaseHasNoRawProjectID covers fix-mcp-output-id-leaks:
// a release fetched via get_details identifies its project by key, not
// internal ID.
func TestMCPGetDetailsReleaseHasNoRawProjectID(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-getdetails-release-idleak-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "getdetails-release-idleak-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP GetDetails Release ID Leak Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	release, err := svc.CreateRelease(ctx, project.ID, "2026.1", "", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("CreateRelease: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out map[string]any
	callTool(t, session, "get_details", map[string]any{"entityType": "release", "key": release.Key}, &out)
	if out["projectKey"] != project.Key {
		t.Errorf("out[projectKey] = %v, want %q", out["projectKey"], project.Key)
	}
	if _, present := out["projectId"]; present {
		t.Errorf("out contains projectId: %+v", out)
	}
}

// TestMCPGetDetailsTestPlanHasNoRawProjectOrReleaseID covers
// fix-mcp-output-id-leaks: a test plan fetched via get_details identifies
// its project and release by key, not internal ID.
func TestMCPGetDetailsTestPlanHasNoRawProjectOrReleaseID(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-getdetails-testplan-idleak-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "getdetails-testplan-idleak-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP GetDetails TestPlan ID Leak Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
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
	var out map[string]any
	callTool(t, session, "get_details", map[string]any{"entityType": "testPlan", "key": plan.Key}, &out)
	if out["projectKey"] != project.Key {
		t.Errorf("out[projectKey] = %v, want %q", out["projectKey"], project.Key)
	}
	if out["releaseKey"] != release.Key {
		t.Errorf("out[releaseKey] = %v, want %q", out["releaseKey"], release.Key)
	}
	if _, present := out["projectId"]; present {
		t.Errorf("out contains projectId: %+v", out)
	}
	if _, present := out["releaseId"]; present {
		t.Errorf("out contains releaseId: %+v", out)
	}
}

// TestMCPGetDetailsRunHasNoRawProjectOrRunID covers
// fix-mcp-run-output-id-leak: a run fetched via get_details identifies its
// project by key and does not leak either the run's own internal ID or
// its project's — the same shape create_test_run returns.
func TestMCPGetDetailsRunHasNoRawProjectOrRunID(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-getdetails-run-idleak-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "getdetails-run-idleak-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP GetDetails Run ID Leak Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := svc.CreateRun(ctx, project.ID, service.RunInput{Name: "A run", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out map[string]any
	callTool(t, session, "get_details", map[string]any{"entityType": "run", "key": run.Key}, &out)
	if out["projectKey"] != project.Key {
		t.Errorf("out[projectKey] = %v, want %q", out["projectKey"], project.Key)
	}
	if _, present := out["id"]; present {
		t.Errorf("out contains id: %+v", out)
	}
	if _, present := out["projectId"]; present {
		t.Errorf("out contains projectId: %+v", out)
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

// --- Requirement: list_run_items tool ---

func TestMCPListRunItemsListsItems(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-listrunitems-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "listrunitems-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP List Run Items Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c1, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Case one", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase c1: %v", err)
	}
	c2, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Case two", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase c2: %v", err)
	}
	run, err := svc.CreateRun(ctx, project.ID, service.RunInput{Name: "A run", CaseIDs: []string{c1.ID, c2.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out map[string]any
	callTool(t, session, "list_run_items", map[string]any{"runKey": run.Key}, &out)
	items, ok := out["items"].([]any)
	if !ok || len(items) != 2 {
		t.Fatalf("out[items] = %+v, want a 2-element array", out["items"])
	}
	caseKeys := map[string]bool{}
	for _, it := range items {
		m, ok := it.(map[string]any)
		if !ok {
			t.Fatalf("item = %+v, want an object", it)
		}
		caseKeys[m["caseKey"].(string)] = true
		if m["currentStatus"] != "pending" {
			t.Errorf("item[currentStatus] = %v, want pending", m["currentStatus"])
		}
		for _, leaked := range []string{"id", "runId", "caseId"} {
			if _, present := m[leaked]; present {
				t.Errorf("item contains %s: %+v", leaked, m)
			}
		}
	}
	if !caseKeys[c1.Key] || !caseKeys[c2.Key] {
		t.Errorf("caseKeys = %v, want both %q and %q", caseKeys, c1.Key, c2.Key)
	}
}

func TestMCPListRunItemsPaginatesWithCursor(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-listrunitems-page-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "listrunitems-page-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP List Run Items Page Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	var caseIDs []string
	for i := 0; i < 3; i++ {
		c, err := svc.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Case", Priority: domain.PriorityMedium})
		if err != nil {
			t.Fatalf("CreateCase: %v", err)
		}
		caseIDs = append(caseIDs, c.ID)
	}
	run, err := svc.CreateRun(ctx, project.ID, service.RunInput{Name: "A run", CaseIDs: caseIDs})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var page1 map[string]any
	callTool(t, session, "list_run_items", map[string]any{"runKey": run.Key, "limit": 2}, &page1)
	items1, _ := page1["items"].([]any)
	if len(items1) != 2 {
		t.Fatalf("page1 items = %+v, want 2", page1["items"])
	}
	cursor, _ := page1["nextCursor"].(string)
	if cursor == "" {
		t.Fatalf("page1 nextCursor = %+v, want a non-empty cursor", page1["nextCursor"])
	}

	var page2 map[string]any
	callTool(t, session, "list_run_items", map[string]any{"runKey": run.Key, "limit": 2, "cursor": cursor}, &page2)
	items2, _ := page2["items"].([]any)
	if len(items2) != 1 {
		t.Fatalf("page2 items = %+v, want 1", page2["items"])
	}
	if nc, present := page2["nextCursor"]; present && nc != nil && nc != "" {
		t.Errorf("page2 nextCursor = %v, want empty/absent (last page)", nc)
	}
}

func TestMCPListRunItemsDeniedWithoutPermission(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-listrunitems-noperm-admin@example.com"))
	owner, err := svc.CreateUser(ctx, "mcp-listrunitems-noperm-owner@example.com", "correcthorse1", false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP List Run Items No-Perm Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	run, err := svc.CreateRun(ctx, project.ID, service.RunInput{Name: "A run"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	noReadRole := domain.Role{Name: "No Read (mcp test)"}
	noReadToken := mustCreateScopedToken(t, svc, admin, actorForUser(owner), project.ID, noReadRole)

	session := mustConnectMCP(t, ts, noReadToken)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "list_run_items", Arguments: map[string]any{
		"runKey": run.Key,
	}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if !result.IsError {
		t.Fatal("list_run_items without read permission succeeded, want a permission error")
	}
}

// --- Requirement: list_projects tool ---

// TestMCPListProjectsResultHasReadableSummary covers
// add-mcp-human-readable-results.
func TestMCPListProjectsResultHasReadableSummary(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-listprojects-readable-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "listprojects-readable-agent")
	if _, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP List Projects Readable Project"}); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	result, err := session.CallTool(ctx, &sdkmcp.CallToolParams{Name: "list_projects", Arguments: struct{}{}})
	if err != nil {
		t.Fatalf("CallTool: protocol error: %v", err)
	}
	if result.IsError {
		t.Fatalf("list_projects failed: %v", contentText(result))
	}
	text := contentText(result)
	if !strings.Contains(text, "1") {
		t.Errorf("content text = %q, want it to mention the project count", text)
	}
	if strings.HasPrefix(strings.TrimSpace(text), "{") {
		t.Errorf("content text = %q, looks like a raw JSON dump, not a readable summary", text)
	}
}

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

// TestMCPListProjectsPaginatesWithCursor covers
// add-mcp-search-listprojects-pagination.
func TestMCPListProjectsPaginatesWithCursor(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-listprojects-page-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "listprojects-page-agent")
	for i := 0; i < 3; i++ {
		if _, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP List Page Project"}); err != nil {
			t.Fatalf("CreateProject: %v", err)
		}
	}

	session := mustConnectMCP(t, ts, token)
	var page1 map[string]any
	callTool(t, session, "list_projects", map[string]any{"limit": 2}, &page1)
	projects1, _ := page1["projects"].([]any)
	if len(projects1) != 2 {
		t.Fatalf("page1 projects = %+v, want 2", page1["projects"])
	}
	cursor, _ := page1["nextCursor"].(string)
	if cursor == "" {
		t.Fatalf("page1 nextCursor = %+v, want a non-empty cursor", page1["nextCursor"])
	}

	var page2 map[string]any
	callTool(t, session, "list_projects", map[string]any{"limit": 2, "cursor": cursor}, &page2)
	projects2, _ := page2["projects"].([]any)
	if len(projects2) != 1 {
		t.Fatalf("page2 projects = %+v, want 1", page2["projects"])
	}
	if nc, present := page2["nextCursor"]; present && nc != nil && nc != "" {
		t.Errorf("page2 nextCursor = %v, want empty/absent (last page)", nc)
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

// --- Requirement: Agent parity for reading unit test results ---

func TestMCPListUnitTestResultsListsResults(t *testing.T) {
	ts, svc := testMCPServer(t)
	ctx := context.Background()
	admin := actorForUser(mustBootstrapAdmin(t, svc, "mcp-unittestresults-admin@example.com"))
	token := mustCreateUnscopedToken(t, svc, admin, "unittestresults-agent")
	project, err := svc.CreateProject(ctx, service.ProjectInput{Name: "MCP Unit Test Results Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	report := `<testsuites><testsuite name="pytest">` +
		`<testcase classname="tests.test_mod" name="test_pass" time="0.1"/>` +
		`<testcase classname="tests.test_mod" name="test_fail" time="0.1"><failure message="x">trace</failure></testcase>` +
		`</testsuite></testsuites>`
	if _, err := svc.ImportUnitTestResults(domain.WithActor(ctx, admin), project.ID, report, ""); err != nil {
		t.Fatalf("ImportUnitTestResults: %v", err)
	}

	session := mustConnectMCP(t, ts, token)
	var out map[string]any
	callTool(t, session, "list_unit_test_results", map[string]any{"projectKey": project.Key}, &out)
	items, ok := out["items"].([]any)
	if !ok || len(items) != 2 {
		t.Fatalf("out[items] = %+v, want a 2-element array", out["items"])
	}

	var filtered map[string]any
	callTool(t, session, "list_unit_test_results", map[string]any{"projectKey": project.Key, "verdict": "failed"}, &filtered)
	filteredItems, ok := filtered["items"].([]any)
	if !ok || len(filteredItems) != 1 {
		t.Fatalf("filtered items = %+v, want a 1-element array", filtered["items"])
	}
	m, ok := filteredItems[0].(map[string]any)
	if !ok || m["name"] != "test_fail" {
		t.Errorf("filtered item = %+v, want test_fail", m)
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
