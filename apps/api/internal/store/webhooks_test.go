package store_test

import (
	"context"
	"testing"
)

func TestWebhookDestinationCreateListDelete(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	dest, err := s.Webhooks.Create(ctx, p.ID, "https://example.com/hooks/one")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if dest.ProjectID != p.ID || dest.URL != "https://example.com/hooks/one" {
		t.Errorf("dest = %+v, unexpected field values", dest)
	}

	list, err := s.Webhooks.ListByProject(ctx, p.ID)
	if err != nil {
		t.Fatalf("ListByProject: %v", err)
	}
	if len(list) != 1 || list[0].ID != dest.ID {
		t.Fatalf("ListByProject = %+v, want exactly the created destination", list)
	}

	if err := s.Webhooks.Delete(ctx, dest.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	list, err = s.Webhooks.ListByProject(ctx, p.ID)
	if err != nil {
		t.Fatalf("ListByProject after delete: %v", err)
	}
	if len(list) != 0 {
		t.Errorf("ListByProject after delete = %+v, want empty", list)
	}
}

func TestWebhookDestinationListByProjectReturnsMultiple(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	if _, err := s.Webhooks.Create(ctx, p.ID, "https://example.com/hooks/one"); err != nil {
		t.Fatalf("Create 1: %v", err)
	}
	if _, err := s.Webhooks.Create(ctx, p.ID, "https://example.com/hooks/two"); err != nil {
		t.Fatalf("Create 2: %v", err)
	}

	list, err := s.Webhooks.ListByProject(ctx, p.ID)
	if err != nil {
		t.Fatalf("ListByProject: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("ListByProject = %+v, want 2 destinations", list)
	}
}
