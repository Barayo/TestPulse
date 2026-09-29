package mcp

import (
	"context"
	"encoding/json"
	"fmt"

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
		Description: "Record a verdict (pass/failed/skipped/blocked) for a case within a run. Appends to that run item's result log — never overwrites a prior result.",
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

type UpsertTestCaseInput struct {
	CaseContentInput
	ProjectKey string `json:"projectKey,omitempty" jsonschema:"project key; required when creating a new case (omit caseKey)"`
	CaseKey    string `json:"caseKey,omitempty" jsonschema:"existing case key to edit; omit to create a new case in projectKey"`
	// IdempotencyKey only protects the create path (add-mcp-idempotency-
	// keys design.md Non-Goals) — a retried edit still creates a new
	// version each time.
	IdempotencyKey string `json:"idempotencyKey,omitempty" jsonschema:"optional, create path only: retrying with the same key returns the original case instead of creating a second one"`
}

func upsertTestCase(svc *service.Service) sdkmcp.ToolHandlerFor[UpsertTestCaseInput, domain.TestCase] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in UpsertTestCaseInput) (*sdkmcp.CallToolResult, domain.TestCase, error) {
		content := in.toDomain()
		if in.CaseKey != "" {
			caseID, err := svc.CaseIDByKey(ctx, in.CaseKey)
			if err != nil {
				return nil, domain.TestCase{}, notFoundf("case", in.CaseKey, err)
			}
			projectID, err := svc.ProjectIDForCase(ctx, caseID)
			if err != nil {
				return nil, domain.TestCase{}, err
			}
			if err := svc.Authorize(ctx, domain.PermCaseEdit, projectID); err != nil {
				return nil, domain.TestCase{}, err
			}
			c, err := svc.EditCase(ctx, caseID, content)
			return nil, c, err
		}
		if in.ProjectKey == "" {
			return nil, domain.TestCase{}, fmt.Errorf("projectKey is required to create a new case")
		}
		projectID, err := svc.ProjectIDByKey(ctx, in.ProjectKey)
		if err != nil {
			return nil, domain.TestCase{}, notFoundf("project", in.ProjectKey, err)
		}
		if err := svc.Authorize(ctx, domain.PermCaseCreate, projectID); err != nil {
			return nil, domain.TestCase{}, err
		}
		if in.IdempotencyKey != "" {
			if cached, ok, err := idempotentResult[domain.TestCase](ctx, svc, "upsert_test_case", in.IdempotencyKey); err != nil {
				return nil, domain.TestCase{}, err
			} else if ok {
				return nil, cached, nil
			}
		}
		c, err := svc.CreateCase(ctx, projectID, "", content)
		if err != nil {
			return nil, domain.TestCase{}, err
		}
		if in.IdempotencyKey != "" {
			if err := saveIdempotentResult(ctx, svc, "upsert_test_case", in.IdempotencyKey, c); err != nil {
				return nil, domain.TestCase{}, err
			}
		}
		return nil, c, nil
	}
}

type UpsertTestSuiteInput struct {
	ProjectKey string `json:"projectKey,omitempty" jsonschema:"project key; required when creating a new suite (omit suiteKey)"`
	SuiteKey   string `json:"suiteKey,omitempty" jsonschema:"existing suite key to rename; omit to create a new suite in projectKey"`
	Name       string `json:"name" jsonschema:"suite name"`
}

func upsertTestSuite(svc *service.Service) sdkmcp.ToolHandlerFor[UpsertTestSuiteInput, domain.Suite] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in UpsertTestSuiteInput) (*sdkmcp.CallToolResult, domain.Suite, error) {
		if in.SuiteKey != "" {
			suiteID, err := svc.SuiteIDByKey(ctx, in.SuiteKey)
			if err != nil {
				return nil, domain.Suite{}, notFoundf("suite", in.SuiteKey, err)
			}
			projectID, err := svc.ProjectIDForSuite(ctx, suiteID)
			if err != nil {
				return nil, domain.Suite{}, err
			}
			if err := svc.Authorize(ctx, domain.PermSuiteEditMembership, projectID); err != nil {
				return nil, domain.Suite{}, err
			}
			s, err := svc.RenameSuite(ctx, suiteID, in.Name)
			return nil, s, err
		}
		if in.ProjectKey == "" {
			return nil, domain.Suite{}, fmt.Errorf("projectKey is required to create a new suite")
		}
		projectID, err := svc.ProjectIDByKey(ctx, in.ProjectKey)
		if err != nil {
			return nil, domain.Suite{}, notFoundf("project", in.ProjectKey, err)
		}
		if err := svc.Authorize(ctx, domain.PermSuiteCreate, projectID); err != nil {
			return nil, domain.Suite{}, err
		}
		s, err := svc.CreateSuite(ctx, projectID, in.Name)
		return nil, s, err
	}
}

type UpsertStepGroupInput struct {
	ProjectKey string      `json:"projectKey,omitempty" jsonschema:"project key; required when creating a new step group (omit groupKey)"`
	GroupKey   string      `json:"groupKey,omitempty" jsonschema:"existing step group key to edit; omit to create a new step group in projectKey"`
	Name       string      `json:"name" jsonschema:"step group name"`
	Steps      []StepInput `json:"steps" jsonschema:"the group's ordered steps"`
}

func upsertStepGroup(svc *service.Service) sdkmcp.ToolHandlerFor[UpsertStepGroupInput, domain.StepGroup] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in UpsertStepGroupInput) (*sdkmcp.CallToolResult, domain.StepGroup, error) {
		steps := toDomainSteps(in.Steps)
		if in.GroupKey != "" {
			groupID, err := svc.StepGroupIDByKey(ctx, in.GroupKey)
			if err != nil {
				return nil, domain.StepGroup{}, notFoundf("step group", in.GroupKey, err)
			}
			projectID, err := svc.ProjectIDForStepGroup(ctx, groupID)
			if err != nil {
				return nil, domain.StepGroup{}, err
			}
			if err := svc.Authorize(ctx, domain.PermManageProject, projectID); err != nil {
				return nil, domain.StepGroup{}, err
			}
			g, err := svc.UpdateStepGroup(ctx, groupID, in.Name, steps)
			return nil, g, err
		}
		if in.ProjectKey == "" {
			return nil, domain.StepGroup{}, fmt.Errorf("projectKey is required to create a new step group")
		}
		projectID, err := svc.ProjectIDByKey(ctx, in.ProjectKey)
		if err != nil {
			return nil, domain.StepGroup{}, notFoundf("project", in.ProjectKey, err)
		}
		if err := svc.Authorize(ctx, domain.PermManageProject, projectID); err != nil {
			return nil, domain.StepGroup{}, err
		}
		g, err := svc.CreateStepGroup(ctx, projectID, in.Name, steps)
		return nil, g, err
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
	Cases []domain.TestCase `json:"cases"`
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
				return nil, cached, nil
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
		out := BulkAddCasesOutput{Cases: cases}
		if in.IdempotencyKey != "" {
			if err := saveIdempotentResult(ctx, svc, "bulk_add_cases", in.IdempotencyKey, out); err != nil {
				return nil, BulkAddCasesOutput{}, err
			}
		}
		return nil, out, nil
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

func createTestRun(svc *service.Service) sdkmcp.ToolHandlerFor[CreateTestRunInput, domain.Run] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in CreateTestRunInput) (*sdkmcp.CallToolResult, domain.Run, error) {
		projectID, err := svc.ProjectIDByKey(ctx, in.ProjectKey)
		if err != nil {
			return nil, domain.Run{}, notFoundf("project", in.ProjectKey, err)
		}
		if err := svc.Authorize(ctx, domain.PermRunCreate, projectID); err != nil {
			return nil, domain.Run{}, err
		}
		if in.IdempotencyKey != "" {
			if cached, ok, err := idempotentResult[domain.Run](ctx, svc, "create_test_run", in.IdempotencyKey); err != nil {
				return nil, domain.Run{}, err
			} else if ok {
				return nil, cached, nil
			}
		}

		runInput := service.RunInput{Name: in.Name}
		if in.SuiteKey != "" {
			suiteID, err := svc.SuiteIDByKey(ctx, in.SuiteKey)
			if err != nil {
				return nil, domain.Run{}, notFoundf("suite", in.SuiteKey, err)
			}
			runInput.SuiteID = suiteID
		}
		if in.TestPlanKey != "" {
			planID, err := svc.TestPlanIDByKey(ctx, in.TestPlanKey)
			if err != nil {
				return nil, domain.Run{}, notFoundf("test plan", in.TestPlanKey, err)
			}
			runInput.TestPlanID = planID
		}
		for _, key := range in.CaseKeys {
			caseID, err := svc.CaseIDByKey(ctx, key)
			if err != nil {
				return nil, domain.Run{}, notFoundf("case", key, err)
			}
			runInput.CaseIDs = append(runInput.CaseIDs, caseID)
		}
		run, err := svc.CreateRun(ctx, projectID, runInput)
		if err != nil {
			return nil, domain.Run{}, err
		}
		if in.IdempotencyKey != "" {
			if err := saveIdempotentResult(ctx, svc, "create_test_run", in.IdempotencyKey, run); err != nil {
				return nil, domain.Run{}, err
			}
		}
		return nil, run, nil
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

type RecordResultInput struct {
	RunKey  string `json:"runKey"`
	CaseKey string `json:"caseKey" jsonschema:"case key identifying which run item to record a result for"`
	Verdict string `json:"verdict" jsonschema:"one of pass, failed, skipped, blocked"`
	Comment string `json:"comment,omitempty"`
}

func recordResult(svc *service.Service) sdkmcp.ToolHandlerFor[RecordResultInput, domain.Result] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in RecordResultInput) (*sdkmcp.CallToolResult, domain.Result, error) {
		runID, err := svc.RunIDByKey(ctx, in.RunKey)
		if err != nil {
			return nil, domain.Result{}, notFoundf("run", in.RunKey, err)
		}
		projectID, err := svc.ProjectIDForRun(ctx, runID)
		if err != nil {
			return nil, domain.Result{}, err
		}
		if err := svc.Authorize(ctx, domain.PermRunRecordResult, projectID); err != nil {
			return nil, domain.Result{}, err
		}
		itemID, err := findRunItemByCaseKey(ctx, svc, runID, in.CaseKey)
		if err != nil {
			return nil, domain.Result{}, err
		}
		result, err := svc.RecordResult(ctx, itemID, domain.NewResult{Verdict: domain.Verdict(in.Verdict), Comment: in.Comment})
		return nil, result, err
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
		err = svc.UpdateItem(ctx, itemID, service.ItemUpdate{Status: &status})
		return nil, struct{}{}, err
	}
}

type UpdateSuiteMembershipInput struct {
	SuiteKey string `json:"suiteKey" jsonschema:"existing suite key"`
	CaseKey  string `json:"caseKey" jsonschema:"existing case key, from the same project as the suite"`
	Action   string `json:"action" jsonschema:"one of add, remove"`
}

// UpdateSuiteMembershipOutput returns the suite's resulting membership as
// case keys, not internal case IDs (add-mcp-suite-membership-tool design.md
// D3) — unlike domain.Suite.CaseIDs, which is not usable as MCP tool input.
type UpdateSuiteMembershipOutput struct {
	SuiteKey string   `json:"suiteKey"`
	CaseKeys []string `json:"caseKeys"`
}

func updateSuiteMembership(svc *service.Service) sdkmcp.ToolHandlerFor[UpdateSuiteMembershipInput, UpdateSuiteMembershipOutput] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in UpdateSuiteMembershipInput) (*sdkmcp.CallToolResult, UpdateSuiteMembershipOutput, error) {
		suiteID, err := svc.SuiteIDByKey(ctx, in.SuiteKey)
		if err != nil {
			return nil, UpdateSuiteMembershipOutput{}, notFoundf("suite", in.SuiteKey, err)
		}
		projectID, err := svc.ProjectIDForSuite(ctx, suiteID)
		if err != nil {
			return nil, UpdateSuiteMembershipOutput{}, err
		}
		if err := svc.Authorize(ctx, domain.PermSuiteEditMembership, projectID); err != nil {
			return nil, UpdateSuiteMembershipOutput{}, err
		}
		caseID, err := svc.CaseIDByKey(ctx, in.CaseKey)
		if err != nil {
			return nil, UpdateSuiteMembershipOutput{}, notFoundf("case", in.CaseKey, err)
		}

		switch in.Action {
		case "add":
			if err := svc.AddCaseToSuite(ctx, suiteID, caseID); err != nil {
				return nil, UpdateSuiteMembershipOutput{}, err
			}
		case "remove":
			if err := svc.RemoveCaseFromSuite(ctx, suiteID, caseID); err != nil {
				return nil, UpdateSuiteMembershipOutput{}, err
			}
		default:
			return nil, UpdateSuiteMembershipOutput{}, fmt.Errorf("action must be one of add, remove, got %q", in.Action)
		}

		suite, err := svc.GetSuite(ctx, suiteID)
		if err != nil {
			return nil, UpdateSuiteMembershipOutput{}, err
		}
		caseKeys := make([]string, len(suite.CaseIDs))
		for i, id := range suite.CaseIDs {
			c, err := svc.GetCase(ctx, id)
			if err != nil {
				return nil, UpdateSuiteMembershipOutput{}, err
			}
			caseKeys[i] = c.Key
		}
		return nil, UpdateSuiteMembershipOutput{SuiteKey: suite.Key, CaseKeys: caseKeys}, nil
	}
}
