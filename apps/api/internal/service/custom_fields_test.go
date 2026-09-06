package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

func TestCustomFieldCRUDIsAThinPassthrough(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)

	f, err := s.CreateCustomField(ctx, p.ID, "Automation Owner", domain.CustomFieldTypeText)
	if err != nil {
		t.Fatalf("CreateCustomField: %v", err)
	}
	if f.Name != "Automation Owner" || f.FieldType != domain.CustomFieldTypeText {
		t.Errorf("field = %+v", f)
	}

	fields, err := s.ListCustomFields(ctx, p.ID)
	if err != nil {
		t.Fatalf("ListCustomFields: %v", err)
	}
	if len(fields) != 1 {
		t.Fatalf("fields = %+v", fields)
	}

	renamed, err := s.RenameCustomField(ctx, f.ID, "Owner")
	if err != nil {
		t.Fatalf("RenameCustomField: %v", err)
	}
	if renamed.Name != "Owner" {
		t.Errorf("renamed = %+v", renamed)
	}

	preview, err := s.CustomFieldDeletionPreview(ctx, f.ID, p.ID)
	if err != nil {
		t.Fatalf("CustomFieldDeletionPreview: %v", err)
	}
	if preview.CaseCount != 0 {
		t.Errorf("preview = %+v, want 0", preview)
	}

	if err := s.DeleteCustomField(ctx, f.ID); err != nil {
		t.Fatalf("DeleteCustomField: %v", err)
	}
	fields, err = s.ListCustomFields(ctx, p.ID)
	if err != nil {
		t.Fatalf("ListCustomFields after delete: %v", err)
	}
	if len(fields) != 0 {
		t.Errorf("fields after delete = %+v", fields)
	}
}

func TestCustomFieldReorderIsAThinPassthrough(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	a, _ := s.CreateCustomField(ctx, p.ID, "A", domain.CustomFieldTypeText)
	b, _ := s.CreateCustomField(ctx, p.ID, "B", domain.CustomFieldTypeText)

	if err := s.ReorderCustomFields(ctx, p.ID, []string{b.ID, a.ID}); err != nil {
		t.Fatalf("ReorderCustomFields: %v", err)
	}
	fields, err := s.ListCustomFields(ctx, p.ID)
	if err != nil {
		t.Fatalf("ListCustomFields: %v", err)
	}
	if len(fields) != 2 || fields[0].ID != b.ID || fields[1].ID != a.ID {
		t.Errorf("fields = %+v, want [B, A]", fields)
	}
}

func TestCustomFieldOptionCRUDIsAThinPassthrough(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	f, _ := s.CreateCustomField(ctx, p.ID, "Component", domain.CustomFieldTypeSelect)

	api, err := s.AddCustomFieldOption(ctx, f.ID, "API")
	if err != nil {
		t.Fatalf("AddCustomFieldOption: %v", err)
	}
	web, err := s.AddCustomFieldOption(ctx, f.ID, "Web")
	if err != nil {
		t.Fatalf("AddCustomFieldOption: %v", err)
	}

	if err := s.ReorderCustomFieldOptions(ctx, f.ID, []string{web.ID, api.ID}); err != nil {
		t.Fatalf("ReorderCustomFieldOptions: %v", err)
	}
	if err := s.RemoveCustomFieldOption(ctx, f.ID, api.ID); err != nil {
		t.Fatalf("RemoveCustomFieldOption: %v", err)
	}

	fields, err := s.ListCustomFields(ctx, p.ID)
	if err != nil {
		t.Fatalf("ListCustomFields: %v", err)
	}
	if len(fields) != 1 || len(fields[0].Options) != 1 || fields[0].Options[0].ID != web.ID {
		t.Fatalf("fields = %+v", fields)
	}
}

func TestEditCaseRejectsValueForUnknownCustomField(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)

	content := c.Content
	content.CustomFields = map[string]string{"not-a-real-field-id": "x"}
	if _, err := s.EditCase(ctx, c.ID, content); err == nil {
		t.Error("EditCase: want error for unknown custom field id, got nil")
	}
}

func TestEditCaseRejectsSelectValueNotAmongCurrentOptions(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)
	f, err := s.CreateCustomField(ctx, p.ID, "Component", domain.CustomFieldTypeSelect)
	if err != nil {
		t.Fatalf("CreateCustomField: %v", err)
	}
	if _, err := s.AddCustomFieldOption(ctx, f.ID, "API"); err != nil {
		t.Fatalf("AddCustomFieldOption: %v", err)
	}

	content := c.Content
	content.CustomFields = map[string]string{f.ID: "not-a-real-option-id"}
	if _, err := s.EditCase(ctx, c.ID, content); err == nil {
		t.Error("EditCase: want error for a select value that isn't a current option, got nil")
	}
}

func TestEditCaseAcceptsValidCustomFieldValues(t *testing.T) {
	s := lifecycleTestService(t)
	ctx := context.Background()
	p := mustLifecycleProject(t, s)
	c := mustLifecycleCase(t, s, p.ID)
	f, err := s.CreateCustomField(ctx, p.ID, "Component", domain.CustomFieldTypeSelect)
	if err != nil {
		t.Fatalf("CreateCustomField: %v", err)
	}
	opt, err := s.AddCustomFieldOption(ctx, f.ID, "API")
	if err != nil {
		t.Fatalf("AddCustomFieldOption: %v", err)
	}

	content := c.Content
	content.CustomFields = map[string]string{f.ID: opt.ID}
	updated, err := s.EditCase(ctx, c.ID, content)
	if err != nil {
		t.Fatalf("EditCase: %v", err)
	}
	if updated.Content.CustomFields[f.ID] != opt.ID {
		t.Errorf("Content = %+v, want %s=%s", updated.Content.CustomFields, f.ID, opt.ID)
	}
}
