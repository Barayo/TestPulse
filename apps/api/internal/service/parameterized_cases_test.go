package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

func parameterizedContent(title string) domain.CaseContent {
	return domain.CaseContent{
		Title:  title,
		Format: domain.FormatSteps,
		Steps:  []domain.Step{{Action: "Enter {username}", Expected: "{username} is logged in"}},
		Parameters: &domain.CaseParameters{
			Columns: []string{"Name", "username"},
			Rows: []map[string]string{
				{"Name": "valid", "username": "admin@example.com"},
				{"Name": "invalid", "username": "nobody@example.com"},
			},
		},
	}
}

func TestCreateRunExpandsParameterizedCaseFromExplicitList(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	c, err := st.Cases.Create(ctx, p.ID, "", parameterizedContent("Login"), domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	ordinary, err := st.Cases.Create(ctx, p.ID, "", domain.CaseContent{Title: "Ordinary"}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create ordinary case: %v", err)
	}

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "run", CaseIDs: []string{c.ID, ordinary.ID}})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}

	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("got %d items, want 3 (2 rows + 1 ordinary)", len(items))
	}
	byTestName := map[string]domain.RunItem{}
	for _, it := range items {
		byTestName[it.TestName] = it
	}
	if got := byTestName["valid"].Content.Steps[0].Action; got != "Enter admin@example.com" {
		t.Errorf("valid row step = %q, want substituted", got)
	}
	if got := byTestName["invalid"].Content.Steps[0].Action; got != "Enter nobody@example.com" {
		t.Errorf("invalid row step = %q, want substituted", got)
	}
	if byTestName[""].TestDataRow != nil {
		t.Errorf("ordinary item TestDataRow = %+v, want nil", byTestName[""].TestDataRow)
	}
}

func TestCreateRunExpandsParameterizedCaseFromSuite(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	c, err := st.Cases.Create(ctx, p.ID, "", parameterizedContent("Login"), domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	suite, err := s.CreateSuite(ctx, p.ID, "Smoke")
	if err != nil {
		t.Fatalf("create suite: %v", err)
	}
	if err := s.AddCaseToSuite(ctx, suite.ID, c.ID); err != nil {
		t.Fatalf("add case to suite: %v", err)
	}

	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "run", SuiteID: suite.ID})
	if err != nil {
		t.Fatalf("CreateRun: %v", err)
	}
	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("got %d items via suite, want 2 (one per row)", len(items))
	}
}

func TestAddRunItemExpandsParameterizedCase(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	c, err := st.Cases.Create(ctx, p.ID, "", parameterizedContent("Login"), domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "run"})
	if err != nil {
		t.Fatalf("create empty run: %v", err)
	}

	ids, err := s.AddRunItem(ctx, run.ID, c.ID)
	if err != nil {
		t.Fatalf("AddRunItem: %v", err)
	}
	if len(ids) != 2 {
		t.Fatalf("AddRunItem returned %d ids, want 2 (one per row)", len(ids))
	}

	items, err := s.RunItems(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("RunItems: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("got %d items after AddRunItem, want 2", len(items))
	}
}

func TestAddRunItemOnOrdinaryCaseReturnsOneID(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	p, err := st.Projects.Create(ctx, "QA", "")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	c, err := st.Cases.Create(ctx, p.ID, "", domain.CaseContent{Title: "Ordinary"}, domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	run, err := s.CreateRun(ctx, p.ID, service.RunInput{Name: "run"})
	if err != nil {
		t.Fatalf("create empty run: %v", err)
	}

	ids, err := s.AddRunItem(ctx, run.ID, c.ID)
	if err != nil {
		t.Fatalf("AddRunItem: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("AddRunItem returned %d ids for an ordinary case, want exactly 1", len(ids))
	}
}
