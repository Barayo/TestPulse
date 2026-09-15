package csvcases

import (
	"bytes"
	"encoding/csv"
	"strings"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestWriteRowsFixedColumnsAndOrder(t *testing.T) {
	cases := []domain.TestCase{
		{Content: domain.CaseContent{
			Title: "Login works", Description: "A login case", ExpectedResult: "User is logged in",
			Priority: domain.PriorityHigh, Tags: []string{"smoke", "auth"}, Platform: "web", TestType: "e2e", Automated: true,
		}},
	}
	var buf bytes.Buffer
	if err := WriteRows(&buf, cases, nil); err != nil {
		t.Fatalf("WriteRows: %v", err)
	}
	records := readAll(t, &buf)
	if len(records) != 2 {
		t.Fatalf("records = %+v, want header + 1 data row", records)
	}
	if got := records[0]; len(got) != 8 || got[0] != FixedColumns[0] {
		t.Fatalf("header = %+v, want FixedColumns %+v", got, FixedColumns)
	}
	data := records[1]
	if data[0] != "Login works" || data[1] != "A login case" || data[2] != "User is logged in" {
		t.Fatalf("data row = %+v, unexpected core columns", data)
	}
	if data[3] != "high" {
		t.Errorf("Priority column = %q, want high", data[3])
	}
	if data[4] != "smoke;auth" {
		t.Errorf("Tags column = %q, want smoke;auth", data[4])
	}
	if data[5] != "web" || data[6] != "e2e" {
		t.Errorf("Platform/TestType = %q/%q", data[5], data[6])
	}
	if data[7] != "true" {
		t.Errorf("Automated column = %q, want true", data[7])
	}
}

func TestWriteRowsIncludesCustomFieldColumnsInOrder(t *testing.T) {
	fields := []domain.CustomField{
		{ID: "field-1", Name: "Owner", FieldType: domain.CustomFieldTypeText},
		{ID: "field-2", Name: "Environment", FieldType: domain.CustomFieldTypeSelect, Options: []domain.CustomFieldOption{
			{ID: "opt-1", Value: "Staging"},
			{ID: "opt-2", Value: "Production"},
		}},
	}
	cases := []domain.TestCase{
		{Content: domain.CaseContent{Title: "Case A", CustomFields: map[string]string{
			"field-1": "Alice",
			"field-2": "opt-2", // stored as an option id
		}}},
		{Content: domain.CaseContent{Title: "Case B"}}, // no custom field values at all
	}
	var buf bytes.Buffer
	if err := WriteRows(&buf, cases, fields); err != nil {
		t.Fatalf("WriteRows: %v", err)
	}
	records := readAll(t, &buf)
	header := records[0]
	if len(header) != 10 || header[8] != "Owner" || header[9] != "Environment" {
		t.Fatalf("header = %+v, want fixed columns then Owner, Environment", header)
	}
	rowA := records[1]
	if rowA[8] != "Alice" {
		t.Errorf("Owner column = %q, want Alice", rowA[8])
	}
	// The select field's stored option id resolves back to its display
	// value, not the opaque id — human-readable and re-importable.
	if rowA[9] != "Production" {
		t.Errorf("Environment column = %q, want Production (resolved from opt-2)", rowA[9])
	}
	rowB := records[2]
	if rowB[8] != "" || rowB[9] != "" {
		t.Errorf("Case B's custom field columns = %q / %q, want blank (no values set)", rowB[8], rowB[9])
	}
}

func TestWriteRowsThenParseRowsRoundTrips(t *testing.T) {
	fields := []domain.CustomField{
		{ID: "field-1", Name: "Owner", FieldType: domain.CustomFieldTypeText},
		{ID: "field-2", Name: "Environment", FieldType: domain.CustomFieldTypeSelect, Options: []domain.CustomFieldOption{
			{ID: "opt-1", Value: "Staging"},
			{ID: "opt-2", Value: "Production"},
		}},
	}
	original := []domain.TestCase{
		{Content: domain.CaseContent{
			Title: "Login works", Description: "A login case", ExpectedResult: "User is logged in",
			Priority: domain.PriorityCritical, Tags: []string{"smoke", "auth"}, Platform: "web", TestType: "e2e", Automated: true,
			CustomFields: map[string]string{"field-1": "Alice", "field-2": "opt-2"},
		}},
		{Content: domain.CaseContent{Title: "No frills case"}},
	}

	var buf bytes.Buffer
	if err := WriteRows(&buf, original, fields); err != nil {
		t.Fatalf("WriteRows: %v", err)
	}

	valid, problems, newFieldNames, err := ParseRows(&buf, fields)
	if err != nil {
		t.Fatalf("ParseRows: %v", err)
	}
	if len(problems) != 0 {
		t.Fatalf("problems = %+v, want none on a round trip", problems)
	}
	if len(newFieldNames) != 0 {
		t.Fatalf("newFieldNames = %+v, want none — Owner/Environment already exist", newFieldNames)
	}
	if len(valid) != 2 {
		t.Fatalf("valid = %+v, want 2 rows", valid)
	}

	got, want := valid[0].Content, original[0].Content
	if got.Title != want.Title || got.Description != want.Description || got.ExpectedResult != want.ExpectedResult {
		t.Errorf("round-tripped core fields = %+v, want %+v", got, want)
	}
	if got.Priority != want.Priority {
		t.Errorf("Priority = %q, want %q", got.Priority, want.Priority)
	}
	if len(got.Tags) != 2 || got.Tags[0] != "smoke" || got.Tags[1] != "auth" {
		t.Errorf("Tags = %+v, want [smoke auth]", got.Tags)
	}
	if got.Platform != want.Platform || got.TestType != want.TestType || got.Automated != want.Automated {
		t.Errorf("Platform/TestType/Automated = %+v, want %+v", got, want)
	}
	if got.CustomFields["field-1"] != "Alice" {
		t.Errorf("CustomFields[field-1] = %q, want Alice", got.CustomFields["field-1"])
	}
	if got.CustomFields["field-2"] != "opt-2" {
		t.Errorf("CustomFields[field-2] = %q, want opt-2 (round-tripped through Production's display value)", got.CustomFields["field-2"])
	}

	if valid[1].Content.Title != "No frills case" {
		t.Errorf("second row Title = %q, want %q", valid[1].Content.Title, "No frills case")
	}
}

// A cell starting with =, +, -, @, tab, or CR can be interpreted as a
// formula by Excel/Google Sheets/LibreOffice when the exported file is
// opened — a case Title/Description/custom-field value is entirely
// user-controlled, so an unsanitized export is a real CSV formula
// injection vector (CWE-1236), not a theoretical one.
func TestWriteRowsNeutralizesFormulaInjectionInEveryCell(t *testing.T) {
	fields := []domain.CustomField{
		{ID: "field-1", Name: "=cmd|'/c calc'!A1", FieldType: domain.CustomFieldTypeText},
	}
	cases := []domain.TestCase{
		{Content: domain.CaseContent{
			Title:          "=cmd|'/c calc'!A1",
			Description:    "+1+1",
			ExpectedResult: "-2+3",
			Platform:       "@SUM(A1:A10)",
			TestType:       "\t=evil",
			Tags:           []string{"=HYPERLINK(\"http://evil\")"},
			CustomFields:   map[string]string{"field-1": "=malicious()"},
		}},
	}
	var buf bytes.Buffer
	if err := WriteRows(&buf, cases, fields); err != nil {
		t.Fatalf("WriteRows: %v", err)
	}
	records := readAll(t, &buf)

	header := records[0]
	if strings.HasPrefix(header[8], "=") {
		t.Errorf("header custom field name = %q, want a formula-triggering prefix neutralized", header[8])
	}

	row := records[1]
	dangerous := []string{"=", "+", "-", "@", "\t"}
	for i, cell := range row {
		for _, prefix := range dangerous {
			if strings.HasPrefix(cell, prefix) {
				t.Errorf("row[%d] = %q, starts with %q — a formula-injection payload was written unsanitized", i, cell, prefix)
			}
		}
	}
}

func readAll(t *testing.T, buf *bytes.Buffer) [][]string {
	t.Helper()
	records, err := csv.NewReader(buf).ReadAll()
	if err != nil {
		t.Fatalf("re-reading written CSV: %v", err)
	}
	return records
}
