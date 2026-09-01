package service_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func bulkAddCasesTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "bulk_add_cases")))
}

// BulkAddCases backs the MCP bulk_add_cases tool (add-mcp-server spec:
// "Requirement: bulk_add_cases tool") — a batch of test cases created in a
// single atomic transaction so an agent's flagship "read requirements.md,
// create a whole suite" demo either fully succeeds or fails with one clear,
// fixable error.

func TestBulkAddCasesRequiresAtLeastOneCase(t *testing.T) {
	s := service.New(nil)
	_, err := s.BulkAddCases(context.Background(), "p1", "", nil)
	if err == nil {
		t.Fatal("expected validation error for empty batch, got nil")
	}
}

func TestBulkAddCasesCreatesAllCasesInOneBatch(t *testing.T) {
	s := bulkAddCasesTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Bulk Add Cases"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	contents := []domain.CaseContent{
		{Title: "Login succeeds with valid credentials", Priority: domain.PriorityHigh},
		{Title: "Login rejects invalid password", Priority: domain.PriorityHigh},
		{Title: "Password reset email is sent", Priority: domain.PriorityMedium},
	}

	created, err := s.BulkAddCases(ctx, project.ID, "", contents)
	if err != nil {
		t.Fatalf("BulkAddCases: %v", err)
	}
	if len(created) != 3 {
		t.Fatalf("created %d cases, want 3", len(created))
	}
	for i, c := range created {
		if c.Key == "" {
			t.Errorf("case %d has empty key", i)
		}
		if c.Content.Title != contents[i].Title {
			t.Errorf("case %d title = %q, want %q", i, c.Content.Title, contents[i].Title)
		}
	}

	all, err := s.ListCases(ctx, project.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("project has %d cases after BulkAddCases, want 3", len(all))
	}
}

// One invalid case in the batch must roll back the entire batch — no case
// is created, matching the "atomic, all-or-nothing" design decision.
func TestBulkAddCasesRollsBackWholeBatchOnOneInvalidCase(t *testing.T) {
	s := bulkAddCasesTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Bulk Add Cases Rollback"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	contents := []domain.CaseContent{
		{Title: "Valid case one", Priority: domain.PriorityHigh},
		{Title: "", Priority: domain.PriorityHigh}, // invalid: empty title
		{Title: "Valid case three", Priority: domain.PriorityHigh},
	}

	_, err = s.BulkAddCases(ctx, project.ID, "", contents)
	if err == nil {
		t.Fatal("expected error for batch containing an invalid case, got nil")
	}
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("error %v is not a ValidationError", err)
	}
	if !strings.Contains(err.Error(), "title") {
		t.Errorf("error %q does not mention %q", err, "title")
	}

	all, listErr := s.ListCases(ctx, project.ID)
	if listErr != nil {
		t.Fatalf("ListCases: %v", listErr)
	}
	if len(all) != 0 {
		t.Fatalf("project has %d cases after a rejected batch, want 0 (no partial creation)", len(all))
	}
}
