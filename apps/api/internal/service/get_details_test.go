package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func getDetailsTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "get_details")))
}

// GetDetails backs the MCP get_details tool (add-mcp-server spec): fetch a
// full record by explicit {entity_type, key}, routed to the matching
// existing *ByKey lookup.

func TestGetDetailsRejectsUnknownEntityType(t *testing.T) {
	s := service.New(nil)
	_, err := s.GetDetails(context.Background(), "widget", "P1-W-1")
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("error %v is not a ValidationError for an unknown entity_type", err)
	}
}

func TestGetDetailsFetchesEachEntityTypeByKey(t *testing.T) {
	s := getDetailsTestService(t)
	ctx := context.Background()

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Get Details Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := s.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "A case", Priority: domain.PriorityHigh})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	suite, err := s.CreateSuite(ctx, project.ID, "A suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}
	run, err := s.CreateRun(ctx, project.ID, service.RunInput{Name: "A run"})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	release, err := s.CreateRelease(ctx, project.ID, "2026.1", "", domain.ReleaseStatusActive)
	if err != nil {
		t.Fatalf("CreateRelease: %v", err)
	}
	plan, err := s.CreateTestPlan(ctx, project.ID, release.ID, "A plan", "")
	if err != nil {
		t.Fatalf("CreateTestPlan: %v", err)
	}

	cases := []struct {
		entityType string
		key        string
	}{
		{"project", project.Key},
		{"case", c.Key},
		{"suite", suite.Key},
		{"run", run.Key},
		{"release", release.Key},
		{"testPlan", plan.Key},
	}
	for _, tc := range cases {
		result, err := s.GetDetails(ctx, tc.entityType, tc.key)
		if err != nil {
			t.Errorf("GetDetails(%q, %q): %v", tc.entityType, tc.key, err)
			continue
		}
		if result == nil {
			t.Errorf("GetDetails(%q, %q) returned nil result", tc.entityType, tc.key)
		}
	}
}

// A key that exists but belongs to a different entity type must not be
// returned as a match — IDByKey lookups are inherently type-scoped by
// table, so this also avoids leaking whether the key exists under another
// type.
func TestGetDetailsRejectsTypeKeyMismatch(t *testing.T) {
	s := getDetailsTestService(t)
	ctx := context.Background()

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Mismatch Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	suite, err := s.CreateSuite(ctx, project.ID, "A suite")
	if err != nil {
		t.Fatalf("CreateSuite: %v", err)
	}

	_, err = s.GetDetails(ctx, "run", suite.Key)
	if err == nil {
		t.Fatal("expected an error requesting a suite's key as entity_type run, got nil")
	}
}
