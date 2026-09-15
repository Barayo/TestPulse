package csvcases

import (
	"encoding/csv"
	"io"
	"strconv"
	"strings"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// formulaTriggerPrefixes are the leading characters Excel/Google
// Sheets/LibreOffice treat as "this cell is a formula" on open. Every
// cell here is user-controlled (a case's Title/Description/etc., a
// custom field's name or value) — writing one straight to the file is a
// real CSV formula injection vector (CWE-1236), not a theoretical one.
const formulaTriggerPrefixes = "=+-@\t\r"

// sanitizeCSVCell neutralizes a formula-triggering leading character by
// prefixing the cell with a single quote — the standard CSV-injection
// mitigation, since a leading quote makes every affected spreadsheet
// application treat the cell as plain text instead of evaluating it,
// while leaving the value otherwise readable.
func sanitizeCSVCell(s string) string {
	if s != "" && strings.ContainsRune(formulaTriggerPrefixes, rune(s[0])) {
		return "'" + s
	}
	return s
}

// WriteRows writes cases as CSV: FixedColumns first (design.md D5 — the
// exact header set and order ParseRows recognizes, so export/re-import is
// a real round-trip), then one column per fields, in their existing
// project display order. A select field's stored value is an option id
// (the same convention CaseContent.CustomFields uses on write); the
// exported cell holds that option's display value, resolved via fields,
// not the opaque id — human-readable, and exactly what ParseRows expects
// back on re-import. Every cell is passed through sanitizeCSVCell before
// writing.
func WriteRows(w io.Writer, cases []domain.TestCase, fields []domain.CustomField) error {
	cw := csv.NewWriter(w)

	header := make([]string, 0, len(FixedColumns)+len(fields))
	header = append(header, FixedColumns...)
	for _, f := range fields {
		header = append(header, sanitizeCSVCell(f.Name))
	}
	if err := cw.Write(header); err != nil {
		return err
	}

	optionValueByID := make([]map[string]string, len(fields))
	for i, f := range fields {
		m := make(map[string]string, len(f.Options))
		for _, opt := range f.Options {
			m[opt.ID] = opt.Value
		}
		optionValueByID[i] = m
	}

	for _, c := range cases {
		row := make([]string, 0, len(header))
		row = append(row,
			sanitizeCSVCell(c.Content.Title),
			sanitizeCSVCell(c.Content.Description),
			sanitizeCSVCell(c.Content.ExpectedResult),
			string(c.Content.Priority),
			sanitizeCSVCell(strings.Join(c.Content.Tags, ";")),
			sanitizeCSVCell(c.Content.Platform),
			sanitizeCSVCell(c.Content.TestType),
			strconv.FormatBool(c.Content.Automated),
		)
		for i, f := range fields {
			value := c.Content.CustomFields[f.ID]
			if f.FieldType == domain.CustomFieldTypeSelect && value != "" {
				value = optionValueByID[i][value]
			}
			row = append(row, sanitizeCSVCell(value))
		}
		if err := cw.Write(row); err != nil {
			return err
		}
	}

	cw.Flush()
	return cw.Error()
}
