package service

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/attachmentimage"
	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// attachmentErrorAsInvalid translates the store's cross-item attachment
// sentinel into a client-fixable 400, distinct from ErrRunClosed's 409 and
// ErrNotFound's 404 — the request itself references the wrong id
// (add-run-item-screenshot-attachments spec's "A staged attachment from a
// different item cannot be linked").
func attachmentErrorAsInvalid(err error) error {
	if errors.Is(err, store.ErrInvalidAttachment) {
		return invalid("%s", err)
	}
	return runClosedAsConflict(err)
}

// StageAttachment uploads an image against a run item before any verdict
// has been recorded — result_id stays unset until RecordResult links it via
// NewResult.AttachmentIDs.
func (s *Service) StageAttachment(ctx context.Context, itemID, filename string, data []byte) (domain.Attachment, error) {
	contentType, err := attachmentimage.ValidateUpload(data)
	if err != nil {
		return domain.Attachment{}, invalid("%s", err)
	}
	att, err := s.store.Attachments.StageForItem(ctx, itemID, filename, contentType, data)
	if err != nil {
		return domain.Attachment{}, runClosedAsConflict(err)
	}
	s.audit(ctx, "stage_attachment", "run_item", itemID)
	return att, nil
}

// AttachToResult uploads an image directly against an already-recorded
// result — the after-the-fact attach path from History.
func (s *Service) AttachToResult(ctx context.Context, resultID, filename string, data []byte) (domain.Attachment, error) {
	contentType, err := attachmentimage.ValidateUpload(data)
	if err != nil {
		return domain.Attachment{}, invalid("%s", err)
	}
	att, err := s.store.Attachments.AttachToResult(ctx, resultID, filename, contentType, data)
	if err != nil {
		return domain.Attachment{}, runClosedAsConflict(err)
	}
	s.audit(ctx, "attach_result", "result", resultID)
	return att, nil
}

// StagedAttachments lists an item's attachments uploaded before a verdict
// exists (not yet linked to a result).
func (s *Service) StagedAttachments(ctx context.Context, itemID string) ([]domain.Attachment, error) {
	return s.store.Attachments.ByItem(ctx, itemID)
}

// AttachmentsForResult lists a result's attachments.
func (s *Service) AttachmentsForResult(ctx context.Context, resultID string) ([]domain.Attachment, error) {
	return s.store.Attachments.ByResult(ctx, resultID)
}

// GetAttachment returns an attachment's metadata and raw image bytes.
func (s *Service) GetAttachment(ctx context.Context, id string) (domain.Attachment, []byte, error) {
	return s.store.Attachments.Get(ctx, id)
}

// DeleteAttachment removes an attachment.
func (s *Service) DeleteAttachment(ctx context.Context, id string) error {
	if err := s.store.Attachments.Delete(ctx, id); err != nil {
		return err
	}
	s.audit(ctx, "delete_attachment", "attachment", id)
	return nil
}
