package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// idempotentResult checks for a prior successful call under key, scoped
// to the calling actor and toolName (add-mcp-idempotency-keys design.md
// D6). ok=false means no cached result exists — the caller should perform
// the operation normally.
func idempotentResult[T any](ctx context.Context, svc *service.Service, toolName, key string) (T, bool, error) {
	var zero T
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return zero, false, nil
	}
	raw, found, err := svc.IdempotentResult(ctx, actor.ID, toolName, key)
	if err != nil || !found {
		return zero, false, err
	}
	var result T
	if err := json.Unmarshal(raw, &result); err != nil {
		return zero, false, err
	}
	return result, true, nil
}

// saveIdempotentResult persists a successful call's result under key, for
// idempotentResult to replay on a retry.
func saveIdempotentResult(ctx context.Context, svc *service.Service, toolName, key string, result any) error {
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return nil
	}
	return svc.SaveIdempotentResult(ctx, actor.ID, toolName, key, result)
}

// textResult builds a short, human-readable summary for a tool's
// CallToolResult.Content, so a human watching the transcript sees a
// readable line instead of the SDK's default raw-JSON-dump fallback
// (add-mcp-human-readable-results design.md D1) — StructuredContent (what
// the calling model actually parses) is unaffected either way.
func textResult(format string, args ...any) *sdkmcp.CallToolResult {
	return &sdkmcp.CallToolResult{Content: []sdkmcp.Content{&sdkmcp.TextContent{Text: fmt.Sprintf(format, args...)}}}
}

// writeAnnotations is shared by every write tool here: none are destructive
// (creates are always additive, edits always version forward, results are
// append-only — there is no delete tool in this package at all) and none
// operate on an "open world" beyond TestPulse's own data.
func writeAnnotations(idempotent bool) *sdkmcp.ToolAnnotations {
	return &sdkmcp.ToolAnnotations{DestructiveHint: boolPtr(false), IdempotentHint: idempotent, OpenWorldHint: boolPtr(false)}
}

func registerWriteTools(srv *sdkmcp.Server, svc *service.Service) {
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "upsert_test_case",
		Description: "Create a new test case (set projectKey), or edit an existing one by caseKey (creates a new immutable version).",
		Annotations: writeAnnotations(false),
	}, upsertTestCase(svc))
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "upsert_test_suite",
		Description: "Create a new test suite (set projectKey), or rename an existing one by suiteKey.",
		Annotations: writeAnnotations(false),
	}, upsertTestSuite(svc))
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "upsert_step_group",
		Description: "Create a new shared step group (set projectKey), or edit an existing one by groupKey. Reference a step group from upsert_test_case/bulk_add_cases's steps by setting a step's groupKey instead of action/expected.",
		Annotations: writeAnnotations(false),
	}, upsertStepGroup(svc))
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "bulk_add_cases",
		Description: "Create multiple test cases in one project as a single atomic batch: if any case is invalid, none are created.",
		Annotations: writeAnnotations(false),
	}, bulkAddCases(svc))
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "create_test_run",
		Description: "Create a test run from a suite's cases and/or an explicit list of case keys, optionally scoped to a Test Plan.",
		Annotations: writeAnnotations(false),
	}, createTestRun(svc))
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "record_result",
		Description: "Record a verdict (pass/failed/skipped/blocked) for a case within a run. Appends to that run item's result log — never overwrites a prior result. Optionally accepts stepResults to report per-step verdicts atomically with the overall one.",
		Annotations: writeAnnotations(false),
	}, recordResult(svc))
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "update_run_item_status",
		Description: "Update a run item's status directly (e.g. request a retest), independent of recording a verdict.",
		Annotations: writeAnnotations(true), // setting the same status twice leaves the same end state
	}, updateRunItemStatus(svc))
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "update_suite_membership",
		Description: "Add an existing case to an existing suite, or remove it. Adding an already-member case, or removing a non-member case, both succeed as a no-op.",
		Annotations: writeAnnotations(true), // repeating the same add/remove leaves the same end state
	}, updateSuiteMembership(svc))
}

// StepInput mirrors domain.Step for MCP tool input. Set groupKey instead
// of action/expected to reference an existing shared step group
// (add-reusable-steps) — the server resolves it to that group's full
// current step sequence, ignoring any action/expected also sent on this
// entry (the same anti-spoofing rule enforced on the REST path).
type StepInput struct {
	Action   string `json:"action,omitempty" jsonschema:"the action to perform; omit when groupKey is set"`
	Expected string `json:"expected,omitempty" jsonschema:"the expected outcome of this step"`
	GroupKey string `json:"groupKey,omitempty" jsonschema:"key of an existing shared step group to reference in place of action/expected"`
}

func toDomainSteps(steps []StepInput) []domain.Step {
	out := make([]domain.Step, len(steps))
	for i, s := range steps {
		if s.GroupKey != "" {
			out[i] = domain.Step{GroupRef: &domain.StepGroupRef{GroupKey: s.GroupKey}}
			continue
		}
		out[i] = domain.Step{Action: s.Action, Expected: s.Expected}
	}
	return out
}

// CaseContentInput is the shared case-content shape for upsert_test_case
// and bulk_add_cases.
type CaseContentInput struct {
	Title          string      `json:"title" jsonschema:"case title"`
	Description    string      `json:"description,omitempty"`
	Steps          []StepInput `json:"steps,omitempty"`
	ExpectedResult string      `json:"expectedResult,omitempty"`
	Priority       string      `json:"priority,omitempty" jsonschema:"one of low, medium, high, critical; defaults to medium"`
	Tags           []string    `json:"tags,omitempty"`
	Platform       string      `json:"platform,omitempty"`
	TestType       string      `json:"testType,omitempty"`
	Automated      bool        `json:"automated,omitempty"`
}

func (c CaseContentInput) toDomain() domain.CaseContent {
	priority := domain.Priority(c.Priority)
	if priority == "" {
		priority = domain.PriorityMedium
	}
	return domain.CaseContent{
		Title: c.Title, Description: c.Description, Steps: toDomainSteps(c.Steps),
		ExpectedResult: c.ExpectedResult, Priority: priority, Tags: c.Tags,
		Platform: c.Platform, TestType: c.TestType, Automated: c.Automated,
	}
}

// TestCaseOutput mirrors domain.TestCase for MCP tool output, substituting
// ProjectKey for ProjectID and dropping FolderID entirely — no tool
// accepts a raw project ID or folder ID as input, and no folder concept
// exists anywhere in the MCP tool surface (fix-mcp-output-id-leaks D2).
type TestCaseOutput struct {
	Key              string             `json:"key"`
	ProjectKey       string             `json:"projectKey"`
	CurrentVersion   int                `json:"currentVersion"`
	Content          domain.CaseContent `json:"content"`
	CreatedAt        time.Time          `json:"createdAt"`
	UpdatedAt        time.Time          `json:"updatedAt"`
	JiraIssueKey     *string            `json:"jiraIssueKey,omitempty"`
	JiraIssueSummary *string            `json:"jiraIssueSummary,omitempty"`
	JiraIssueStatus  *string            `json:"jiraIssueStatus,omitempty"`
	JiraLastSyncedAt *time.Time         `json:"jiraLastSyncedAt,omitempty"`
}

func toTestCaseOutput(c domain.TestCase, projectKey string) TestCaseOutput {
	return TestCaseOutput{
		Key: c.Key, ProjectKey: projectKey, CurrentVersion: c.CurrentVersion,
		Content: c.Content, CreatedAt: c.CreatedAt, UpdatedAt: c.UpdatedAt,
		JiraIssueKey: c.JiraIssueKey, JiraIssueSummary: c.JiraIssueSummary,
		JiraIssueStatus: c.JiraIssueStatus, JiraLastSyncedAt: c.JiraLastSyncedAt,
	}
}

type UpsertTestCaseInput struct {
	CaseContentInput
	ProjectKey string `json:"projectKey,omitempty" jsonschema:"project key; required when creating a new case (omit caseKey)"`
	CaseKey    string `json:"caseKey,omitempty" jsonschema:"existing case key to edit; omit to create a new case in projectKey"`
	// IdempotencyKey only protects the create path (add-mcp-idempotency-
	// keys design.md Non-Goals) — a retried edit still creates a new
	// version each time.
	IdempotencyKey string `json:"idempotencyKey,omitempty" jsonschema:"optional, create path only: retrying with the same key returns the original case instead of creating a second one"`
}

func upsertTestCase(svc *service.Service) sdkmcp.ToolHandlerFor[UpsertTestCaseInput, TestCaseOutput] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in UpsertTestCaseInput) (*sdkmcp.CallToolResult, TestCaseOutput, error) {
		content := in.toDomain()
		if in.CaseKey != "" {
			caseID, err := svc.CaseIDByKey(ctx, in.CaseKey)
			if err != nil {
				return nil, TestCaseOutput{}, notFoundf("case", in.CaseKey, err)
			}
			projectID, err := svc.ProjectIDForCase(ctx, caseID)
			if err != nil {
				return nil, TestCaseOutput{}, err
			}
			if err := svc.Authorize(ctx, domain.PermCaseEdit, projectID); err != nil {
				return nil, TestCaseOutput{}, err
			}
			c, err := svc.EditCase(ctx, caseID, content)
			if err != nil {
				return nil, TestCaseOutput{}, err
			}
			keys, err := svc.ProjectKeysByIDs(ctx, []string{projectID})
			if err != nil {
				return nil, TestCaseOutput{}, err
			}
			out := toTestCaseOutput(c, keys[projectID])
			return textResult("Edited case %s to version %d: %s", out.Key, out.CurrentVersion, out.Content.Title), out, nil
		}
		if in.ProjectKey == "" {
			return nil, TestCaseOutput{}, fmt.Errorf("projectKey is required to create a new case")
		}
		projectID, err := svc.ProjectIDByKey(ctx, in.ProjectKey)
		if err != nil {
			return nil, TestCaseOutput{}, notFoundf("project", in.ProjectKey, err)
		}
		if err := svc.Authorize(ctx, domain.PermCaseCreate, projectID); err != nil {
			return nil, TestCaseOutput{}, err
		}
		if in.IdempotencyKey != "" {
			if cached, ok, err := idempotentResult[TestCaseOutput](ctx, svc, "upsert_test_case", in.IdempotencyKey); err != nil {
				return nil, TestCaseOutput{}, err
			} else if ok {
				return textResult("Created case %s: %s", cached.Key, cached.Content.Title), cached, nil
			}
		}
		c, err := svc.CreateCase(ctx, projectID, "", content)
		if err != nil {
			return nil, TestCaseOutput{}, err
		}
		out := toTestCaseOutput(c, in.ProjectKey)
		if in.IdempotencyKey != "" {
			if err := saveIdempotentResult(ctx, svc, "upsert_test_case", in.IdempotencyKey, out); err != nil {
				return nil, TestCaseOutput{}, err
			}
		}
		return textResult("Created case %s: %s", out.Key, out.Content.Title), out, nil
	}
}

type UpsertTestSuiteInput struct {
	ProjectKey string `json:"projectKey,omitempty" jsonschema:"project key; required when creating a new suite (omit suiteKey)"`
	SuiteKey   string `json:"suiteKey,omitempty" jsonschema:"existing suite key to rename; omit to create a new suite in projectKey"`
	Name       string `json:"name" jsonschema:"suite name"`
}

// SuiteOutput mirrors domain.Suite for MCP tool output, substituting
// ProjectKey for ProjectID and CaseKeys for CaseIDs (fix-mcp-output-id-leaks
// D2) — the shared output shape for both upsert_test_suite and
// update_suite_membership.
type SuiteOutput struct {
	Key        string     `json:"key"`
	ProjectKey string     `json:"projectKey"`
	Name       string     `json:"name"`
	CaseKeys   []string   `json:"caseKeys"`
	PassRate   *int       `json:"passRate"`
	LastRunAt  *time.Time `json:"lastRunAt"`
	CreatedAt  time.Time  `json:"createdAt"`
}

// toSuiteOutput resolves s's project key and maps its member case IDs to
// case keys, one GetCase call per member — acceptable for v1 (design.md
// Risks): a fresh full-membership fetch happens on every add/remove/rename
// call, not a hot path at typical suite sizes.
func toSuiteOutput(ctx context.Context, svc *service.Service, s domain.Suite) (SuiteOutput, error) {
	keys, err := svc.ProjectKeysByIDs(ctx, []string{s.ProjectID})
	if err != nil {
		return SuiteOutput{}, err
	}
	caseKeys := make([]string, len(s.CaseIDs))
	for i, id := range s.CaseIDs {
		c, err := svc.GetCase(ctx, id)
		if err != nil {
			return SuiteOutput{}, err
		}
		caseKeys[i] = c.Key
	}
	return SuiteOutput{
		Key: s.Key, ProjectKey: keys[s.ProjectID], Name: s.Name, CaseKeys: caseKeys,
		PassRate: s.PassRate, LastRunAt: s.LastRunAt, CreatedAt: s.CreatedAt,
	}, nil
}

func upsertTestSuite(svc *service.Service) sdkmcp.ToolHandlerFor[UpsertTestSuiteInput, SuiteOutput] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in UpsertTestSuiteInput) (*sdkmcp.CallToolResult, SuiteOutput, error) {
		if in.SuiteKey != "" {
			suiteID, err := svc.SuiteIDByKey(ctx, in.SuiteKey)
			if err != nil {
				return nil, SuiteOutput{}, notFoundf("suite", in.SuiteKey, err)
			}
			projectID, err := svc.ProjectIDForSuite(ctx, suiteID)
			if err != nil {
				return nil, SuiteOutput{}, err
			}
			if err := svc.Authorize(ctx, domain.PermSuiteEditMembership, projectID); err != nil {
				return nil, SuiteOutput{}, err
			}
			if _, err := svc.RenameSuite(ctx, suiteID, in.Name); err != nil {
				return nil, SuiteOutput{}, err
			}
			// RenameSuite's own return value doesn't populate CaseIDs
			// (SuiteRepo.Rename's UPDATE...RETURNING doesn't select it) —
			// re-fetch via GetSuite for the real current membership,
			// mirroring update_suite_membership's existing pattern below.
			s, err := svc.GetSuite(ctx, suiteID)
			if err != nil {
				return nil, SuiteOutput{}, err
			}
			out, err := toSuiteOutput(ctx, svc, s)
			if err != nil {
				return nil, SuiteOutput{}, err
			}
			return textResult("Renamed suite %s to %s", out.Key, out.Name), out, nil
		}
		if in.ProjectKey == "" {
			return nil, SuiteOutput{}, fmt.Errorf("projectKey is required to create a new suite")
		}
		projectID, err := svc.ProjectIDByKey(ctx, in.ProjectKey)
		if err != nil {
			return nil, SuiteOutput{}, notFoundf("project", in.ProjectKey, err)
		}
		if err := svc.Authorize(ctx, domain.PermSuiteCreate, projectID); err != nil {
			return nil, SuiteOutput{}, err
		}
		s, err := svc.CreateSuite(ctx, projectID, in.Name)
		if err != nil {
			return nil, SuiteOutput{}, err
		}
		out, err := toSuiteOutput(ctx, svc, s)
		if err != nil {
			return nil, SuiteOutput{}, err
		}
		return textResult("Created suite %s: %s", out.Key, out.Name), out, nil
	}
}

type UpsertStepGroupInput struct {
	ProjectKey string      `json:"projectKey,omitempty" jsonschema:"project key; required when creating a new step group (omit groupKey)"`
	GroupKey   string      `json:"groupKey,omitempty" jsonschema:"existing step group key to edit; omit to create a new step group in projectKey"`
	Name       string      `json:"name" jsonschema:"step group name"`
	Steps      []StepInput `json:"steps" jsonschema:"the group's ordered steps"`
}

// StepGroupOutput mirrors domain.StepGroup for MCP tool output,
// substituting ProjectKey for ProjectID (fix-mcp-output-id-leaks D2).
type StepGroupOutput struct {
	Key        string        `json:"key"`
	ProjectKey string        `json:"projectKey"`
	Name       string        `json:"name"`
	Steps      []domain.Step `json:"steps"`
	CreatedAt  time.Time     `json:"createdAt"`
	UpdatedAt  time.Time     `json:"updatedAt"`
}

func toStepGroupOutput(g domain.StepGroup, projectKey string) StepGroupOutput {
	return StepGroupOutput{
		Key: g.Key, ProjectKey: projectKey, Name: g.Name,
		Steps: g.Steps, CreatedAt: g.CreatedAt, UpdatedAt: g.UpdatedAt,
	}
}

func upsertStepGroup(svc *service.Service) sdkmcp.ToolHandlerFor[UpsertStepGroupInput, StepGroupOutput] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in UpsertStepGroupInput) (*sdkmcp.CallToolResult, StepGroupOutput, error) {
		steps := toDomainSteps(in.Steps)
		if in.GroupKey != "" {
			groupID, err := svc.StepGroupIDByKey(ctx, in.GroupKey)
			if err != nil {
				return nil, StepGroupOutput{}, notFoundf("step group", in.GroupKey, err)
			}
			projectID, err := svc.ProjectIDForStepGroup(ctx, groupID)
			if err != nil {
				return nil, StepGroupOutput{}, err
			}
			if err := svc.Authorize(ctx, domain.PermManageProject, projectID); err != nil {
				return nil, StepGroupOutput{}, err
			}
			g, err := svc.UpdateStepGroup(ctx, groupID, in.Name, steps)
			if err != nil {
				return nil, StepGroupOutput{}, err
			}
			keys, err := svc.ProjectKeysByIDs(ctx, []string{projectID})
			if err != nil {
				return nil, StepGroupOutput{}, err
			}
			out := toStepGroupOutput(g, keys[projectID])
			return textResult("Edited step group %s: %s (%d steps)", out.Key, out.Name, len(out.Steps)), out, nil
		}
		if in.ProjectKey == "" {
			return nil, StepGroupOutput{}, fmt.Errorf("projectKey is required to create a new step group")
		}
		projectID, err := svc.ProjectIDByKey(ctx, in.ProjectKey)
		if err != nil {
			return nil, StepGroupOutput{}, notFoundf("project", in.ProjectKey, err)
		}
		if err := svc.Authorize(ctx, domain.PermManageProject, projectID); err != nil {
			return nil, StepGroupOutput{}, err
		}
		g, err := svc.CreateStepGroup(ctx, projectID, in.Name, steps)
		if err != nil {
			return nil, StepGroupOutput{}, err
		}
		out := toStepGroupOutput(g, in.ProjectKey)
		return textResult("Created step group %s: %s (%d steps)", out.Key, out.Name, len(out.Steps)), out, nil
	}
}

type BulkAddCasesInput struct {
	ProjectKey string             `json:"projectKey" jsonschema:"project key to add all cases to"`
	Cases      []CaseContentInput `json:"cases" jsonschema:"the batch of cases to create; all succeed or none are created"`
	// IdempotencyKey: see UpsertTestCaseInput's own field for the shared
	// contract (add-mcp-idempotency-keys).
	IdempotencyKey string `json:"idempotencyKey,omitempty" jsonschema:"optional: retrying with the same key returns the original batch instead of creating a second one"`
}

// BulkAddCasesOutput wraps the created cases in a named field rather than
// returning a bare array: MCP tool outputSchema must be an "object" at the
// root (Claude Code's client rejects a top-level array/union type, even
// though the Go SDK itself permits one per SEP-2106 — real-client
// compatibility wins).
type BulkAddCasesOutput struct {
	Cases []TestCaseOutput `json:"cases"`
}

func bulkAddCases(svc *service.Service) sdkmcp.ToolHandlerFor[BulkAddCasesInput, BulkAddCasesOutput] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in BulkAddCasesInput) (*sdkmcp.CallToolResult, BulkAddCasesOutput, error) {
		projectID, err := svc.ProjectIDByKey(ctx, in.ProjectKey)
		if err != nil {
			return nil, BulkAddCasesOutput{}, notFoundf("project", in.ProjectKey, err)
		}
		if err := svc.Authorize(ctx, domain.PermCaseCreate, projectID); err != nil {
			return nil, BulkAddCasesOutput{}, err
		}
		if in.IdempotencyKey != "" {
			if cached, ok, err := idempotentResult[BulkAddCasesOutput](ctx, svc, "bulk_add_cases", in.IdempotencyKey); err != nil {
				return nil, BulkAddCasesOutput{}, err
			} else if ok {
				return textResult("Created %d cases in %s", len(cached.Cases), in.ProjectKey), cached, nil
			}
		}
		contents := make([]domain.CaseContent, len(in.Cases))
		for i, c := range in.Cases {
			contents[i] = c.toDomain()
		}
		cases, err := svc.BulkAddCases(ctx, projectID, "", contents)
		if err != nil {
			return nil, BulkAddCasesOutput{}, err
		}
		outCases := make([]TestCaseOutput, len(cases))
		for i, c := range cases {
			outCases[i] = toTestCaseOutput(c, in.ProjectKey)
		}
		out := BulkAddCasesOutput{Cases: outCases}
		if in.IdempotencyKey != "" {
			if err := saveIdempotentResult(ctx, svc, "bulk_add_cases", in.IdempotencyKey, out); err != nil {
				return nil, BulkAddCasesOutput{}, err
			}
		}
		return textResult("Created %d cases in %s", len(out.Cases), in.ProjectKey), out, nil
	}
}

// RunOutput mirrors domain.Run for MCP tool output, dropping ID and
// ProjectID — ProjectKey is already present on domain.Run and sufficient
// (fix-mcp-run-output-id-leak, closing the gap fix-mcp-output-id-leaks
// left open: Run was judged "already clean" there for having ProjectKey/
// SuiteKey/TestPlanKey siblings, but ID/ProjectID were still present on
// the same struct and still leaked).
type RunOutput struct {
	Key         string           `json:"key"`
	ProjectKey  string           `json:"projectKey"`
	Name        string           `json:"name"`
	Status      domain.RunStatus `json:"status"`
	SuiteKey    *string          `json:"suiteKey,omitempty"`
	TestPlanKey *string          `json:"testPlanKey,omitempty"`
	PassRate    *int             `json:"passRate,omitempty"`
	Archived    bool             `json:"archived"`
	CreatedAt   time.Time        `json:"createdAt"`
}

func toRunOutput(r domain.Run) RunOutput {
	return RunOutput{
		Key: r.Key, ProjectKey: r.ProjectKey, Name: r.Name, Status: r.Status,
		SuiteKey: r.SuiteKey, TestPlanKey: r.TestPlanKey, PassRate: r.PassRate,
		Archived: r.Archived, CreatedAt: r.CreatedAt,
	}
}

type CreateTestRunInput struct {
	ProjectKey  string   `json:"projectKey"`
	Name        string   `json:"name"`
	SuiteKey    string   `json:"suiteKey,omitempty" jsonschema:"populate the run from this suite's cases"`
	TestPlanKey string   `json:"testPlanKey,omitempty" jsonschema:"scope this run to a Test Plan"`
	CaseKeys    []string `json:"caseKeys,omitempty" jsonschema:"explicit case keys to include, in addition to any suite's cases"`
	// IdempotencyKey: see UpsertTestCaseInput's own field for the shared
	// contract (add-mcp-idempotency-keys).
	IdempotencyKey string `json:"idempotencyKey,omitempty" jsonschema:"optional: retrying with the same key returns the original run instead of creating a second one"`
}

func createTestRun(svc *service.Service) sdkmcp.ToolHandlerFor[CreateTestRunInput, RunOutput] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in CreateTestRunInput) (*sdkmcp.CallToolResult, RunOutput, error) {
		projectID, err := svc.ProjectIDByKey(ctx, in.ProjectKey)
		if err != nil {
			return nil, RunOutput{}, notFoundf("project", in.ProjectKey, err)
		}
		if err := svc.Authorize(ctx, domain.PermRunCreate, projectID); err != nil {
			return nil, RunOutput{}, err
		}
		if in.IdempotencyKey != "" {
			if cached, ok, err := idempotentResult[RunOutput](ctx, svc, "create_test_run", in.IdempotencyKey); err != nil {
				return nil, RunOutput{}, err
			} else if ok {
				return textResult("Created run %s: %s", cached.Key, cached.Name), cached, nil
			}
		}

		runInput := service.RunInput{Name: in.Name}
		if in.SuiteKey != "" {
			suiteID, err := svc.SuiteIDByKey(ctx, in.SuiteKey)
			if err != nil {
				return nil, RunOutput{}, notFoundf("suite", in.SuiteKey, err)
			}
			runInput.SuiteID = suiteID
		}
		if in.TestPlanKey != "" {
			planID, err := svc.TestPlanIDByKey(ctx, in.TestPlanKey)
			if err != nil {
				return nil, RunOutput{}, notFoundf("test plan", in.TestPlanKey, err)
			}
			runInput.TestPlanID = planID
		}
		for _, key := range in.CaseKeys {
			caseID, err := svc.CaseIDByKey(ctx, key)
			if err != nil {
				return nil, RunOutput{}, notFoundf("case", key, err)
			}
			runInput.CaseIDs = append(runInput.CaseIDs, caseID)
		}
		run, err := svc.CreateRun(ctx, projectID, runInput)
		if err != nil {
			return nil, RunOutput{}, err
		}
		out := toRunOutput(run)
		if in.IdempotencyKey != "" {
			if err := saveIdempotentResult(ctx, svc, "create_test_run", in.IdempotencyKey, out); err != nil {
				return nil, RunOutput{}, err
			}
		}
		return textResult("Created run %s: %s", out.Key, out.Name), out, nil
	}
}

// findRunItemByCaseKey resolves a run item id from (runID, caseKey) — no
// direct store lookup exists for this pair, so record_result and
// update_run_item_status scan the run's items, acceptable for v0.1's thin
// adapter (runs are not large enough for this to matter; a dedicated store
// lookup can follow if that changes).
func findRunItemByCaseKey(ctx context.Context, svc *service.Service, runID, caseKey string) (string, error) {
	items, err := svc.RunItems(ctx, runID, "")
	if err != nil {
		return "", err
	}
	for _, item := range items {
		if item.CaseKey == caseKey {
			return item.ID, nil
		}
	}
	return "", fmt.Errorf("case %q is not part of this run", caseKey)
}

// StepResultInput mirrors domain.StepResult for MCP tool input (add-mcp-
// step-level-results), following the same pattern as StepInput/
// toDomainSteps: every MCP input type gets its own jsonschema-documented
// struct rather than reusing the domain type directly.
type StepResultInput struct {
	StepIndex int    `json:"stepIndex" jsonschema:"0-based index into the case's steps array"`
	Verdict   string `json:"verdict" jsonschema:"one of pass, failed, skipped, blocked"`
}

func toDomainStepResults(steps []StepResultInput) []domain.StepResult {
	out := make([]domain.StepResult, len(steps))
	for i, s := range steps {
		out[i] = domain.StepResult{StepIndex: s.StepIndex, Verdict: domain.Verdict(s.Verdict)}
	}
	return out
}

type RecordResultInput struct {
	RunKey  string `json:"runKey"`
	CaseKey string `json:"caseKey" jsonschema:"case key identifying which run item to record a result for"`
	Verdict string `json:"verdict" jsonschema:"one of pass, failed, skipped, blocked"`
	Comment string `json:"comment,omitempty"`
	// StepResults optionally submits step-level verdicts atomically with
	// the overall verdict (add-mcp-step-level-results), forwarded verbatim
	// to Service.RecordResult — the same field REST's NewResult.stepResults
	// already validates, bounds-checks, and syncs to the run item's live
	// state (add-step-level-results).
	StepResults []StepResultInput `json:"stepResults,omitempty" jsonschema:"optional per-step verdicts, submitted atomically with the overall verdict; stepIndex matches the case's pinned steps array"`
}

// ResultOutput mirrors domain.Result for MCP tool output, dropping
// RunItemID (no run-item-key concept exists anywhere — items are always
// addressed by the composite runKey/caseKey pair) in favor of the
// RunKey/CaseKey the caller already supplied as input (fix-mcp-output-id-
// leaks D2/D5).
type ResultOutput struct {
	RunKey      string                 `json:"runKey"`
	CaseKey     string                 `json:"caseKey"`
	Actor       string                 `json:"actor"`
	ActorKind   domain.ResultActorKind `json:"actorKind"`
	Verdict     domain.Verdict         `json:"verdict"`
	Comment     string                 `json:"comment"`
	StartTime   *time.Time             `json:"startTime,omitempty"`
	EndTime     *time.Time             `json:"endTime,omitempty"`
	Platform    string                 `json:"platform,omitempty"`
	Version     string                 `json:"version,omitempty"`
	Tags        []string               `json:"tags,omitempty"`
	Attachments []domain.Attachment    `json:"attachments,omitempty"`
	StepResults []domain.StepResult    `json:"stepResults,omitempty"`
	CreatedAt   time.Time              `json:"createdAt"`
}

func toResultOutput(r domain.Result, runKey, caseKey string) ResultOutput {
	return ResultOutput{
		RunKey: runKey, CaseKey: caseKey, Actor: r.Actor, ActorKind: r.ActorKind,
		Verdict: r.Verdict, Comment: r.Comment, StartTime: r.StartTime, EndTime: r.EndTime,
		Platform: r.Platform, Version: r.Version, Tags: r.Tags,
		Attachments: r.Attachments, StepResults: r.StepResults, CreatedAt: r.CreatedAt,
	}
}

func recordResult(svc *service.Service) sdkmcp.ToolHandlerFor[RecordResultInput, ResultOutput] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in RecordResultInput) (*sdkmcp.CallToolResult, ResultOutput, error) {
		runID, err := svc.RunIDByKey(ctx, in.RunKey)
		if err != nil {
			return nil, ResultOutput{}, notFoundf("run", in.RunKey, err)
		}
		projectID, err := svc.ProjectIDForRun(ctx, runID)
		if err != nil {
			return nil, ResultOutput{}, err
		}
		if err := svc.Authorize(ctx, domain.PermRunRecordResult, projectID); err != nil {
			return nil, ResultOutput{}, err
		}
		itemID, err := findRunItemByCaseKey(ctx, svc, runID, in.CaseKey)
		if err != nil {
			return nil, ResultOutput{}, err
		}
		result, err := svc.RecordResult(ctx, itemID, domain.NewResult{
			Verdict: domain.Verdict(in.Verdict), Comment: in.Comment,
			StepResults: toDomainStepResults(in.StepResults),
		})
		if err != nil {
			return nil, ResultOutput{}, err
		}
		out := toResultOutput(result, in.RunKey, in.CaseKey)
		return textResult("Recorded %s for case %s in run %s", out.Verdict, out.CaseKey, out.RunKey), out, nil
	}
}

type UpdateRunItemStatusInput struct {
	RunKey  string `json:"runKey"`
	CaseKey string `json:"caseKey"`
	Status  string `json:"status" jsonschema:"one of pending, pass, failed, skipped, blocked, retest"`
}

func updateRunItemStatus(svc *service.Service) sdkmcp.ToolHandlerFor[UpdateRunItemStatusInput, struct{}] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in UpdateRunItemStatusInput) (*sdkmcp.CallToolResult, struct{}, error) {
		runID, err := svc.RunIDByKey(ctx, in.RunKey)
		if err != nil {
			return nil, struct{}{}, notFoundf("run", in.RunKey, err)
		}
		projectID, err := svc.ProjectIDForRun(ctx, runID)
		if err != nil {
			return nil, struct{}{}, err
		}
		if err := svc.Authorize(ctx, domain.PermRunRecordResult, projectID); err != nil {
			return nil, struct{}{}, err
		}
		itemID, err := findRunItemByCaseKey(ctx, svc, runID, in.CaseKey)
		if err != nil {
			return nil, struct{}{}, err
		}
		status := in.Status
		if err := svc.UpdateItem(ctx, itemID, service.ItemUpdate{Status: &status}); err != nil {
			return nil, struct{}{}, err
		}
		return textResult("Set case %s in run %s to status %s", in.CaseKey, in.RunKey, in.Status), struct{}{}, nil
	}
}

type UpdateSuiteMembershipInput struct {
	SuiteKey string `json:"suiteKey" jsonschema:"existing suite key"`
	CaseKey  string `json:"caseKey" jsonschema:"existing case key, from the same project as the suite"`
	Action   string `json:"action" jsonschema:"one of add, remove"`
}

func updateSuiteMembership(svc *service.Service) sdkmcp.ToolHandlerFor[UpdateSuiteMembershipInput, SuiteOutput] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in UpdateSuiteMembershipInput) (*sdkmcp.CallToolResult, SuiteOutput, error) {
		suiteID, err := svc.SuiteIDByKey(ctx, in.SuiteKey)
		if err != nil {
			return nil, SuiteOutput{}, notFoundf("suite", in.SuiteKey, err)
		}
		projectID, err := svc.ProjectIDForSuite(ctx, suiteID)
		if err != nil {
			return nil, SuiteOutput{}, err
		}
		if err := svc.Authorize(ctx, domain.PermSuiteEditMembership, projectID); err != nil {
			return nil, SuiteOutput{}, err
		}
		caseID, err := svc.CaseIDByKey(ctx, in.CaseKey)
		if err != nil {
			return nil, SuiteOutput{}, notFoundf("case", in.CaseKey, err)
		}

		switch in.Action {
		case "add":
			if err := svc.AddCaseToSuite(ctx, suiteID, caseID); err != nil {
				return nil, SuiteOutput{}, err
			}
		case "remove":
			if err := svc.RemoveCaseFromSuite(ctx, suiteID, caseID); err != nil {
				return nil, SuiteOutput{}, err
			}
		default:
			return nil, SuiteOutput{}, fmt.Errorf("action must be one of add, remove, got %q", in.Action)
		}

		suite, err := svc.GetSuite(ctx, suiteID)
		if err != nil {
			return nil, SuiteOutput{}, err
		}
		out, err := toSuiteOutput(ctx, svc, suite)
		if err != nil {
			return nil, SuiteOutput{}, err
		}
		verb := "Added"
		if in.Action == "remove" {
			verb = "Removed"
		}
		preposition := "to"
		if in.Action == "remove" {
			preposition = "from"
		}
		return textResult("%s case %s %s suite %s (%d cases total)", verb, in.CaseKey, preposition, out.Key, len(out.CaseKeys)), out, nil
	}
}
