package store_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestCustomFieldCreateListOrdersByPosition(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)

	first, err := s.CustomFields.Create(ctx, p.ID, "Automation Owner", domain.CustomFieldTypeText)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	second, err := s.CustomFields.Create(ctx, p.ID, "Component", domain.CustomFieldTypeSelect)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	fields, err := s.CustomFields.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(fields) != 2 || fields[0].ID != first.ID || fields[1].ID != second.ID {
		t.Errorf("fields = %+v, want [%s, %s] in creation order", fields, first.ID, second.ID)
	}
	if fields[0].Name != "Automation Owner" || fields[0].FieldType != domain.CustomFieldTypeText {
		t.Errorf("fields[0] = %+v", fields[0])
	}
}

func TestCustomFieldRename(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	f, err := s.CustomFields.Create(ctx, p.ID, "Component", domain.CustomFieldTypeText)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	renamed, err := s.CustomFields.Rename(ctx, f.ID, "Subsystem")
	if err != nil {
		t.Fatalf("Rename: %v", err)
	}
	if renamed.Name != "Subsystem" || renamed.FieldType != domain.CustomFieldTypeText {
		t.Errorf("renamed = %+v", renamed)
	}
}

func TestCustomFieldDeleteCascadesOptions(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	f, err := s.CustomFields.Create(ctx, p.ID, "Component", domain.CustomFieldTypeSelect)
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := s.CustomFields.AddOption(ctx, f.ID, "API"); err != nil {
		t.Fatalf("AddOption: %v", err)
	}

	if err := s.CustomFields.Delete(ctx, f.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	fields, err := s.CustomFields.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(fields) != 0 {
		t.Errorf("fields after delete = %+v, want none", fields)
	}
}

func TestCustomFieldReorder(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	a, _ := s.CustomFields.Create(ctx, p.ID, "A", domain.CustomFieldTypeText)
	b, _ := s.CustomFields.Create(ctx, p.ID, "B", domain.CustomFieldTypeText)
	c, _ := s.CustomFields.Create(ctx, p.ID, "C", domain.CustomFieldTypeText)

	if err := s.CustomFields.Reorder(ctx, p.ID, []string{c.ID, a.ID, b.ID}); err != nil {
		t.Fatalf("Reorder: %v", err)
	}

	fields, err := s.CustomFields.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(fields) != 3 || fields[0].ID != c.ID || fields[1].ID != a.ID || fields[2].ID != b.ID {
		t.Errorf("fields = %+v, want [C, A, B]", fields)
	}
}

func TestCustomFieldOptionAddRemoveReorder(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	f, _ := s.CustomFields.Create(ctx, p.ID, "Component", domain.CustomFieldTypeSelect)

	api, err := s.CustomFields.AddOption(ctx, f.ID, "API")
	if err != nil {
		t.Fatalf("AddOption: %v", err)
	}
	web, err := s.CustomFields.AddOption(ctx, f.ID, "Web")
	if err != nil {
		t.Fatalf("AddOption: %v", err)
	}
	mobile, err := s.CustomFields.AddOption(ctx, f.ID, "Mobile")
	if err != nil {
		t.Fatalf("AddOption: %v", err)
	}

	if err := s.CustomFields.ReorderOptions(ctx, f.ID, []string{mobile.ID, api.ID, web.ID}); err != nil {
		t.Fatalf("ReorderOptions: %v", err)
	}
	if err := s.CustomFields.RemoveOption(ctx, api.ID); err != nil {
		t.Fatalf("RemoveOption: %v", err)
	}

	fields, err := s.CustomFields.List(ctx, p.ID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(fields) != 1 || len(fields[0].Options) != 2 {
		t.Fatalf("fields = %+v", fields)
	}
	if fields[0].Options[0].ID != mobile.ID || fields[0].Options[1].ID != web.ID {
		t.Errorf("options = %+v, want [Mobile, Web]", fields[0].Options)
	}
}

func TestCustomFieldDeletionPreviewCountsCurrentCasesWithValue(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	p := mustProject(t, s)
	f, _ := s.CustomFields.Create(ctx, p.ID, "Automation Owner", domain.CustomFieldTypeText)

	withValue := defaultContent("has value")
	withValue.CustomFields = map[string]string{f.ID: "ana"}
	if _, err := s.Cases.Create(ctx, p.ID, "", withValue, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("Create case: %v", err)
	}

	withoutValue := defaultContent("no value")
	if _, err := s.Cases.Create(ctx, p.ID, "", withoutValue, domain.ResultActorUnknown, ""); err != nil {
		t.Fatalf("Create case: %v", err)
	}

	preview, err := s.CustomFields.DeletionPreview(ctx, f.ID, p.ID)
	if err != nil {
		t.Fatalf("DeletionPreview: %v", err)
	}
	if preview.CaseCount != 1 {
		t.Errorf("CaseCount = %d, want 1", preview.CaseCount)
	}
}
