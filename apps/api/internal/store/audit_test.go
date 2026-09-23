package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// TestListByProjectReturnsNewestFirstCappedToLimit covers
// project-activity-feed's project-scoped audit query: only entries
// belonging to the requested project come back, newest first, capped to
// the requested limit.
func TestListByProjectReturnsNewestFirstCappedToLimit(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	other := mustProject(t, s)

	for i, action := range []string{"create", "update", "update", "update"} {
		if err := s.Audit.Append(ctx, domain.AuditEntry{
			ActorKind: domain.ActorKindUser, ActorID: "u1", ActorName: "Sam",
			Action: action, EntityType: "case", EntityID: "c1", ProjectID: p.ID,
		}); err != nil {
			t.Fatalf("append entry %d: %v", i, err)
		}
	}
	if err := s.Audit.Append(ctx, domain.AuditEntry{
		ActorKind: domain.ActorKindUser, ActorID: "u1", ActorName: "Sam",
		Action: "create", EntityType: "case", EntityID: "c2", ProjectID: other.ID,
	}); err != nil {
		t.Fatalf("append other-project entry: %v", err)
	}

	entries, err := s.Audit.ListByProject(ctx, p.ID, 2)
	if err != nil {
		t.Fatalf("ListByProject: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("ListByProject returned %d entries, want 2 (capped)", len(entries))
	}
	for _, e := range entries {
		if e.ProjectID != p.ID {
			t.Errorf("entry %+v belongs to a different project than requested", e)
		}
	}
	if !entries[0].OccurredAt.After(entries[1].OccurredAt) && !entries[0].OccurredAt.Equal(entries[1].OccurredAt) {
		t.Errorf("entries not newest-first: %+v", entries)
	}
}
