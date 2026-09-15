package service

import (
	"context"
	"io"

	"github.com/Barayo/TestPulse/apps/api/internal/csvcases"
	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// ImportCasesFromCSV bulk-creates cases from an uploaded CSV
// (add-csv-import-export). A CSV column not matching an existing project
// custom field is created as a text field before any case is created
// (csvcases.ParseRows can't resolve a value to a field id that doesn't
// exist yet — design.md D2); their names are returned as newFields so the
// UI can surface this otherwise-invisible side effect (Pepe UX review
// finding). A row that fails validation is skipped and named in
// problems; it never aborts the rest of the file.
func (s *Service) ImportCasesFromCSV(ctx context.Context, projectID, folderID string, r io.Reader) (created int, newFields []string, problems []csvcases.RowProblem, err error) {
	existingFields, err := s.ListCustomFields(ctx, projectID)
	if err != nil {
		return 0, nil, nil, err
	}

	rows, problems, newFieldNames, err := csvcases.ParseRows(r, existingFields)
	if err != nil {
		return 0, nil, nil, err
	}

	newFieldIDs := make(map[string]string, len(newFieldNames))
	for _, name := range newFieldNames {
		field, err := s.CreateCustomField(ctx, projectID, name, domain.CustomFieldTypeText)
		if err != nil {
			return 0, nil, nil, err
		}
		newFieldIDs[name] = field.ID
	}

	contents := make([]domain.CaseContent, 0, len(rows))
	for _, row := range rows {
		for name, value := range row.NewValues {
			row.Content.CustomFields[newFieldIDs[name]] = value
		}
		contents = append(contents, row.Content)
	}
	if len(contents) == 0 {
		return 0, newFieldNames, problems, nil
	}

	createdCases, err := s.BulkAddCases(ctx, projectID, folderID, contents)
	if err != nil {
		return 0, nil, nil, err
	}
	return len(createdCases), newFieldNames, problems, nil
}
