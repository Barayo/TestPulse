package service_test

import (
	"context"
	"strings"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func csvImportTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "csv_import")))
}

func TestImportCasesFromCSVCreatesValidRowsAndReportsInvalidOnes(t *testing.T) {
	s := csvImportTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "CSV Import"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatalf("rootFolder: %v", err)
	}

	csv := "Title,Priority\n" +
		"Case A,high\n" +
		",high\n" + // invalid: empty title
		"Case C,not-a-priority\n" + // invalid: bad priority
		"Case D,low\n"

	created, newFields, problems, err := s.ImportCasesFromCSV(ctx, project.ID, root.ID, strings.NewReader(csv))
	if err != nil {
		t.Fatalf("ImportCasesFromCSV: %v", err)
	}
	if created != 2 {
		t.Fatalf("created = %d, want 2 (Case A and Case D)", created)
	}
	if len(newFields) != 0 {
		t.Errorf("newFields = %+v, want none (no custom-field columns in this CSV)", newFields)
	}
	if len(problems) != 2 {
		t.Fatalf("problems = %+v, want 2", problems)
	}

	cases, err := s.ListCases(ctx, project.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if len(cases) != 2 {
		t.Fatalf("project has %d cases, want 2", len(cases))
	}
}

func TestImportCasesFromCSVCreatesNewCustomFieldsBeforeImporting(t *testing.T) {
	s := csvImportTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "CSV Import New Fields"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatalf("rootFolder: %v", err)
	}

	csv := "Title,Browser\n" +
		"Case A,Chrome\n" +
		"Case B,Firefox\n"

	created, newFields, problems, err := s.ImportCasesFromCSV(ctx, project.ID, root.ID, strings.NewReader(csv))
	if err != nil {
		t.Fatalf("ImportCasesFromCSV: %v", err)
	}
	if created != 2 || len(problems) != 0 {
		t.Fatalf("created=%d problems=%+v, want 2 created, no problems", created, problems)
	}
	if len(newFields) != 1 || newFields[0] != "Browser" {
		t.Fatalf("newFields = %+v, want [Browser]", newFields)
	}

	fields, err := s.ListCustomFields(ctx, project.ID)
	if err != nil {
		t.Fatalf("ListCustomFields: %v", err)
	}
	if len(fields) != 1 || fields[0].Name != "Browser" || fields[0].FieldType != domain.CustomFieldTypeText {
		t.Fatalf("fields = %+v, want one text field named Browser", fields)
	}

	cases, err := s.ListCases(ctx, project.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	values := map[string]string{}
	for _, c := range cases {
		values[c.Content.Title] = c.Content.CustomFields[fields[0].ID]
	}
	if values["Case A"] != "Chrome" || values["Case B"] != "Firefox" {
		t.Fatalf("Browser values = %+v, want Case A=Chrome, Case B=Firefox", values)
	}
}

func TestImportCasesFromCSVReusesAnExistingFieldByName(t *testing.T) {
	s := csvImportTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "CSV Import Existing Field"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatalf("rootFolder: %v", err)
	}
	existing, err := s.CreateCustomField(ctx, project.ID, "Owner", domain.CustomFieldTypeText)
	if err != nil {
		t.Fatalf("CreateCustomField: %v", err)
	}

	csv := "Title,Owner\n" +
		"Case A,Alice\n"

	created, newFields, problems, err := s.ImportCasesFromCSV(ctx, project.ID, root.ID, strings.NewReader(csv))
	if err != nil {
		t.Fatalf("ImportCasesFromCSV: %v", err)
	}
	if created != 1 || len(problems) != 0 {
		t.Fatalf("created=%d problems=%+v, want 1 created, no problems", created, problems)
	}
	if len(newFields) != 0 {
		t.Errorf("newFields = %+v, want none — Owner already existed", newFields)
	}

	fields, err := s.ListCustomFields(ctx, project.ID)
	if err != nil {
		t.Fatalf("ListCustomFields: %v", err)
	}
	if len(fields) != 1 {
		t.Fatalf("fields = %+v, want still exactly 1 (reused, not duplicated)", fields)
	}

	cases, err := s.ListCases(ctx, project.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if cases[0].Content.CustomFields[existing.ID] != "Alice" {
		t.Fatalf("case custom field = %+v, want %s=Alice", cases[0].Content.CustomFields, existing.ID)
	}
}

func TestImportCasesFromCSVAllRowsInvalidCreatesNothing(t *testing.T) {
	s := csvImportTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "CSV Import All Invalid"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatalf("rootFolder: %v", err)
	}

	csv := "Title,Priority\n" +
		",high\n" +
		",low\n"

	created, newFields, problems, err := s.ImportCasesFromCSV(ctx, project.ID, root.ID, strings.NewReader(csv))
	if err != nil {
		t.Fatalf("ImportCasesFromCSV: %v", err)
	}
	if created != 0 {
		t.Fatalf("created = %d, want 0", created)
	}
	if len(newFields) != 0 {
		t.Errorf("newFields = %+v, want none", newFields)
	}
	if len(problems) != 2 {
		t.Fatalf("problems = %+v, want 2", problems)
	}
	cases, err := s.ListCases(ctx, project.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if len(cases) != 0 {
		t.Fatalf("project has %d cases, want 0", len(cases))
	}
}
