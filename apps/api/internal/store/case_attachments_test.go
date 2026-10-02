package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestCaseAttachmentCreate_StoresAgainstCase(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	att, err := s.CaseAttachments.Create(ctx, c.ID, "mock.png", "image/png", []byte("fake-png-bytes"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if att.CaseID != c.ID {
		t.Errorf("CaseID = %q, want %q", att.CaseID, c.ID)
	}
	if att.Filename != "mock.png" || att.ContentType != "image/png" {
		t.Errorf("Create = %+v, want filename=mock.png contentType=image/png", att)
	}
	if att.ID == "" {
		t.Error("expected a generated id")
	}
}

func TestCaseAttachmentByCase_ListsOrderedByCreatedAt(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	a1, _ := s.CaseAttachments.Create(ctx, c.ID, "one.png", "image/png", []byte("one"))
	a2, _ := s.CaseAttachments.Create(ctx, c.ID, "two.pdf", "application/pdf", []byte("two"))

	list, err := s.CaseAttachments.ByCase(ctx, c.ID)
	if err != nil {
		t.Fatalf("ByCase: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("ByCase = %d attachments, want 2", len(list))
	}
	if list[0].ID != a1.ID || list[1].ID != a2.ID {
		t.Errorf("ByCase order = [%q, %q], want [%q, %q]", list[0].ID, list[1].ID, a1.ID, a2.ID)
	}
}

func TestCaseAttachmentByCase_EmptyForCaseWithNoAttachments(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")

	list, err := s.CaseAttachments.ByCase(ctx, c.ID)
	if err != nil {
		t.Fatalf("ByCase: %v", err)
	}
	if len(list) != 0 {
		t.Fatalf("ByCase = %d attachments, want 0", len(list))
	}
}

func TestCaseAttachmentGet_ReturnsBytes(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	created, _ := s.CaseAttachments.Create(ctx, c.ID, "mock.png", "image/png", []byte("fake-png-bytes"))

	att, data, err := s.CaseAttachments.Get(ctx, created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(data) != "fake-png-bytes" {
		t.Errorf("Get bytes = %q, want %q", data, "fake-png-bytes")
	}
	if att.Filename != "mock.png" {
		t.Errorf("Get filename = %q, want mock.png", att.Filename)
	}
}

func TestCaseAttachmentGet_UnknownIsNotFound(t *testing.T) {
	s := testStore(t)
	_, _, err := s.CaseAttachments.Get(context.Background(), "00000000-0000-0000-0000-000000000000")
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestCaseAttachmentDelete_RemovesIt(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	created, _ := s.CaseAttachments.Create(ctx, c.ID, "mock.png", "image/png", []byte("fake-png-bytes"))

	if err := s.CaseAttachments.Delete(ctx, created.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, _, err := s.CaseAttachments.Get(ctx, created.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestCaseAttachmentDelete_UnknownIsNotFound(t *testing.T) {
	s := testStore(t)
	err := s.CaseAttachments.Delete(context.Background(), "00000000-0000-0000-0000-000000000000")
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestCaseAttachmentProjectID_Resolves(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "Login works")
	created, _ := s.CaseAttachments.Create(ctx, c.ID, "mock.png", "image/png", []byte("bytes"))

	projectID, err := s.CaseAttachments.ProjectID(ctx, created.ID)
	if err != nil {
		t.Fatalf("ProjectID: %v", err)
	}
	if projectID != p.ID {
		t.Errorf("ProjectID = %q, want %q", projectID, p.ID)
	}
}

func TestCaseAttachmentProjectID_UnknownIsNotFound(t *testing.T) {
	s := testStore(t)
	_, err := s.CaseAttachments.ProjectID(context.Background(), "00000000-0000-0000-0000-000000000000")
	if !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}
