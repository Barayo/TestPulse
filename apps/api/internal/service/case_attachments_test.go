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

func caseAttachmentTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "case_attachments_service")))
}

func mustAttachmentCase(t *testing.T, s *service.Service) string {
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
	return c.ID
}

func tinyCaseAttachmentPNG(t *testing.T) []byte {
	t.Helper()
	return []byte{
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
		0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
		0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
		0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
		0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
		0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
	}
}

func TestAttachCaseFile_RejectsUnsupportedFormat(t *testing.T) {
	s := caseAttachmentTestService(t)
	ctx := context.Background()
	caseID := mustAttachmentCase(t, s)

	_, err := s.AttachCaseFile(ctx, caseID, "notes.exe", []byte{0x00, 0x01, 0xff, 0xfe, 0x00, 0x02, 0xff, 0xfd})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Fatalf("expected *ValidationError, got %v (%T)", err, err)
	}
}

func TestAttachCaseFile_StoresImage(t *testing.T) {
	s := caseAttachmentTestService(t)
	ctx := context.Background()
	caseID := mustAttachmentCase(t, s)

	att, err := s.AttachCaseFile(ctx, caseID, "mock.png", tinyCaseAttachmentPNG(t))
	if err != nil {
		t.Fatalf("AttachCaseFile: %v", err)
	}
	if att.ContentType != "image/png" {
		t.Errorf("ContentType = %q, want image/png", att.ContentType)
	}
	if att.CaseID != caseID {
		t.Errorf("CaseID = %q, want %q", att.CaseID, caseID)
	}
}

func TestAttachCaseFile_StoresLogFile(t *testing.T) {
	s := caseAttachmentTestService(t)
	ctx := context.Background()
	caseID := mustAttachmentCase(t, s)

	att, err := s.AttachCaseFile(ctx, caseID, "run.log", []byte("2026-01-01T00:00:00Z INFO starting\n"))
	if err != nil {
		t.Fatalf("AttachCaseFile: %v", err)
	}
	if att.ContentType != "text/plain" {
		t.Errorf("ContentType = %q, want text/plain", att.ContentType)
	}
}

func TestListCaseAttachments_ReturnsAttachments(t *testing.T) {
	s := caseAttachmentTestService(t)
	ctx := context.Background()
	caseID := mustAttachmentCase(t, s)
	att, err := s.AttachCaseFile(ctx, caseID, "mock.png", tinyCaseAttachmentPNG(t))
	if err != nil {
		t.Fatalf("AttachCaseFile: %v", err)
	}

	list, err := s.ListCaseAttachments(ctx, caseID)
	if err != nil {
		t.Fatalf("ListCaseAttachments: %v", err)
	}
	if len(list) != 1 || list[0].ID != att.ID {
		t.Fatalf("ListCaseAttachments = %+v, want one entry with id %q", list, att.ID)
	}
}

func TestGetCaseAttachment_ReturnsBytes(t *testing.T) {
	s := caseAttachmentTestService(t)
	ctx := context.Background()
	caseID := mustAttachmentCase(t, s)
	att, err := s.AttachCaseFile(ctx, caseID, "mock.png", tinyCaseAttachmentPNG(t))
	if err != nil {
		t.Fatalf("AttachCaseFile: %v", err)
	}

	got, data, err := s.GetCaseAttachment(ctx, att.ID)
	if err != nil {
		t.Fatalf("GetCaseAttachment: %v", err)
	}
	if len(data) != len(tinyCaseAttachmentPNG(t)) {
		t.Errorf("GetCaseAttachment bytes length = %d, want %d", len(data), len(tinyCaseAttachmentPNG(t)))
	}
	if got.Filename != "mock.png" {
		t.Errorf("Filename = %q, want mock.png", got.Filename)
	}
}

func TestDeleteCaseAttachment_RemovesIt(t *testing.T) {
	s := caseAttachmentTestService(t)
	ctx := context.Background()
	caseID := mustAttachmentCase(t, s)
	att, err := s.AttachCaseFile(ctx, caseID, "mock.png", tinyCaseAttachmentPNG(t))
	if err != nil {
		t.Fatalf("AttachCaseFile: %v", err)
	}

	if err := s.DeleteCaseAttachment(ctx, att.ID); err != nil {
		t.Fatalf("DeleteCaseAttachment: %v", err)
	}
	if _, _, err := s.GetCaseAttachment(ctx, att.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
}
