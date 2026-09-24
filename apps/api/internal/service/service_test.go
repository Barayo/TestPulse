package service

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// Validation must reject bad input BEFORE any store access: a Service with a
// nil store panics if validation lets anything through.

func nilService() *Service { return New(nil) }

func wantValidation(t *testing.T, err error, field string) {
	t.Helper()
	if err == nil {
		t.Fatal("expected validation error, got nil")
	}
	var verr *ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("error %v is not a ValidationError", err)
	}
	if field != "" && !strings.Contains(err.Error(), field) {
		t.Errorf("error %q does not mention %q", err, field)
	}
}

func TestCreateProjectRequiresName(t *testing.T) {
	_, err := nilService().CreateProject(context.Background(), ProjectInput{})
	wantValidation(t, err, "name")
}

func TestCreateCaseValidatesContent(t *testing.T) {
	s := nilService()
	_, err := s.CreateCase(context.Background(), "p1", "", domain.CaseContent{})
	wantValidation(t, err, "title")

	_, err = s.CreateCase(context.Background(), "p1", "", domain.CaseContent{Title: "x", Priority: "urgent"})
	wantValidation(t, err, "priority")
}

func TestCreateFolderValidates(t *testing.T) {
	s := nilService()
	_, err := s.CreateFolder(context.Background(), "p1", domain.NewFolder{ParentFolderID: "f1"})
	wantValidation(t, err, "name")

	_, err = s.CreateFolder(context.Background(), "p1", domain.NewFolder{Name: "Auth"})
	wantValidation(t, err, "parent")
}

func TestEditCaseValidatesContent(t *testing.T) {
	_, err := nilService().EditCase(context.Background(), "c1", domain.CaseContent{})
	wantValidation(t, err, "title")
}

func TestCreateSuiteRequiresName(t *testing.T) {
	_, err := nilService().CreateSuite(context.Background(), "p1", "")
	wantValidation(t, err, "name")
}

func TestRenameSuiteRequiresName(t *testing.T) {
	_, err := nilService().RenameSuite(context.Background(), "s1", "")
	wantValidation(t, err, "name")
}

func TestCreateRunRequiresName(t *testing.T) {
	_, err := nilService().CreateRun(context.Background(), "p1", RunInput{})
	wantValidation(t, err, "name")
}

func TestCreateReleaseRequiresName(t *testing.T) {
	_, err := nilService().CreateRelease(context.Background(), "p1", "", "", domain.ReleaseStatusActive)
	wantValidation(t, err, "name")
}

func TestCreateReleaseValidatesStatus(t *testing.T) {
	_, err := nilService().CreateRelease(context.Background(), "p1", "2026.1", "", "shipped")
	wantValidation(t, err, "status")
}

func TestUpdateReleaseValidates(t *testing.T) {
	_, err := nilService().UpdateRelease(context.Background(), "rel1", "", "", domain.ReleaseStatusActive)
	wantValidation(t, err, "name")
}

func TestCreateTestPlanRequiresName(t *testing.T) {
	_, err := nilService().CreateTestPlan(context.Background(), "p1", "rel1", "", "")
	wantValidation(t, err, "name")
}

func TestUpdateTestPlanRequiresName(t *testing.T) {
	_, err := nilService().UpdateTestPlan(context.Background(), "plan1", "", "")
	wantValidation(t, err, "name")
}

func TestRecordResultValidates(t *testing.T) {
	s := nilService()
	_, err := s.RecordResult(context.Background(), "i1", domain.NewResult{Actor: "ana", Verdict: "retest"})
	wantValidation(t, err, "verdict")
}

func TestUpdateItemValidatesStatus(t *testing.T) {
	s := nilService()
	bogus := "bogus"
	err := s.UpdateItem(context.Background(), "i1", ItemUpdate{Status: &bogus})
	wantValidation(t, err, "status")

	err = s.UpdateItem(context.Background(), "i1", ItemUpdate{})
	wantValidation(t, err, "")
}

func TestCreateUserValidatesEmailPassword(t *testing.T) {
	s := nilService()
	_, err := s.CreateUser(context.Background(), "", "longenoughpassword", false)
	wantValidation(t, err, "email")

	_, err = s.CreateUser(context.Background(), "a@b.com", "short", false)
	wantValidation(t, err, "12 characters")
}

func TestCreateTokenValidatesName(t *testing.T) {
	s := nilService()
	_, _, err := s.CreateToken(context.Background(), domain.Actor{ID: "u1", EffectiveUserID: "u1"}, "", nil, nil)
	wantValidation(t, err, "name")
}

func TestServiceLogsNothingByDefault(t *testing.T) {
	s := nilService()
	if s.logger == nil {
		t.Fatal("expected a non-nil default logger")
	}
	// Must not panic: the default logger is a safe discard sink.
	s.logger.Warn("this should go nowhere", "field", "value")
}

func TestWithLoggerSetsTheLogger(t *testing.T) {
	l := slog.New(slog.DiscardHandler)
	s := New(nil).WithLogger(l)
	if s.logger != l {
		t.Fatal("WithLogger did not set the supplied logger")
	}
}
