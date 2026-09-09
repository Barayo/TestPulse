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

// #180: custom-field validation moved from a per-case store fetch to one
// fetch for the whole batch (validateCustomFieldValuesAgainst). Covers both
// directions against the batch-level fetch: a valid value for a real field
// round-trips onto the created case, and an unknown field id anywhere in
// the batch still rejects the whole batch, same as the old per-case check.
func TestBulkAddCasesValidatesCustomFieldsAgainstBatchFetchedList(t *testing.T) {
	s := bulkAddCasesTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Bulk Add Cases Custom Fields"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	field, err := s.CreateCustomField(ctx, project.ID, "Owner", domain.CustomFieldTypeText)
	if err != nil {
		t.Fatalf("CreateCustomField: %v", err)
	}

	contents := []domain.CaseContent{
		{Title: "Case one", Priority: domain.PriorityHigh, CustomFields: map[string]string{field.ID: "ana"}},
		{Title: "Case two", Priority: domain.PriorityHigh, CustomFields: map[string]string{field.ID: "beto"}},
	}
	created, err := s.BulkAddCases(ctx, project.ID, "", contents)
	if err != nil {
		t.Fatalf("BulkAddCases with valid custom field values: %v", err)
	}
	if created[0].Content.CustomFields[field.ID] != "ana" || created[1].Content.CustomFields[field.ID] != "beto" {
		t.Fatalf("created custom field values = %+v, %+v; want ana, beto", created[0].Content.CustomFields, created[1].Content.CustomFields)
	}

	badContents := []domain.CaseContent{
		{Title: "Case three", Priority: domain.PriorityHigh},
		{Title: "Case four", Priority: domain.PriorityHigh, CustomFields: map[string]string{"not-a-real-field-id": "x"}},
	}
	_, err = s.BulkAddCases(ctx, project.ID, "", badContents)
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("BulkAddCases with an unknown custom field id = %v, want ValidationError", err)
	}
	all, listErr := s.ListCases(ctx, project.ID)
	if listErr != nil {
		t.Fatalf("ListCases: %v", listErr)
	}
	if len(all) != 2 {
		t.Fatalf("project has %d cases after the rejected second batch, want 2 (only the first batch)", len(all))
	}
}

// Security review finding (add-reusable-steps, post-implementation Luis
// pass): BulkAddCases skipped resolveStepGroupRefs entirely, unlike
// CreateCase/EditCase — a groupRef step went straight to the store
// unvalidated, breaking bulk_add_cases's own "all-or-nothing" contract and
// silently bricking the case on its next validated edit. These four tests
// cover the same ground step_group_resolution_test.go covers for
// CreateCase, through the BulkAddCases contract instead.

func TestBulkAddCasesResolvesGroupRefToFullStepSequence(t *testing.T) {
	s := bulkAddCasesTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Bulk Add Cases Group Ref"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	group, err := s.CreateStepGroup(ctx, project.ID, "Log in as admin", []domain.Step{
		{Action: "open login page"},
		{Action: "enter credentials"},
	})
	if err != nil {
		t.Fatalf("CreateStepGroup: %v", err)
	}

	created, err := s.BulkAddCases(ctx, project.ID, "", []domain.CaseContent{
		{
			Title:    "Uses a shared group",
			Priority: domain.PriorityMedium,
			Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: group.Key}}},
		},
	})
	if err != nil {
		t.Fatalf("BulkAddCases: %v", err)
	}
	steps := created[0].Content.Steps
	if len(steps) != 2 || steps[0].Action != "open login page" || steps[1].Action != "enter credentials" {
		t.Fatalf("created case steps = %+v, want the group's full resolved content", steps)
	}
}

func TestBulkAddCasesIgnoresClientSuppliedContentOnAGroupRef(t *testing.T) {
	s := bulkAddCasesTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Bulk Add Cases Group Ref Spoofing"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	group, err := s.CreateStepGroup(ctx, project.ID, "Real group", []domain.Step{{Action: "real content"}})
	if err != nil {
		t.Fatalf("CreateStepGroup: %v", err)
	}

	created, err := s.BulkAddCases(ctx, project.ID, "", []domain.CaseContent{
		{
			Title:    "Spoofing attempt",
			Priority: domain.PriorityMedium,
			Steps: []domain.Step{{
				Action:   "attacker-supplied action",
				Expected: "attacker-supplied expected",
				GroupRef: &domain.StepGroupRef{GroupKey: group.Key},
			}},
		},
	})
	if err != nil {
		t.Fatalf("BulkAddCases: %v", err)
	}
	if got := created[0].Content.Steps[0].Action; got != "real content" {
		t.Fatalf("resolved step action = %q, want the group's real content, not the client-supplied value", got)
	}
}

func TestBulkAddCasesRejectsUnknownGroupKey(t *testing.T) {
	s := bulkAddCasesTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Bulk Add Cases Unknown Group"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	_, err = s.BulkAddCases(ctx, project.ID, "", []domain.CaseContent{
		{
			Title:    "Unknown group",
			Priority: domain.PriorityMedium,
			Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: "SP-SG999"}}},
		},
	})
	if err == nil {
		t.Fatal("BulkAddCases with an unknown group key = nil error, want rejected")
	}
	all, listErr := s.ListCases(ctx, project.ID)
	if listErr != nil {
		t.Fatalf("ListCases: %v", listErr)
	}
	if len(all) != 0 {
		t.Fatalf("project has %d cases after a rejected batch, want 0", len(all))
	}
}

func TestBulkAddCasesRejectsGroupRefFromAnotherProject(t *testing.T) {
	s := bulkAddCasesTestService(t)
	ctx := context.Background()
	project1, err := s.CreateProject(ctx, service.ProjectInput{Name: "Bulk Add Cases Cross Project 1"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	project2, err := s.CreateProject(ctx, service.ProjectInput{Name: "Bulk Add Cases Cross Project 2"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	otherGroup, err := s.CreateStepGroup(ctx, project2.ID, "Other project's group", []domain.Step{{Action: "x"}})
	if err != nil {
		t.Fatalf("CreateStepGroup: %v", err)
	}

	_, err = s.BulkAddCases(ctx, project1.ID, "", []domain.CaseContent{
		{
			Title:    "Cross-project reference attempt",
			Priority: domain.PriorityMedium,
			Steps:    []domain.Step{{GroupRef: &domain.StepGroupRef{GroupKey: otherGroup.Key}}},
		},
	})
	if err == nil {
		t.Fatal("BulkAddCases with a group ref from a different project = nil error, want rejected")
	}
}
