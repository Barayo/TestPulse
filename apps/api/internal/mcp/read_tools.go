package mcp

import (
	"context"
	"fmt"
	"time"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

// readAnnotations is shared by every read tool here: none modify anything,
// none are destructive, none reach outside TestPulse's own data.
var readAnnotations = &sdkmcp.ToolAnnotations{ReadOnlyHint: true, DestructiveHint: boolPtr(false), OpenWorldHint: boolPtr(false)}

func registerReadTools(srv *sdkmcp.Server, svc *service.Service) {
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "search",
		Description: "Cross-entity full-text search over test cases, suites, runs, projects, releases, and test plans, restricted to projects you can access. Start here to find real keys before calling a tool that needs one.",
		Annotations: readAnnotations,
	}, search(svc))
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "get_details",
		Description: "Fetch the full record for a single entity by its entityType and key — pass search's entityType/key straight through for one of its results.",
		Annotations: readAnnotations,
	}, getDetails(svc))
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "get_run_progress",
		Description: "Get a run's current status counts (pending/pass/failed/skipped/blocked/retest) and pass rate.",
		Annotations: readAnnotations,
	}, getRunProgress(svc))
	sdkmcp.AddTool(srv, &sdkmcp.Tool{
		Name:        "list_projects",
		Description: "List projects visible to you.",
		Annotations: readAnnotations,
	}, listProjects(svc))
}

type SearchInput struct {
	Query string `json:"query" jsonschema:"free-text search query"`
}

// SearchOutput wraps results in a named field — see BulkAddCasesOutput's
// comment: MCP tool outputSchema must be an "object" at the root.
type SearchOutput struct {
	Results []SearchResultOutput `json:"results"`
}

// SearchResultOutput mirrors domain.SearchResult for MCP tool output,
// substituting ProjectKey for ProjectID (fix-mcp-output-id-leaks D2),
// batch-resolved once per call rather than once per result (D3).
type SearchResultOutput struct {
	EntityType string  `json:"entityType"`
	Key        string  `json:"key"`
	Name       string  `json:"name"`
	ProjectKey string  `json:"projectKey"`
	Rank       float64 `json:"rank"`
}

func search(svc *service.Service) sdkmcp.ToolHandlerFor[SearchInput, SearchOutput] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in SearchInput) (*sdkmcp.CallToolResult, SearchOutput, error) {
		projectIDs, err := svc.AccessibleProjectIDs(ctx)
		if err != nil {
			return nil, SearchOutput{}, err
		}
		results, err := svc.Search(ctx, in.Query, projectIDs)
		if err != nil {
			return nil, SearchOutput{}, err
		}
		distinctIDs := make(map[string]struct{}, len(results))
		for _, r := range results {
			distinctIDs[r.ProjectID] = struct{}{}
		}
		ids := make([]string, 0, len(distinctIDs))
		for id := range distinctIDs {
			ids = append(ids, id)
		}
		keys, err := svc.ProjectKeysByIDs(ctx, ids)
		if err != nil {
			return nil, SearchOutput{}, err
		}
		out := make([]SearchResultOutput, len(results))
		for i, r := range results {
			out[i] = SearchResultOutput{
				EntityType: r.EntityType, Key: r.Key, Name: r.Name,
				ProjectKey: keys[r.ProjectID], Rank: r.Rank,
			}
		}
		return nil, SearchOutput{Results: out}, nil
	}
}

type GetDetailsInput struct {
	EntityType string `json:"entityType" jsonschema:"one of case, suite, run, project, release, testPlan"`
	Key        string `json:"key" jsonschema:"the entity's key"`
}

// ReleaseOutput mirrors domain.Release for MCP tool output, substituting
// ProjectKey for ProjectID (fix-mcp-output-id-leaks D2).
type ReleaseOutput struct {
	Key         string               `json:"key"`
	ProjectKey  string               `json:"projectKey"`
	Name        string               `json:"name"`
	Description string               `json:"description"`
	Status      domain.ReleaseStatus `json:"status"`
	CreatedAt   time.Time            `json:"createdAt"`
}

func toReleaseOutput(r domain.Release, projectKey string) ReleaseOutput {
	return ReleaseOutput{
		Key: r.Key, ProjectKey: projectKey, Name: r.Name,
		Description: r.Description, Status: r.Status, CreatedAt: r.CreatedAt,
	}
}

// TestPlanOutput mirrors domain.TestPlan for MCP tool output, substituting
// ProjectKey for ProjectID and dropping ReleaseID (ReleaseKey is already
// present on the same struct and sufficient) (fix-mcp-output-id-leaks D2).
type TestPlanOutput struct {
	Key         string    `json:"key"`
	ProjectKey  string    `json:"projectKey"`
	ReleaseKey  string    `json:"releaseKey"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
}

func toTestPlanOutput(p domain.TestPlan, projectKey string) TestPlanOutput {
	return TestPlanOutput{
		Key: p.Key, ProjectKey: projectKey, ReleaseKey: p.ReleaseKey,
		Name: p.Name, Description: p.Description, CreatedAt: p.CreatedAt,
	}
}

func getDetails(svc *service.Service) sdkmcp.ToolHandlerFor[GetDetailsInput, any] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in GetDetailsInput) (*sdkmcp.CallToolResult, any, error) {
		projectID, err := projectIDForEntity(ctx, svc, in.EntityType, in.Key)
		if err != nil {
			return nil, nil, err
		}
		if err := svc.Authorize(ctx, domain.PermRead, projectID); err != nil {
			return nil, nil, err
		}
		result, err := svc.GetDetails(ctx, in.EntityType, in.Key)
		if err != nil {
			return nil, nil, err
		}
		// Convert to the same ID-safe output shape the dedicated tool for
		// this entity type returns (fix-mcp-output-id-leaks D4). Run and
		// Project are already clean (Context) and pass through unchanged;
		// StepGroup is never a GetDetails dispatch target.
		switch v := result.(type) {
		case domain.TestCase:
			keys, err := svc.ProjectKeysByIDs(ctx, []string{projectID})
			if err != nil {
				return nil, nil, err
			}
			return nil, toTestCaseOutput(v, keys[projectID]), nil
		case domain.Suite:
			out, err := toSuiteOutput(ctx, svc, v)
			return nil, out, err
		case domain.Release:
			keys, err := svc.ProjectKeysByIDs(ctx, []string{projectID})
			if err != nil {
				return nil, nil, err
			}
			return nil, toReleaseOutput(v, keys[projectID]), nil
		case domain.TestPlan:
			keys, err := svc.ProjectKeysByIDs(ctx, []string{projectID})
			if err != nil {
				return nil, nil, err
			}
			return nil, toTestPlanOutput(v, keys[projectID]), nil
		default:
			return nil, result, nil
		}
	}
}

// projectIDForEntity resolves entityType/key to its owning project id, for
// get_details' pre-fetch authorization check — a key belonging to a
// different entity type fails at the *ByKey lookup (store.ErrNotFound),
// same as GetDetails itself, so a type/key mismatch is never distinguished
// from a nonexistent key.
func projectIDForEntity(ctx context.Context, svc *service.Service, entityType, key string) (string, error) {
	switch entityType {
	case "case":
		id, err := svc.CaseIDByKey(ctx, key)
		if err != nil {
			return "", notFoundf("case", key, err)
		}
		return svc.ProjectIDForCase(ctx, id)
	case "suite":
		id, err := svc.SuiteIDByKey(ctx, key)
		if err != nil {
			return "", notFoundf("suite", key, err)
		}
		return svc.ProjectIDForSuite(ctx, id)
	case "run":
		id, err := svc.RunIDByKey(ctx, key)
		if err != nil {
			return "", notFoundf("run", key, err)
		}
		return svc.ProjectIDForRun(ctx, id)
	case "project":
		id, err := svc.ProjectIDByKey(ctx, key)
		return id, notFoundf("project", key, err)
	case "release":
		id, err := svc.ReleaseIDByKey(ctx, key)
		if err != nil {
			return "", notFoundf("release", key, err)
		}
		return svc.ProjectIDForRelease(ctx, id)
	case "testPlan":
		id, err := svc.TestPlanIDByKey(ctx, key)
		if err != nil {
			return "", notFoundf("test plan", key, err)
		}
		return svc.ProjectIDForTestPlan(ctx, id)
	default:
		return "", fmt.Errorf("unknown entityType %q: must be one of case, suite, run, project, release, testPlan", entityType)
	}
}

type GetRunProgressInput struct {
	RunKey string `json:"runKey"`
}

func getRunProgress(svc *service.Service) sdkmcp.ToolHandlerFor[GetRunProgressInput, domain.RunSummary] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, in GetRunProgressInput) (*sdkmcp.CallToolResult, domain.RunSummary, error) {
		runID, err := svc.RunIDByKey(ctx, in.RunKey)
		if err != nil {
			return nil, domain.RunSummary{}, notFoundf("run", in.RunKey, err)
		}
		projectID, err := svc.ProjectIDForRun(ctx, runID)
		if err != nil {
			return nil, domain.RunSummary{}, err
		}
		if err := svc.Authorize(ctx, domain.PermRead, projectID); err != nil {
			return nil, domain.RunSummary{}, err
		}
		summary, err := svc.RunSummary(ctx, runID)
		return nil, summary, err
	}
}

type ListProjectsInput struct{}

// ListProjectsOutput wraps projects in a named field — see
// BulkAddCasesOutput's comment: MCP tool outputSchema must be an "object"
// at the root.
type ListProjectsOutput struct {
	Projects []domain.Project `json:"projects"`
}

func listProjects(svc *service.Service) sdkmcp.ToolHandlerFor[ListProjectsInput, ListProjectsOutput] {
	return func(ctx context.Context, _ *sdkmcp.CallToolRequest, _ ListProjectsInput) (*sdkmcp.CallToolResult, ListProjectsOutput, error) {
		projects, err := svc.AccessibleProjects(ctx)
		return nil, ListProjectsOutput{Projects: projects}, err
	}
}
