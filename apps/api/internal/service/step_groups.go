package service

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// CreateStepGroup, ListStepGroups, GetStepGroup, UpdateStepGroup, and
// DeleteStepGroup are thin passthroughs over StepGroupRepo, mirroring
// CustomField's service-layer shape (add-reusable-steps). Permission
// enforcement (manageProject for writes, read for reads) happens at the
// HTTP router layer via requirePermission, same as custom fields.

func (s *Service) CreateStepGroup(ctx context.Context, projectID, name string, steps []domain.Step) (domain.StepGroup, error) {
	group := domain.StepGroup{ProjectID: projectID, Name: name, Steps: steps}
	if err := group.Validate(); err != nil {
		return domain.StepGroup{}, invalid("%s", err)
	}
	g, err := s.store.StepGroups.Create(ctx, projectID, name, steps)
	if err != nil {
		return domain.StepGroup{}, err
	}
	s.audit(ctx, "create", "stepGroup", g.ID)
	return g, nil
}

func (s *Service) ListStepGroups(ctx context.Context, projectID string) ([]domain.StepGroup, error) {
	return s.store.StepGroups.List(ctx, projectID)
}

func (s *Service) GetStepGroup(ctx context.Context, groupID string) (domain.StepGroup, error) {
	return s.store.StepGroups.Get(ctx, groupID)
}

func (s *Service) UpdateStepGroup(ctx context.Context, groupID, name string, steps []domain.Step) (domain.StepGroup, error) {
	if err := (domain.StepGroup{Name: name, Steps: steps}).Validate(); err != nil {
		return domain.StepGroup{}, invalid("%s", err)
	}
	g, err := s.store.StepGroups.Update(ctx, groupID, name, steps)
	if err != nil {
		return domain.StepGroup{}, err
	}
	s.audit(ctx, "update", "stepGroup", groupID)
	return g, nil
}

func (s *Service) DeleteStepGroup(ctx context.Context, groupID string) error {
	if err := s.store.StepGroups.Delete(ctx, groupID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "stepGroup", groupID)
	return nil
}

// ProjectIDForStepGroup resolves the project a step group belongs to —
// used by requirePermission's per-resource resolver, mirroring
// ProjectIDForCustomField.
func (s *Service) ProjectIDForStepGroup(ctx context.Context, groupID string) (string, error) {
	return s.store.StepGroups.ProjectID(ctx, groupID)
}

// StepGroupIDByKey resolves a step group's key to its internal id —
// mirrors CaseIDByKey/SuiteIDByKey, used by the upsert_step_group MCP
// tool's edit-by-key path.
func (s *Service) StepGroupIDByKey(ctx context.Context, key string) (string, error) {
	g, err := s.store.StepGroups.GetByKey(ctx, key)
	if err != nil {
		return "", err
	}
	return g.ID, nil
}
