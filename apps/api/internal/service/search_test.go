package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func searchTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "search")))
}

// Search backs the MCP `search` tool (add-mcp-server spec: cross-entity
// full-text search over cases, suites, runs, projects, releases, and test
// plans, restricted to the caller's accessible projects).

func TestSearchRequiresQuery(t *testing.T) {
	s := service.New(nil)
	_, _, err := s.Search(context.Background(), "", []string{"p1"}, "", 0)
	if err == nil {
		t.Fatal("expected validation error for empty query, got nil")
	}
}

func TestSearchReturnsNoResultsWithoutAccessibleProjects(t *testing.T) {
	s := service.New(nil)
	results, _, err := s.Search(context.Background(), "login", nil, "", 0)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(results) != 0 {
		t.Fatalf("results = %v, want empty when no projects are accessible", results)
	}
}

func TestSearchFindsMatchesAcrossEntityTypes(t *testing.T) {
	s := searchTestService(t)
	ctx := context.Background()

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Checkout Flow"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	_, err = s.CreateCase(ctx, project.ID, "", domain.CaseContent{
		Title: "Checkout succeeds with a valid coupon", Priority: domain.PriorityHigh,
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	suite, err := s.CreateSuite(ctx, project.ID, "Checkout regression suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}

	results, _, err := s.Search(ctx, "checkout", []string{project.ID}, "", 0)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(results) < 3 { // project name + case title + suite name all mention "checkout"
		t.Fatalf("results = %+v, want at least 3 matches (project, case, suite)", results)
	}

	var sawProject, sawSuite bool
	for _, r := range results {
		if r.ProjectID != project.ID {
			t.Errorf("result %+v has ProjectID outside the searched project", r)
		}
		if r.EntityType == "project" && r.Key == project.Key {
			sawProject = true
		}
		if r.EntityType == "suite" && r.Key == suite.Key {
			sawSuite = true
		}
	}
	if !sawProject {
		t.Error("expected the project itself to match on its name")
	}
	if !sawSuite {
		t.Error("expected the suite to match on its name")
	}
}

// Search is restricted to the projectIDs passed in — the service trusts the
// caller (the MCP tool layer) to have already resolved the actor's
// accessible projects, same division of labor as every other project-scoped
// service method.
func TestSearchOnlyMatchesWithinGivenProjects(t *testing.T) {
	s := searchTestService(t)
	ctx := context.Background()

	visible, err := s.CreateProject(ctx, service.ProjectInput{Name: "Visible Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	hidden, err := s.CreateProject(ctx, service.ProjectInput{Name: "Hidden Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	if _, err := s.CreateSuite(ctx, visible.ID, "Shared keyword suite"); err != nil {
		t.Fatalf("CreateSuite (visible): %v", err)
	}
	if _, err := s.CreateSuite(ctx, hidden.ID, "Shared keyword suite"); err != nil {
		t.Fatalf("CreateSuite (hidden): %v", err)
	}

	results, _, err := s.Search(ctx, "shared keyword", []string{visible.ID}, "", 0)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("results = %+v, want exactly 1 match scoped to the visible project", results)
	}
	if results[0].ProjectID != visible.ID {
		t.Errorf("result project = %q, want %q (hidden project must not leak)", results[0].ProjectID, visible.ID)
	}
}
