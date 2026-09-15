package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func csvExportTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "csv_export")))
}

func TestExportCasesToCSVWithNoFolderIncludesWholeProject(t *testing.T) {
	s := csvExportTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "CSV Export"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatalf("rootFolder: %v", err)
	}
	sub, err := s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Auth", ParentFolderID: root.ID})
	if err != nil {
		t.Fatalf("CreateFolder: %v", err)
	}
	if _, err := s.CreateCase(ctx, project.ID, root.ID, domain.CaseContent{Title: "Root case", Priority: domain.PriorityLow}); err != nil {
		t.Fatalf("CreateCase (root): %v", err)
	}
	if _, err := s.CreateCase(ctx, project.ID, sub.ID, domain.CaseContent{Title: "Auth case", Priority: domain.PriorityHigh}); err != nil {
		t.Fatalf("CreateCase (sub): %v", err)
	}

	cases, _, err := s.ExportCasesToCSV(ctx, project.ID, nil)
	if err != nil {
		t.Fatalf("ExportCasesToCSV: %v", err)
	}
	if len(cases) != 2 {
		t.Fatalf("cases = %+v, want 2 (whole project)", cases)
	}
}

func TestExportCasesToCSVScopedToFolderExcludesOtherFolders(t *testing.T) {
	s := csvExportTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "CSV Export Folder Scoped"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatalf("rootFolder: %v", err)
	}
	sub, err := s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Auth", ParentFolderID: root.ID})
	if err != nil {
		t.Fatalf("CreateFolder: %v", err)
	}
	if _, err := s.CreateCase(ctx, project.ID, root.ID, domain.CaseContent{Title: "Root case", Priority: domain.PriorityLow}); err != nil {
		t.Fatalf("CreateCase (root): %v", err)
	}
	if _, err := s.CreateCase(ctx, project.ID, sub.ID, domain.CaseContent{Title: "Auth case", Priority: domain.PriorityHigh}); err != nil {
		t.Fatalf("CreateCase (sub): %v", err)
	}

	cases, _, err := s.ExportCasesToCSV(ctx, project.ID, &sub.ID)
	if err != nil {
		t.Fatalf("ExportCasesToCSV: %v", err)
	}
	if len(cases) != 1 || cases[0].Content.Title != "Auth case" {
		t.Fatalf("cases = %+v, want only Auth case (scoped to sub folder)", cases)
	}
}

func TestExportCasesToCSVIncludesProjectCustomFieldsInDisplayOrder(t *testing.T) {
	s := csvExportTestService(t)
	ctx := context.Background()
	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "CSV Export Fields"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	if _, err := s.CreateCustomField(ctx, project.ID, "Owner", domain.CustomFieldTypeText); err != nil {
		t.Fatalf("CreateCustomField Owner: %v", err)
	}
	if _, err := s.CreateCustomField(ctx, project.ID, "Environment", domain.CustomFieldTypeSelect); err != nil {
		t.Fatalf("CreateCustomField Environment: %v", err)
	}

	_, fields, err := s.ExportCasesToCSV(ctx, project.ID, nil)
	if err != nil {
		t.Fatalf("ExportCasesToCSV: %v", err)
	}
	if len(fields) != 2 || fields[0].Name != "Owner" || fields[1].Name != "Environment" {
		t.Fatalf("fields = %+v, want [Owner, Environment] in creation/display order", fields)
	}
}
