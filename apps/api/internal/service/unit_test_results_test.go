package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func unitTestResultsService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "unit_test_results_service")))
}

func nativeJUnitReport(testcases ...string) string {
	body := ""
	for _, name := range testcases {
		body += `<testcase classname="tests.test_mod" name="` + name + `" time="0.1"/>`
	}
	return `<testsuites><testsuite name="pytest">` + body + `</testsuite></testsuites>`
}

func TestImportUnitTestResultsRequiresNoTestPulseProperties(t *testing.T) {
	s := unitTestResultsService(t)
	p, err := s.CreateProject(context.Background(), service.ProjectInput{Name: "Backend"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	outcome, err := s.ImportUnitTestResults(importCtx(), p.ID, nativeJUnitReport("test_alpha", "test_beta"), "")
	if err != nil {
		t.Fatalf("ImportUnitTestResults: %v", err)
	}
	if outcome.Imported != 2 || outcome.Created != 2 || outcome.Updated != 0 {
		t.Errorf("outcome = %+v, want Imported=2 Created=2 Updated=0", outcome)
	}

	tests, _, err := s.ListUnitTestResults(context.Background(), p.ID, nil, "", 0)
	if err != nil {
		t.Fatalf("ListUnitTestResults: %v", err)
	}
	if len(tests) != 2 {
		t.Fatalf("ListUnitTestResults = %d tests, want 2", len(tests))
	}
}

func TestImportUnitTestResultsRejectsMalformedReport(t *testing.T) {
	s := unitTestResultsService(t)
	p, err := s.CreateProject(context.Background(), service.ProjectInput{Name: "Backend"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	_, err = s.ImportUnitTestResults(importCtx(), p.ID, "not xml at all", "")
	if _, ok := err.(*service.ValidationError); !ok {
		t.Errorf("error = %v (%T), want *service.ValidationError", err, err)
	}

	tests, _, err := s.ListUnitTestResults(context.Background(), p.ID, nil, "", 0)
	if err != nil {
		t.Fatalf("ListUnitTestResults: %v", err)
	}
	if len(tests) != 0 {
		t.Errorf("ListUnitTestResults = %d tests, want 0 (malformed report creates nothing)", len(tests))
	}
}

func TestImportUnitTestResultsIsIdempotentOnRetry(t *testing.T) {
	s := unitTestResultsService(t)
	p, err := s.CreateProject(context.Background(), service.ProjectInput{Name: "Backend"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	report := nativeJUnitReport("test_alpha")
	first, err := s.ImportUnitTestResults(importCtx(), p.ID, report, "retry-key-1")
	if err != nil {
		t.Fatalf("first ImportUnitTestResults: %v", err)
	}
	second, err := s.ImportUnitTestResults(importCtx(), p.ID, report, "retry-key-1")
	if err != nil {
		t.Fatalf("second ImportUnitTestResults: %v", err)
	}
	if second != first {
		t.Errorf("second outcome = %+v, want identical to first %+v (idempotent replay)", second, first)
	}

	history, err := s.UnitTestResultHistory(context.Background(), p.ID, "tests.test_mod", "test_alpha")
	if err != nil {
		t.Fatalf("UnitTestResultHistory: %v", err)
	}
	if len(history) != 1 {
		t.Errorf("history = %d results, want 1 (retry did not re-ingest)", len(history))
	}
}

func TestImportUnitTestResultsWithoutIdempotencyKeyAlwaysIngestsFresh(t *testing.T) {
	s := unitTestResultsService(t)
	p, err := s.CreateProject(context.Background(), service.ProjectInput{Name: "Backend"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	report := nativeJUnitReport("test_alpha")
	if _, err := s.ImportUnitTestResults(importCtx(), p.ID, report, ""); err != nil {
		t.Fatalf("first ImportUnitTestResults: %v", err)
	}
	if _, err := s.ImportUnitTestResults(importCtx(), p.ID, report, ""); err != nil {
		t.Fatalf("second ImportUnitTestResults: %v", err)
	}

	history, err := s.UnitTestResultHistory(context.Background(), p.ID, "tests.test_mod", "test_alpha")
	if err != nil {
		t.Fatalf("UnitTestResultHistory: %v", err)
	}
	if len(history) != 2 {
		t.Errorf("history = %d results, want 2 (no idempotency key means every call ingests fresh)", len(history))
	}
}
