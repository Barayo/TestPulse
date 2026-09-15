package csvcases

import (
	"strings"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestParseRowsMapsFixedCoreColumns(t *testing.T) {
	csv := "Title,Description,Expected Result,Priority,Tags,Platform,Test Type,Automated\n" +
		"Login works,A login case,User is logged in,High,smoke;auth,web,e2e,true\n"

	valid, problems, newFieldNames, err := ParseRows(strings.NewReader(csv), nil)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(problems) != 0 {
		t.Fatalf("problems = %+v, want none", problems)
	}
	if len(newFieldNames) != 0 {
		t.Fatalf("newFieldNames = %+v, want none (no custom-field columns)", newFieldNames)
	}
	if len(valid) != 1 {
		t.Fatalf("valid = %+v, want 1 row", valid)
	}
	c := valid[0].Content
	if c.Title != "Login works" || c.Description != "A login case" || c.ExpectedResult != "User is logged in" {
		t.Fatalf("content = %+v, unexpected core fields", c)
	}
	if c.Priority != domain.PriorityHigh {
		t.Errorf("Priority = %q, want high", c.Priority)
	}
	if len(c.Tags) != 2 || c.Tags[0] != "smoke" || c.Tags[1] != "auth" {
		t.Errorf("Tags = %+v, want [smoke auth]", c.Tags)
	}
	if c.Platform != "web" || c.TestType != "e2e" {
		t.Errorf("Platform/TestType = %q/%q", c.Platform, c.TestType)
	}
	if !c.Automated {
		t.Error("Automated = false, want true")
	}
}

func TestParseRowsHeaderMatchingIsCaseInsensitiveAndTrimmed(t *testing.T) {
	csv := " title , EXPECTED RESULT \n" +
		"Case A,Some outcome\n"
	valid, problems, _, err := ParseRows(strings.NewReader(csv), nil)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(problems) != 0 {
		t.Fatalf("problems = %+v, want none", problems)
	}
	if len(valid) != 1 || valid[0].Content.Title != "Case A" || valid[0].Content.ExpectedResult != "Some outcome" {
		t.Fatalf("valid = %+v, want one row with Title/ExpectedResult mapped despite header casing/whitespace", valid)
	}
}

func TestParseRowsPriorityAndAutomatedAreCaseInsensitiveAndBlankIsUnset(t *testing.T) {
	csv := "Title,Priority,Automated\n" +
		"Case A,LOW,FALSE\n" +
		"Case B,,\n"
	valid, problems, _, err := ParseRows(strings.NewReader(csv), nil)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(problems) != 0 {
		t.Fatalf("problems = %+v, want none", problems)
	}
	if len(valid) != 2 {
		t.Fatalf("valid = %+v, want 2 rows", valid)
	}
	if valid[0].Content.Priority != domain.PriorityLow || valid[0].Content.Automated {
		t.Errorf("row 1 = %+v, want priority low, automated false", valid[0].Content)
	}
	if valid[1].Content.Priority != "" || valid[1].Content.Automated {
		t.Errorf("row 2 = %+v, want priority/automated unset (blank cells)", valid[1].Content)
	}
}

func TestParseRowsEmptyTitleIsARowProblemNotAHardError(t *testing.T) {
	// A row with an empty Title cell (not a wholly blank line — the CSV
	// reader itself silently skips those, so this needs another populated
	// column to keep the row from being invisible to Read()).
	csv := "Title,Priority\n" +
		",high\n" +
		"Case B,\n"
	valid, problems, _, err := ParseRows(strings.NewReader(csv), nil)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(valid) != 1 || valid[0].Content.Title != "Case B" {
		t.Fatalf("valid = %+v, want only Case B", valid)
	}
	if len(problems) != 1 || problems[0].Row != 2 {
		t.Fatalf("problems = %+v, want one problem at row 2 (the empty-title row)", problems)
	}
}

func TestParseRowsInvalidPriorityIsARowProblemAndParsingContinues(t *testing.T) {
	csv := "Title,Priority\n" +
		"Case A,not-a-priority\n" +
		"Case B,high\n"
	valid, problems, _, err := ParseRows(strings.NewReader(csv), nil)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(valid) != 1 || valid[0].Content.Title != "Case B" {
		t.Fatalf("valid = %+v, want only Case B (row 2 dropped, row 3 still imported)", valid)
	}
	if len(problems) != 1 || problems[0].Row != 2 {
		t.Fatalf("problems = %+v, want one problem at row 2", problems)
	}
}

func TestParseRowsUnrecognizedColumnBecomesNewCustomField(t *testing.T) {
	csv := "Title,Browser\n" +
		"Case A,Chrome\n" +
		"Case B,Firefox\n"
	valid, problems, newFieldNames, err := ParseRows(strings.NewReader(csv), nil)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(problems) != 0 {
		t.Fatalf("problems = %+v, want none", problems)
	}
	if len(newFieldNames) != 1 || newFieldNames[0] != "Browser" {
		t.Fatalf("newFieldNames = %+v, want [Browser]", newFieldNames)
	}
	if len(valid) != 2 {
		t.Fatalf("valid = %+v, want 2 rows", valid)
	}
	if valid[0].NewValues["Browser"] != "Chrome" || valid[1].NewValues["Browser"] != "Firefox" {
		t.Fatalf("NewValues = %+v / %+v, want Browser=Chrome / Browser=Firefox pending field creation", valid[0].NewValues, valid[1].NewValues)
	}
	if len(valid[0].Content.CustomFields) != 0 {
		t.Errorf("Content.CustomFields = %+v, want empty until the new field is created by the caller", valid[0].Content.CustomFields)
	}
}

func TestParseRowsExistingTextFieldResolvesDirectlyToFieldID(t *testing.T) {
	existing := []domain.CustomField{
		{ID: "field-1", Name: "Owner", FieldType: domain.CustomFieldTypeText},
	}
	csv := "Title,Owner\n" +
		"Case A,Alice\n"
	valid, problems, newFieldNames, err := ParseRows(strings.NewReader(csv), existing)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(problems) != 0 {
		t.Fatalf("problems = %+v, want none", problems)
	}
	if len(newFieldNames) != 0 {
		t.Fatalf("newFieldNames = %+v, want none (Owner already exists)", newFieldNames)
	}
	if got := valid[0].Content.CustomFields["field-1"]; got != "Alice" {
		t.Errorf("Content.CustomFields[field-1] = %q, want Alice", got)
	}
}

func TestParseRowsExistingSelectFieldResolvesValueToOptionID(t *testing.T) {
	existing := []domain.CustomField{
		{ID: "field-1", Name: "Environment", FieldType: domain.CustomFieldTypeSelect, Options: []domain.CustomFieldOption{
			{ID: "opt-1", Value: "Staging"},
			{ID: "opt-2", Value: "Production"},
		}},
	}
	csv := "Title,Environment\n" +
		"Case A,Production\n"
	valid, problems, _, err := ParseRows(strings.NewReader(csv), existing)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(problems) != 0 {
		t.Fatalf("problems = %+v, want none", problems)
	}
	if got := valid[0].Content.CustomFields["field-1"]; got != "opt-2" {
		t.Errorf("Content.CustomFields[field-1] = %q, want opt-2 (Production's option id)", got)
	}
}

func TestParseRowsSelectFieldValueNotAmongOptionsIsARowProblem(t *testing.T) {
	existing := []domain.CustomField{
		{ID: "field-1", Name: "Environment", FieldType: domain.CustomFieldTypeSelect, Options: []domain.CustomFieldOption{
			{ID: "opt-1", Value: "Staging"},
		}},
	}
	csv := "Title,Environment\n" +
		"Case A,NotARealOption\n" +
		"Case B,Staging\n"
	valid, problems, _, err := ParseRows(strings.NewReader(csv), existing)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(valid) != 1 || valid[0].Content.Title != "Case B" {
		t.Fatalf("valid = %+v, want only Case B", valid)
	}
	if len(problems) != 1 || problems[0].Row != 2 {
		t.Fatalf("problems = %+v, want one problem at row 2", problems)
	}
}

func TestParseRowsEmptyCustomFieldCellIsOmittedNotStoredEmpty(t *testing.T) {
	existing := []domain.CustomField{
		{ID: "field-1", Name: "Owner", FieldType: domain.CustomFieldTypeText},
	}
	csv := "Title,Owner\n" +
		"Case A,\n"
	valid, _, _, err := ParseRows(strings.NewReader(csv), existing)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if _, present := valid[0].Content.CustomFields["field-1"]; present {
		t.Errorf("Content.CustomFields = %+v, want no entry for an empty cell", valid[0].Content.CustomFields)
	}
}
