package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
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

func TestCaseParametersRoundTripOnCreateAndGet(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	c, err := s.Cases.Create(ctx, p.ID, "", parameterizedContent("Login"), domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	if c.Content.Parameters == nil || len(c.Content.Parameters.Rows) != 2 {
		t.Fatalf("Content.Parameters after create = %+v, want 2 rows", c.Content.Parameters)
	}

	got, err := s.Cases.Get(ctx, c.ID)
	if err != nil {
		t.Fatalf("get case: %v", err)
	}
	if got.Content.Parameters == nil || len(got.Content.Parameters.Columns) != 2 || got.Content.Parameters.Columns[0] != "Name" {
		t.Fatalf("Content.Parameters after Get = %+v, want Name-first 2-column table", got.Content.Parameters)
	}
	if got.Content.Parameters.Rows[1]["username"] != "nobody@example.com" {
		t.Errorf("second row username = %q, want nobody@example.com", got.Content.Parameters.Rows[1]["username"])
	}
}

func TestCaseParametersAbsentForOrdinaryCase(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	c := mustCase(t, s, p.ID, "ordinary case")
	got, err := s.Cases.Get(ctx, c.ID)
	if err != nil {
		t.Fatalf("get case: %v", err)
	}
	if got.Content.Parameters != nil {
		t.Errorf("Parameters = %+v, want nil for a case that never set them", got.Content.Parameters)
	}
}

func TestCreateWithSpecsExpandsParameterizedCaseIntoOneItemPerRow(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c, err := s.Cases.Create(ctx, p.ID, "", parameterizedContent("Login"), domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	ordinary := mustCase(t, s, p.ID, "ordinary case")

	run, err := s.Runs.Create(ctx, p.ID, "run", nil)
	if err != nil {
		t.Fatalf("create empty run: %v", err)
	}
	if _, err := s.Runs.AddItemSpec(ctx, run.ID, store.RunItemSpec{CaseID: c.ID, TestName: "valid", TestDataRowName: "valid"}); err != nil {
		t.Fatalf("AddItemSpec valid: %v", err)
	}
	if _, err := s.Runs.AddItemSpec(ctx, run.ID, store.RunItemSpec{CaseID: c.ID, TestName: "invalid", TestDataRowName: "invalid"}); err != nil {
		t.Fatalf("AddItemSpec invalid: %v", err)
	}
	if _, err := s.Runs.AddItem(ctx, run.ID, ordinary.ID, ""); err != nil {
		t.Fatalf("AddItem ordinary: %v", err)
	}

	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("Items: %v", err)
	}
	if len(items) != 3 {
		t.Fatalf("got %d items, want 3 (2 rows + 1 ordinary)", len(items))
	}

	byTestName := map[string]domain.RunItem{}
	for _, it := range items {
		byTestName[it.TestName] = it
	}

	valid, ok := byTestName["valid"]
	if !ok {
		t.Fatal("no item with testName 'valid'")
	}
	if valid.Content.Steps[0].Action != "Enter admin@example.com" {
		t.Errorf("valid row step = %q, want substituted", valid.Content.Steps[0].Action)
	}
	if valid.TestDataRow["username"] != "admin@example.com" {
		t.Errorf("valid row TestDataRow = %+v, want username=admin@example.com", valid.TestDataRow)
	}
	if _, hasName := valid.TestDataRow["Name"]; hasName {
		t.Error("TestDataRow should not include the Name column")
	}

	invalid, ok := byTestName["invalid"]
	if !ok {
		t.Fatal("no item with testName 'invalid'")
	}
	if invalid.Content.Steps[0].Action != "Enter nobody@example.com" {
		t.Errorf("invalid row step = %q, want substituted", invalid.Content.Steps[0].Action)
	}

	ordinaryItem, ok := byTestName[""]
	if !ok {
		t.Fatal("no item with empty testName (the ordinary case)")
	}
	if ordinaryItem.TestDataRow != nil {
		t.Errorf("ordinary item TestDataRow = %+v, want nil", ordinaryItem.TestDataRow)
	}
}

func TestAddingSameOrdinaryCaseTwiceStillRejected(t *testing.T) {
	// The baseline's blanket UNIQUE (run_id, case_id) was replaced with two
	// partial unique indexes to let a parameterized case's rows share a
	// case_id within one run (see 00017_parameterized_cases.sql) — this
	// confirms the original one-ordinary-item-per-case-per-run invariant
	// still holds for a ordinary (non-parameterized, test_data_row_name
	// IS NULL) item.
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c := mustCase(t, s, p.ID, "ordinary")
	run, err := s.Runs.Create(ctx, p.ID, "run", nil)
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	if _, err := s.Runs.AddItem(ctx, run.ID, c.ID, ""); err != nil {
		t.Fatalf("first AddItem: %v", err)
	}
	if _, err := s.Runs.AddItem(ctx, run.ID, c.ID, ""); err == nil {
		t.Error("second AddItem of the same ordinary case to the same run succeeded, want a constraint violation")
	}
}

func TestAddItemSpecsIsAtomicAcrossRows(t *testing.T) {
	// service.AddRunItem's parameterized-case expansion must not commit
	// some rows and fail on others (post-implementation review finding) —
	// AddItemSpecs pins every spec in one transaction, unlike looping the
	// single-item AddItemSpec (each its own transaction).
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c, err := s.Cases.Create(ctx, p.ID, "", parameterizedContent("Login"), domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}
	run, err := s.Runs.Create(ctx, p.ID, "run", nil)
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	// Pre-seed the "valid" row so the batch below collides on it.
	if _, err := s.Runs.AddItemSpec(ctx, run.ID, store.RunItemSpec{CaseID: c.ID, TestName: "valid", TestDataRowName: "valid"}); err != nil {
		t.Fatalf("pre-seed AddItemSpec: %v", err)
	}

	specs := []store.RunItemSpec{
		{CaseID: c.ID, TestName: "invalid", TestDataRowName: "invalid"},
		{CaseID: c.ID, TestName: "valid", TestDataRowName: "valid"}, // collides with the pre-seeded row
	}
	if _, err := s.Runs.AddItemSpecs(ctx, run.ID, specs); err == nil {
		t.Fatal("AddItemSpecs with a colliding row succeeded, want an error")
	}

	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("Items: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("got %d items after a failed AddItemSpecs, want exactly 1 (the pre-seeded row) — the 'invalid' row must not have been committed despite succeeding before the collision", len(items))
	}
}

func TestCreateWithCaseIDsStillProducesOneItemPerCase(t *testing.T) {
	// Confirms the Create/CreateWithOptions wrapper reproduces prior
	// behavior exactly for a parameterized case passed as a bare id: one
	// row's worth of substitution does NOT happen via the legacy path,
	// since specsFromCaseIDs always sets an empty TestDataRowName. Only
	// the service layer's expandCaseIntoSpecs (added in section 5) is
	// responsible for turning one parameterized case id into N specs.
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	c, err := s.Cases.Create(ctx, p.ID, "", parameterizedContent("Login"), domain.ResultActorUnknown, "")
	if err != nil {
		t.Fatalf("create case: %v", err)
	}

	run, err := s.Runs.Create(ctx, p.ID, "run", []string{c.ID})
	if err != nil {
		t.Fatalf("create run: %v", err)
	}
	items, err := s.Runs.Items(ctx, run.ID, "")
	if err != nil {
		t.Fatalf("Items: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("got %d items via the bare-case-id path, want exactly 1 (no service-layer expansion happened)", len(items))
	}
	if items[0].TestDataRow != nil {
		t.Errorf("TestDataRow = %+v, want nil (no row was specified)", items[0].TestDataRow)
	}
	if items[0].Content.Steps[0].Action != "Enter {username}" {
		t.Errorf("step text = %q, want unsubstituted template", items[0].Content.Steps[0].Action)
	}
}
