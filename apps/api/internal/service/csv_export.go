package service

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// ExportCasesToCSV returns a project's cases (optionally scoped to one
// folder) and its custom field list in display order — the handler layer
// streams these through csvcases.WriteRows directly against the response
// writer, matching getAttachment's own precedent of the service returning
// data and the handler owning the actual streaming (add-csv-import-export
// design.md).
func (s *Service) ExportCasesToCSV(ctx context.Context, projectID string, folderID *string) ([]domain.TestCase, []domain.CustomField, error) {
	cases, err := s.ListCases(ctx, projectID)
	if err != nil {
		return nil, nil, err
	}
	if folderID != nil {
		filtered := make([]domain.TestCase, 0, len(cases))
		for _, c := range cases {
			if c.FolderID == *folderID {
				filtered = append(filtered, c)
			}
		}
		cases = filtered
	}

	fields, err := s.ListCustomFields(ctx, projectID)
	if err != nil {
		return nil, nil, err
	}
	return cases, fields, nil
}
