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

func jiraTestService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "jira_link_service")))
}

func TestSetCaseJiraLinkAndClear(t *testing.T) {
	s := jiraTestService(t)
	ctx := context.Background()
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{Title: "case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	key := "PROJ-1"
	updated, err := s.SetCaseJiraLink(ctx, c.ID, &key)
	if err != nil {
		t.Fatalf("SetCaseJiraLink: %v", err)
	}
	if updated.JiraIssueKey == nil || *updated.JiraIssueKey != "PROJ-1" {
		t.Fatalf("JiraIssueKey = %v", updated.JiraIssueKey)
	}

	cleared, err := s.SetCaseJiraLink(ctx, c.ID, nil)
	if err != nil {
		t.Fatalf("SetCaseJiraLink(nil): %v", err)
	}
	if cleared.JiraIssueKey != nil {
		t.Errorf("JiraIssueKey = %v, want nil", cleared.JiraIssueKey)
	}
}

func TestSetCaseJiraSyncWithoutLinkIsConflict(t *testing.T) {
	s := jiraTestService(t)
	ctx := context.Background()
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{Title: "case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}

	_, err = s.SetCaseJiraSync(ctx, c.ID, "summary", "status")
	var cerr *service.ConflictError
	if !errors.As(err, &cerr) {
		t.Fatalf("err = %v, want *ConflictError", err)
	}
}

func TestSetRunItemJiraLinkRejectedOnClosedRun(t *testing.T) {
	s := jiraTestService(t)
	ctx := context.Background()
	p, err := s.CreateProject(ctx, service.ProjectInput{Name: "QA"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	c, err := s.CreateCase(ctx, p.ID, "", domain.CaseContent{Title: "case", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatalf("CreateCase: %v", err)
	}
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "sprint 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil || len(items) == 0 {
		t.Fatalf("RunItems: %v (%d items)", err, len(items))
	}
	if err := s.CloseRun(ctx, run.ID); err != nil {
		t.Fatalf("CloseRun: %v", err)
	}

	key := "PROJ-2"
	_, err = s.SetRunItemJiraLink(ctx, items[0].ID, &key)
	var cerr *service.ConflictError
	if !errors.As(err, &cerr) {
		t.Fatalf("err = %v, want *ConflictError", err)
	}
}
