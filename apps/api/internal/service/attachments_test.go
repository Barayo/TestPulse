package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func attachmentTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "attachments_service")))
}

func mustAttachmentItem(t *testing.T, s *service.Service) string {
	t.Helper()
	ctx := context.Background()
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{
		Title: "case", Steps: []domain.Step{{Action: "do it"}}, Priority: domain.PriorityMedium,
	})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) == 0 {
		t.Fatalf("RunItems: %d, %v", len(items), err)
	}
	return items[0].ID
}

func tinyPNG(t *testing.T) []byte {
	t.Helper()
	// 1x1 transparent PNG.
	return []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
		0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
		0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
	}
}

func TestStageAttachment_RejectsUnsupportedFormat(t *testing.T) {
	s := attachmentTestService(t)
	ctx := context.Background()
	itemID := mustAttachmentItem(t, s)

	_, err := s.StageAttachment(ctx, itemID, "notes.txt", []byte("plain text, not an image"))
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
}

func TestStageAttachment_CreatesUnlinked(t *testing.T) {
	s := attachmentTestService(t)
	ctx := context.Background()
	itemID := mustAttachmentItem(t, s)

	att, err := s.StageAttachment(ctx, itemID, "shot.png", tinyPNG(t))
	if err != nil {
		t.Fatalf("StageAttachment: %v", err)
	}
	if att.ContentType != "image/png" {
		t.Errorf("ContentType = %q, want image/png", att.ContentType)
	}
	if att.ResultID != "" {
		t.Errorf("ResultID = %q, want empty", att.ResultID)
	}
}

func TestAttachToResultThenGet(t *testing.T) {
	s := attachmentTestService(t)
	ctx := context.Background()
	itemID := mustAttachmentItem(t, s)
	ctx = domain.WithActor(ctx, domain.Actor{ID: "u1", Kind: domain.ActorKindUser, DisplayName: "Ana"})
	res, err := s.RecordResult(ctx, itemID, domain.NewResult{Verdict: domain.VerdictFailed})
	if err != nil {
		t.Fatalf("RecordResult: %v", err)
	}

	att, err := s.AttachToResult(ctx, res.ID, "shot.png", tinyPNG(t))
	if err != nil {
		t.Fatalf("AttachToResult: %v", err)
	}

	got, data, err := s.GetAttachment(ctx, att.ID)
	if err != nil {
		t.Fatalf("GetAttachment: %v", err)
	}
	if len(data) != len(tinyPNG(t)) {
		t.Errorf("GetAttachment bytes length = %d, want %d", len(data), len(tinyPNG(t)))
	}
	if got.Filename != "shot.png" {
		t.Errorf("Filename = %q, want shot.png", got.Filename)
	}
}

func TestDeleteAttachment_RemovesIt(t *testing.T) {
	s := attachmentTestService(t)
	ctx := context.Background()
	itemID := mustAttachmentItem(t, s)

	att, err := s.StageAttachment(ctx, itemID, "shot.png", tinyPNG(t))
	if err != nil {
		t.Fatalf("StageAttachment: %v", err)
	}
	if err := s.DeleteAttachment(ctx, att.ID); err != nil {
		t.Fatalf("DeleteAttachment: %v", err)
	}
	if _, _, err := s.GetAttachment(ctx, att.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestRecordResult_WithInlineAttachmentValidatesAndStores(t *testing.T) {
	s := attachmentTestService(t)
	ctx := context.Background()
	itemID := mustAttachmentItem(t, s)

	res, err := s.RecordResult(ctx, itemID, domain.NewResult{
		Actor: "ci", Verdict: domain.VerdictFailed,
		Attachments: []domain.NewAttachment{{Filename: "shot.png", ContentType: "application/octet-stream", Data: tinyPNG(t)}},
	})
	if err != nil {
		t.Fatalf("RecordResult: %v", err)
	}
	if len(res.Attachments) != 1 {
		t.Fatalf("Attachments = %d, want 1", len(res.Attachments))
	}
	// The client-declared content type is untrusted — the real, sniffed type
	// must be what's stored, regardless of what the caller claimed.
	if res.Attachments[0].ContentType != "image/png" {
		t.Errorf("ContentType = %q, want image/png (sniffed, not client-declared)", res.Attachments[0].ContentType)
	}
}

func TestRecordResult_RejectsUnsupportedInlineAttachment(t *testing.T) {
	s := attachmentTestService(t)
	ctx := context.Background()
	itemID := mustAttachmentItem(t, s)

	_, err := s.RecordResult(ctx, itemID, domain.NewResult{
		Actor: "ci", Verdict: domain.VerdictFailed,
		Attachments: []domain.NewAttachment{{Filename: "notes.txt", ContentType: "image/png", Data: []byte("not really a png")}},
	})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
}

func TestRecordResult_RejectsAttachmentIDFromDifferentItem(t *testing.T) {
	s := attachmentTestService(t)
	ctx := context.Background()
	itemID := mustAttachmentItem(t, s)
	otherItemID := mustAttachmentItem(t, s)

	staged, err := s.StageAttachment(ctx, otherItemID, "shot.png", tinyPNG(t))
	if err != nil {
		t.Fatalf("StageAttachment: %v", err)
	}

	_, err = s.RecordResult(ctx, itemID, domain.NewResult{
		Actor: "ci", Verdict: domain.VerdictFailed, AttachmentIDs: []string{staged.ID},
	})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
}
