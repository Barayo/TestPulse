package service

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/attachmentfile"
	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// AttachCaseFile uploads a reference file (image or PDF) against a case's
// identity — independent of any CaseVersion (add-case-reference-attachments
// design.md D1).
func (s *Service) AttachCaseFile(ctx context.Context, caseID, filename string, data []byte) (domain.CaseAttachment, error) {
	contentType, err := attachmentfile.ValidateUpload(data)
	if err != nil {
		return domain.CaseAttachment{}, invalid("%s", err)
	}
	att, err := s.store.CaseAttachments.Create(ctx, caseID, filename, contentType, data)
	if err != nil {
		return domain.CaseAttachment{}, err
	}
	s.audit(ctx, "attach_case_file", "test_case", caseID)
	return att, nil
}

// ListCaseAttachments lists a case's reference attachments.
func (s *Service) ListCaseAttachments(ctx context.Context, caseID string) ([]domain.CaseAttachment, error) {
	return s.store.CaseAttachments.ByCase(ctx, caseID)
}

// GetCaseAttachment returns a case attachment's metadata and raw bytes.
func (s *Service) GetCaseAttachment(ctx context.Context, id string) (domain.CaseAttachment, []byte, error) {
	return s.store.CaseAttachments.Get(ctx, id)
}

// DeleteCaseAttachment removes a case attachment.
func (s *Service) DeleteCaseAttachment(ctx context.Context, id string) error {
	if err := s.store.CaseAttachments.Delete(ctx, id); err != nil {
		return err
	}
	s.audit(ctx, "delete_case_attachment", "case_attachment", id)
	return nil
}
