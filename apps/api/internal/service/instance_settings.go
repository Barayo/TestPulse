package service

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// InstanceSettings returns the single instance-wide settings row
// (enable-public-project-access). Unauthenticated callers may read it (it
// backs the public GET /api/v1/meta field) — no actor is required.
func (s *Service) InstanceSettings(ctx context.Context) (domain.InstanceSettings, error) {
	return s.store.InstanceSettings.Get(ctx)
}

// SetPublicProjectsEnabled updates the instance-wide kill switch. Tenant
// Admin enforcement happens at the route level (requireTenantAdmin), the
// same as SetTenantAdmin — this method does not re-check the actor.
func (s *Service) SetPublicProjectsEnabled(ctx context.Context, enabled bool) error {
	if err := s.store.InstanceSettings.SetPublicProjectsEnabled(ctx, enabled); err != nil {
		return err
	}
	s.audit(ctx, "update", "instance_settings", "public_projects_enabled")
	return nil
}

// ListPublicProjects returns every project eligible for the anonymous
// discovery index (add-public-project-discovery D2): reads the
// instance-wide switch once and short-circuits to an empty slice when off,
// before ever calling store.ListPublic — the handler never distinguishes
// "switch off" from "nothing published", matching the same non-disclosure
// posture IsProjectPubliclyAccessible's uniform 404 already established.
func (s *Service) ListPublicProjects(ctx context.Context) ([]domain.Project, error) {
	settings, err := s.store.InstanceSettings.Get(ctx)
	if err != nil {
		return nil, err
	}
	if !settings.PublicProjectsEnabled {
		return []domain.Project{}, nil
	}
	return s.store.Projects.ListPublic(ctx)
}

// IsProjectPubliclyAccessible is the two-flag AND used by requirePublicProject
// (design.md): the instance-wide kill switch, checked first, then the
// project's own PublicAccess flag. No Actor is involved — this backs
// unauthenticated reads. An unknown project is treated as inaccessible
// (false, nil error), not an error, matching the "same 404 either way"
// existence-hiding decision.
func (s *Service) IsProjectPubliclyAccessible(ctx context.Context, projectID string) (bool, error) {
	settings, err := s.store.InstanceSettings.Get(ctx)
	if err != nil {
		return false, err
	}
	if !settings.PublicProjectsEnabled {
		return false, nil
	}
	p, err := s.store.Projects.Get(ctx, projectID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	return p.PublicAccess, nil
}
