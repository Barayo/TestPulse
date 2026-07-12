package domain

import (
	"strings"
	"testing"
)

func TestStatusValidation(t *testing.T) {
	for _, valid := range []string{"pending", "pass", "failed", "skipped", "blocked", "retest"} {
		if _, err := ParseStatus(valid); err != nil {
			t.Errorf("ParseStatus(%q) = %v, want nil", valid, err)
		}
	}
	for _, invalid := range []string{"", "bogus", "PASS", "done"} {
		if _, err := ParseStatus(invalid); err == nil {
			t.Errorf("ParseStatus(%q) = nil error, want error", invalid)
		}
	}
}

func TestVerdictValidation(t *testing.T) {
	for _, valid := range []string{"pass", "failed", "skipped", "blocked"} {
		if _, err := ParseVerdict(valid); err != nil {
			t.Errorf("ParseVerdict(%q) = %v, want nil", valid, err)
		}
	}
	// retest and pending are statuses, never verdicts.
	for _, invalid := range []string{"retest", "pending", "", "bogus"} {
		if _, err := ParseVerdict(invalid); err == nil {
			t.Errorf("ParseVerdict(%q) = nil error, want error", invalid)
		}
	}
}

func TestVerdictBecomesStatus(t *testing.T) {
	v, err := ParseVerdict("failed")
	if err != nil {
		t.Fatal(err)
	}
	if got := v.Status(); got != StatusFailed {
		t.Errorf("verdict failed → status %q, want %q", got, StatusFailed)
	}
}

func TestCaseContentValidation(t *testing.T) {
	valid := CaseContent{Title: "Login works", Priority: PriorityMedium}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid content rejected: %v", err)
	}

	missingTitle := CaseContent{Priority: PriorityMedium}
	err := missingTitle.Validate()
	if err == nil {
		t.Fatal("content without title accepted")
	}
	if !strings.Contains(err.Error(), "title") {
		t.Errorf("error %q does not name the missing field", err)
	}

	badPriority := CaseContent{Title: "x", Priority: "urgent"}
	if err := badPriority.Validate(); err == nil {
		t.Error("invalid priority accepted")
	}
}

func TestResultValidation(t *testing.T) {
	valid := NewResult{Actor: "ana", Verdict: VerdictPass}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid result rejected: %v", err)
	}

	missingActor := NewResult{Verdict: VerdictPass}
	err := missingActor.Validate()
	if err == nil {
		t.Fatal("result without actor accepted")
	}
	if !strings.Contains(err.Error(), "actor") {
		t.Errorf("error %q does not name the missing field", err)
	}
}

func TestFolderNameRequired(t *testing.T) {
	if err := ValidateFolderName("Auth"); err != nil {
		t.Errorf("valid name rejected: %v", err)
	}
	err := ValidateFolderName("")
	if err == nil {
		t.Fatal("empty folder name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the field", err)
	}
}

func TestNewFolderRequiresParent(t *testing.T) {
	// A user can never directly create a root folder — only the DB trigger
	// creates roots, on project creation.
	valid := NewFolder{Name: "Auth", ParentFolderID: "root-id"}
	if err := valid.Validate(); err != nil {
		t.Errorf("valid folder rejected: %v", err)
	}

	missingParent := NewFolder{Name: "Auth"}
	err := missingParent.Validate()
	if err == nil {
		t.Fatal("folder without a parent accepted")
	}
	if !strings.Contains(err.Error(), "parent") {
		t.Errorf("error %q does not name the field", err)
	}
}

func TestProjectNameRequired(t *testing.T) {
	if err := ValidateProjectName("QA Platform"); err != nil {
		t.Errorf("valid name rejected: %v", err)
	}
	err := ValidateProjectName("")
	if err == nil {
		t.Fatal("empty project name accepted")
	}
	if !strings.Contains(err.Error(), "name") {
		t.Errorf("error %q does not name the field", err)
	}
}
