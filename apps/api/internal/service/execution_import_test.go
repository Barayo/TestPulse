package service_test

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func importTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "execution_import_service")))
}

func importCtx() context.Context {
	return domain.WithActor(context.Background(), domain.Actor{
		ID: "agent-1", Kind: domain.ActorKindAgent, DisplayName: "ci-bot", EffectiveUserID: "agent-1",
	})
}

func mustImportProject(t *testing.T, s *service.Service, name string) domain.Project {
	t.Helper()
	p, err := s.CreateProject(context.Background(), service.ProjectInput{Name: name})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	return p
}

func mustImportCase(t *testing.T, s *service.Service, projectID, title string) domain.TestCase {
	t.Helper()
	c, err := s.CreateCase(context.Background(), projectID, "", domain.CaseContent{
		Title:    title,
		Steps:    []domain.Step{{Action: "do it"}},
		Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	return c
}

func junitReport(cases ...string) string {
	body := ""
	for _, key := range cases {
		body += fmt.Sprintf(`<testcase name="test_%s"><properties><property name="testpulse_case_key" value="%s"/></properties></testcase>`, key, key)
	}
	return fmt.Sprintf(`<testsuites><testsuite name="pytest">%s</testsuite></testsuites>`, body)
}

func TestImportMatchesCasesByKeyAndCreatesRun(t *testing.T) {
	s := importTestService(t)
	p := mustImportProject(t, s, "Login Service")
	c1 := mustImportCase(t, s, p.ID, "case one")
	c2 := mustImportCase(t, s, p.ID, "case two")

	result, err := s.Import(importCtx(), p.ID, service.ImportInput{
		Format: "junit-xml",
		Report: junitReport(c1.Key, c2.Key),
	})
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if result.Matched != 2 {
		t.Errorf("Matched = %d, want 2", result.Matched)
	}
	if len(result.Unmatched) != 0 {
		t.Errorf("Unmatched = %v, want none", result.Unmatched)
	}
	if result.Run.Name != "pytest" {
		t.Errorf("Run.Name = %q, want the report's own suite name", result.Run.Name)
	}

	items, err := s.RunItems(context.Background(), result.Run.ID, "")
	if err != nil || len(items) != 2 {
		t.Fatalf("RunItems = %d, %v; want 2", len(items), err)
	}
}

func TestImportReportsUnmatchedWithoutCreatingCases(t *testing.T) {
	s := importTestService(t)
	p := mustImportProject(t, s, "Payments")
	c := mustImportCase(t, s, p.ID, "known case")

	before, err := s.ListCases(context.Background(), p.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}

	result, err := s.Import(importCtx(), p.ID, service.ImportInput{
		Format: "junit-xml",
		Report: junitReport(c.Key, "PAY-999"),
	})
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if result.Matched != 1 {
		t.Errorf("Matched = %d, want 1", result.Matched)
	}
	if len(result.Unmatched) != 1 || result.Unmatched[0].CaseKey != "PAY-999" {
		t.Errorf("Unmatched = %+v, want one entry for PAY-999", result.Unmatched)
	}

	after, err := s.ListCases(context.Background(), p.ID)
	if err != nil {
		t.Fatalf("ListCases: %v", err)
	}
	if len(after) != len(before) {
		t.Errorf("case count changed: before %d, after %d — unmatched tests must not create cases", len(before), len(after))
	}

	items, err := s.RunItems(context.Background(), result.Run.ID, "")
	if err != nil || len(items) != 1 {
		t.Fatalf("RunItems = %d, %v; want 1 (only the matched case)", len(items), err)
	}
}

func TestImportOnlyMatchesCasesWithinTargetProject(t *testing.T) {
	s := importTestService(t)
	other := mustImportProject(t, s, "Other Project")
	otherCase := mustImportCase(t, s, other.ID, "belongs elsewhere")
	target := mustImportProject(t, s, "Target Project")

	result, err := s.Import(importCtx(), target.ID, service.ImportInput{
		Format: "junit-xml",
		Report: junitReport(otherCase.Key),
	})
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if result.Matched != 0 || len(result.Unmatched) != 1 {
		t.Errorf("Matched = %d, Unmatched = %v; want a cross-project key to be unmatched, not matched", result.Matched, result.Unmatched)
	}
}

func TestImportRejectsMalformedReport(t *testing.T) {
	s := importTestService(t)
	p := mustImportProject(t, s, "Broken Reports")

	_, err := s.Import(importCtx(), p.ID, service.ImportInput{Format: "junit-xml", Report: "not xml"})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("Import(malformed) error = %v, want a ValidationError", err)
	}
}

func TestImportRejectsUnsupportedFormat(t *testing.T) {
	s := importTestService(t)
	p := mustImportProject(t, s, "Format Check")

	_, err := s.Import(importCtx(), p.ID, service.ImportInput{Format: "tap", Report: "..."})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("Import(unsupported format) error = %v, want a ValidationError", err)
	}
}
