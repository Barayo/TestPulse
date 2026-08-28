package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestCaseJiraLinkRoundTrips(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "login works")

	key := "PROJ-123"
	updated, err := s.Cases.SetJiraLink(ctx, c.ID, &key)
	if err != nil {
		t.Fatalf("SetJiraLink: %v", err)
	}
	if updated.JiraIssueKey == nil || *updated.JiraIssueKey != "PROJ-123" {
		t.Fatalf("JiraIssueKey = %v, want PROJ-123", updated.JiraIssueKey)
	}

	got, err := s.Cases.Get(ctx, c.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.JiraIssueKey == nil || *got.JiraIssueKey != "PROJ-123" {
		t.Fatalf("Get JiraIssueKey = %v, want PROJ-123", got.JiraIssueKey)
	}
}

func TestCaseJiraSyncWritesCachedFields(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "login works")

	key := "PROJ-123"
	if _, err := s.Cases.SetJiraLink(ctx, c.ID, &key); err != nil {
		t.Fatalf("SetJiraLink: %v", err)
	}

	now := time.Now().UTC().Truncate(time.Second)
	updated, err := s.Cases.SetJiraSync(ctx, c.ID, "Fix login redirect", "In Progress", now)
	if err != nil {
		t.Fatalf("SetJiraSync: %v", err)
	}
	if updated.JiraIssueSummary == nil || *updated.JiraIssueSummary != "Fix login redirect" {
		t.Fatalf("JiraIssueSummary = %v, want %q", updated.JiraIssueSummary, "Fix login redirect")
	}
	if updated.JiraIssueStatus == nil || *updated.JiraIssueStatus != "In Progress" {
		t.Fatalf("JiraIssueStatus = %v, want %q", updated.JiraIssueStatus, "In Progress")
	}
	if updated.JiraLastSyncedAt == nil || !updated.JiraLastSyncedAt.Equal(now) {
		t.Fatalf("JiraLastSyncedAt = %v, want %v", updated.JiraLastSyncedAt, now)
	}
}

func TestClearingCaseJiraLinkClearsCachedFields(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "login works")

	key := "PROJ-123"
	if _, err := s.Cases.SetJiraLink(ctx, c.ID, &key); err != nil {
		t.Fatalf("SetJiraLink: %v", err)
	}
	if _, err := s.Cases.SetJiraSync(ctx, c.ID, "summary", "status", time.Now()); err != nil {
		t.Fatalf("SetJiraSync: %v", err)
	}

	cleared, err := s.Cases.SetJiraLink(ctx, c.ID, nil)
	if err != nil {
		t.Fatalf("SetJiraLink(nil): %v", err)
	}
	if cleared.JiraIssueKey != nil {
		t.Errorf("JiraIssueKey = %v, want nil", cleared.JiraIssueKey)
	}
	if cleared.JiraIssueSummary != nil {
		t.Errorf("JiraIssueSummary = %v, want nil", cleared.JiraIssueSummary)
	}
	if cleared.JiraIssueStatus != nil {
		t.Errorf("JiraIssueStatus = %v, want nil", cleared.JiraIssueStatus)
	}
	if cleared.JiraLastSyncedAt != nil {
		t.Errorf("JiraLastSyncedAt = %v, want nil", cleared.JiraLastSyncedAt)
	}
}

func TestCaseJiraSyncRequiresExistingLink(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "login works")

	_, err := s.Cases.SetJiraSync(ctx, c.ID, "summary", "status", time.Now())
	if err != store.ErrJiraLinkNotSet {
		t.Fatalf("SetJiraSync without link: err = %v, want ErrJiraLinkNotSet", err)
	}
}

func TestListCasesFilteredByJiraLinked(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	linked := mustCase(t, s, p.ID, "linked case")
	mustCase(t, s, p.ID, "unlinked case")

	key := "PROJ-1"
	if _, err := s.Cases.SetJiraLink(ctx, linked.ID, &key); err != nil {
		t.Fatalf("SetJiraLink: %v", err)
	}

	cases, err := s.Cases.ListJiraLinked(ctx, p.ID)
	if err != nil {
		t.Fatalf("ListJiraLinked: %v", err)
	}
	if len(cases) != 1 || cases[0].ID != linked.ID {
		t.Fatalf("ListJiraLinked = %+v, want only %v", cases, linked.ID)
	}
}
