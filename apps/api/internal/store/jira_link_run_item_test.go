package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestRunItemJiraLinkRoundTrips(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "login works")
	run, err := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	items, _ := s.Runs.Items(ctx, run.ID, "")
	item := items[0]

	key := "PROJ-456"
	updated, err := s.Runs.SetItemJiraLink(ctx, item.ID, &key)
	if err != nil {
		t.Fatalf("SetItemJiraLink: %v", err)
	}
	if updated.JiraIssueKey == nil || *updated.JiraIssueKey != "PROJ-456" {
		t.Fatalf("JiraIssueKey = %v, want PROJ-456", updated.JiraIssueKey)
	}

	got, _ := s.Runs.Items(ctx, run.ID, "")
	if got[0].JiraIssueKey == nil || *got[0].JiraIssueKey != "PROJ-456" {
		t.Fatalf("Items()[0].JiraIssueKey = %v, want PROJ-456", got[0].JiraIssueKey)
	}
}

func TestRunItemJiraSyncWritesCachedFields(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	item := items[0]

	key := "PROJ-456"
	if _, err := s.Runs.SetItemJiraLink(ctx, item.ID, &key); err != nil {
		t.Fatalf("SetItemJiraLink: %v", err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	updated, err := s.Runs.SetItemJiraSync(ctx, item.ID, "Fix login redirect", "Done", now)
	if err != nil {
		t.Fatalf("SetItemJiraSync: %v", err)
	}
	if updated.JiraIssueSummary == nil || *updated.JiraIssueSummary != "Fix login redirect" {
		t.Fatalf("JiraIssueSummary = %v", updated.JiraIssueSummary)
	}
	if updated.JiraIssueStatus == nil || *updated.JiraIssueStatus != "Done" {
		t.Fatalf("JiraIssueStatus = %v", updated.JiraIssueStatus)
	}
	if updated.JiraLastSyncedAt == nil || !updated.JiraLastSyncedAt.Equal(now) {
		t.Fatalf("JiraLastSyncedAt = %v, want %v", updated.JiraLastSyncedAt, now)
	}
}

func TestRunItemJiraSyncRequiresExistingLink(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	item := items[0]

	if _, err := s.Runs.SetItemJiraSync(ctx, item.ID, "s", "s", time.Now()); err != store.ErrJiraLinkNotSet {
		t.Fatalf("err = %v, want ErrJiraLinkNotSet", err)
	}
}

func TestClosedRunRejectsJiraLinkChange(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "login works")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")
	item := items[0]

	if err := s.Runs.Close(ctx, run.ID); err != nil {
		t.Fatalf("Close: %v", err)
	}

	key := "PROJ-456"
	if _, err := s.Runs.SetItemJiraLink(ctx, item.ID, &key); !errors.Is(err, store.ErrRunClosed) {
		t.Errorf("SetItemJiraLink on closed run = %v, want ErrRunClosed", err)
	}
}

func TestItemsJiraLinkedFiltersToLinkedOnly(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c1 := mustCase(t, s, p.ID, "linked")
	c2 := mustCase(t, s, p.ID, "unlinked")
	run, _ := s.Runs.Create(ctx, p.ID, "sprint 1", []string{c1.ID, c2.ID})
	items, _ := s.Runs.Items(ctx, run.ID, "")

	var linkedItem, unlinkedItem string
	for _, it := range items {
		if it.CaseID == c1.ID {
			linkedItem = it.ID
		} else {
			unlinkedItem = it.ID
		}
	}
	_ = unlinkedItem
	key := "PROJ-1"
	if _, err := s.Runs.SetItemJiraLink(ctx, linkedItem, &key); err != nil {
		t.Fatalf("SetItemJiraLink: %v", err)
	}

	linked, err := s.Runs.ItemsJiraLinked(ctx, run.ID)
	if err != nil {
		t.Fatalf("ItemsJiraLinked: %v", err)
	}
	if len(linked) != 1 || linked[0].ID != linkedItem {
		t.Fatalf("ItemsJiraLinked = %+v, want only %v", linked, linkedItem)
	}
}
