package service

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// --- Custom fields ---
// Thin passthroughs to the store (add-case-custom-fields), mirroring
// FlakyCases' shape — permission enforcement (manageProject for writes,
// read for list) lives at the HTTP layer, matching every other
// project-scoped resource in this codebase.

func (s *Service) CreateCustomField(ctx context.Context, projectID, name string, fieldType domain.CustomFieldType) (domain.CustomField, error) {
	f, err := s.store.CustomFields.Create(ctx, projectID, name, fieldType)
	if err != nil {
		return domain.CustomField{}, err
	}
	s.audit(ctx, "create", "customField", f.ID)
	return f, nil
}

func (s *Service) ListCustomFields(ctx context.Context, projectID string) ([]domain.CustomField, error) {
	return s.store.CustomFields.List(ctx, projectID)
}

func (s *Service) RenameCustomField(ctx context.Context, fieldID, name string) (domain.CustomField, error) {
	f, err := s.store.CustomFields.Rename(ctx, fieldID, name)
	if err != nil {
		return domain.CustomField{}, err
	}
	s.audit(ctx, "rename", "customField", fieldID)
	return f, nil
}

func (s *Service) DeleteCustomField(ctx context.Context, fieldID string) error {
	if err := s.store.CustomFields.Delete(ctx, fieldID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "customField", fieldID)
	return nil
}

func (s *Service) CustomFieldDeletionPreview(ctx context.Context, fieldID, projectID string) (domain.CustomFieldDeletionPreview, error) {
	return s.store.CustomFields.DeletionPreview(ctx, fieldID, projectID)
}

func (s *Service) ReorderCustomFields(ctx context.Context, projectID string, fieldIDs []string) error {
	return s.store.CustomFields.Reorder(ctx, projectID, fieldIDs)
}

func (s *Service) AddCustomFieldOption(ctx context.Context, fieldID, value string) (domain.CustomFieldOption, error) {
	return s.store.CustomFields.AddOption(ctx, fieldID, value)
}

func (s *Service) RemoveCustomFieldOption(ctx context.Context, fieldID, optionID string) error {
	return s.store.CustomFields.RemoveOption(ctx, fieldID, optionID)
}

func (s *Service) ReorderCustomFieldOptions(ctx context.Context, fieldID string, optionIDs []string) error {
	return s.store.CustomFields.ReorderOptions(ctx, fieldID, optionIDs)
}

// validateCustomFieldValues rejects a value for a field id that doesn't
// belong to the case's project, and a select field's value that isn't
// one of its currently-defined options (design.md D5). A version that
// references a since-deleted field/option is a read-time concern (D6/D9),
// not a write-time one — this only ever runs at write time.
func (s *Service) validateCustomFieldValues(ctx context.Context, projectID string, values map[string]string) error {
	if len(values) == 0 {
		return nil
	}
	fields, err := s.store.CustomFields.List(ctx, projectID)
	if err != nil {
		return err
	}
	byID := make(map[string]domain.CustomField, len(fields))
	for _, f := range fields {
		byID[f.ID] = f
	}
	for fieldID, value := range values {
		f, ok := byID[fieldID]
		if !ok {
			return invalid("unknown custom field %q", fieldID)
		}
		if f.FieldType != domain.CustomFieldTypeSelect {
			continue
		}
		valid := false
		for _, opt := range f.Options {
			if opt.ID == value {
				valid = true
				break
			}
		}
		if !valid {
			return invalid("%q is not a current option for custom field %q", value, f.Name)
		}
	}
	return nil
}
