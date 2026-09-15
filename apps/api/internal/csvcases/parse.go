// Package csvcases maps CSV rows onto domain.CaseContent for
// add-csv-import-export's bulk case import, and the reverse for export.
// Unlike tools/import-connector's vendor connectors, there is no remote
// system here — the whole operation is local parsing plus a handful of
// database writes (design.md D1), so this package has no job/poll
// machinery, just a pure read (ParseRows) and a pure write (WriteRows).
package csvcases

import (
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// FixedColumns is the CSV header set every column not in this list is
// treated as a custom-field column against (design.md D4) — exported so
// WriteRows can reuse the exact same order for export (D5's round-trip
// property).
var FixedColumns = []string{
	"Title", "Description", "Expected Result", "Priority", "Tags", "Platform", "Test Type", "Automated",
}

// RowProblem names one CSV row that failed to import, never collapsed
// into a count (design.md D3). Row is the same row number a spreadsheet
// tool itself would show — the header is row 1, so the first data row is
// row 2 — not a zero- or one-indexed count of data rows alone.
type RowProblem struct {
	Row    int
	Reason string
}

// ParsedRow is one CSV data row's mapped content. Content.CustomFields is
// already populated for any column matching an existing project custom
// field (resolved to that field's real id, and — for a select field — the
// matching option's id). NewValues holds raw values for columns that
// don't match an existing field yet, keyed by the CSV header name; the
// caller creates those fields and merges NewValues in by the newly
// created id (design.md D2).
type ParsedRow struct {
	Content   domain.CaseContent
	NewValues map[string]string
}

func normalizeHeader(h string) string {
	return strings.ToLower(strings.TrimSpace(h))
}

var fixedColumnSet = func() map[string]bool {
	set := make(map[string]bool, len(FixedColumns))
	for _, c := range FixedColumns {
		set[normalizeHeader(c)] = true
	}
	return set
}()

// ParseRows reads a CSV (header row + data rows) and maps each data row
// onto a domain.CaseContent. A row that fails validation — an empty
// Title, an unrecognized Priority, or a custom-field value that doesn't
// match an existing select field's current options — is reported in
// problems by its row number (RowProblem.Row — the header counts as row
// 1, matching what a spreadsheet tool itself would show) and excluded
// from valid; parsing continues to the next row rather than aborting the
// file.
func ParseRows(r io.Reader, existingFields []domain.CustomField) (valid []ParsedRow, problems []RowProblem, newFieldNames []string, err error) {
	reader := csv.NewReader(r)
	reader.FieldsPerRecord = -1

	header, err := reader.Read()
	if err == io.EOF {
		return nil, nil, nil, nil
	}
	if err != nil {
		return nil, nil, nil, fmt.Errorf("reading CSV header: %w", err)
	}

	fieldsByName := make(map[string]domain.CustomField, len(existingFields))
	for _, f := range existingFields {
		fieldsByName[normalizeHeader(f.Name)] = f
	}

	type column struct {
		index      int
		fixedName  string // e.g. "title" — empty if this is a custom-field column
		customName string // original header text, for a custom-field column
	}
	columns := make([]column, len(header))
	newFieldSeen := map[string]bool{}
	for i, h := range header {
		norm := normalizeHeader(h)
		if fixedColumnSet[norm] {
			columns[i] = column{index: i, fixedName: norm}
			continue
		}
		columns[i] = column{index: i, customName: strings.TrimSpace(h)}
		if _, exists := fieldsByName[norm]; !exists && !newFieldSeen[norm] {
			newFieldSeen[norm] = true
			newFieldNames = append(newFieldNames, strings.TrimSpace(h))
		}
	}

	// rowNum matches the row a spreadsheet tool itself would show: the
	// header is row 1, so the first data row is row 2.
	rowNum := 1
	for {
		rowNum++
		record, readErr := reader.Read()
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return nil, nil, nil, fmt.Errorf("reading CSV row %d: %w", rowNum, readErr)
		}

		row := ParsedRow{Content: domain.CaseContent{CustomFields: map[string]string{}}, NewValues: map[string]string{}}
		var rowProblem string

		for _, col := range columns {
			if col.index >= len(record) {
				continue
			}
			cell := record[col.index]

			if col.fixedName != "" {
				switch col.fixedName {
				case "title":
					row.Content.Title = cell
				case "description":
					row.Content.Description = cell
				case "expected result":
					row.Content.ExpectedResult = cell
				case "priority":
					if cell != "" {
						row.Content.Priority = domain.Priority(strings.ToLower(strings.TrimSpace(cell)))
					}
				case "tags":
					if cell != "" {
						row.Content.Tags = strings.Split(cell, ";")
						for i, t := range row.Content.Tags {
							row.Content.Tags[i] = strings.TrimSpace(t)
						}
					}
				case "platform":
					row.Content.Platform = cell
				case "test type":
					row.Content.TestType = cell
				case "automated":
					if cell != "" {
						automated, parseErr := strconv.ParseBool(strings.ToLower(strings.TrimSpace(cell)))
						if parseErr != nil {
							rowProblem = fmt.Sprintf("invalid Automated value %q: must be true or false", cell)
							continue
						}
						row.Content.Automated = automated
					}
				}
				continue
			}

			if cell == "" {
				continue
			}
			field, exists := fieldsByName[normalizeHeader(col.customName)]
			if !exists {
				row.NewValues[col.customName] = cell
				continue
			}
			if field.FieldType == domain.CustomFieldTypeSelect {
				optionID := ""
				for _, opt := range field.Options {
					if opt.Value == cell {
						optionID = opt.ID
						break
					}
				}
				if optionID == "" {
					rowProblem = fmt.Sprintf("%q is not a current option for custom field %q", cell, field.Name)
					continue
				}
				row.Content.CustomFields[field.ID] = optionID
				continue
			}
			row.Content.CustomFields[field.ID] = cell
		}

		if rowProblem == "" {
			if err := row.Content.Validate(); err != nil {
				rowProblem = err.Error()
			}
		}
		if rowProblem != "" {
			problems = append(problems, RowProblem{Row: rowNum, Reason: rowProblem})
			continue
		}
		valid = append(valid, row)
	}

	return valid, problems, newFieldNames, nil
}
