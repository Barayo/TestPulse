package service

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// ListOIDCTeamMappings returns the configured claim→Team mappings
// (add-sso-oidc design.md D10). Tenant Admin enforcement happens at the
// route level, the same as other instance-wide settings.
func (s *Service) ListOIDCTeamMappings(ctx context.Context) ([]domain.OIDCTeamMapping, error) {
	return s.store.OIDCTeamMappings.List(ctx)
}

// CreateOIDCTeamMapping validates the referenced Team exists before
// creating the mapping — an unknown teamID is a validation error (400),
// not a store-level foreign-key failure surfacing as a 500.
func (s *Service) CreateOIDCTeamMapping(ctx context.Context, claimValue, teamID string) (domain.OIDCTeamMapping, error) {
	if claimValue == "" {
		return domain.OIDCTeamMapping{}, invalid("claimValue is required")
	}
	if _, err := s.store.Teams.Get(ctx, teamID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return domain.OIDCTeamMapping{}, invalid("unknown team %q", teamID)
		}
		return domain.OIDCTeamMapping{}, err
	}
	return s.store.OIDCTeamMappings.Create(ctx, claimValue, teamID)
}

func (s *Service) DeleteOIDCTeamMapping(ctx context.Context, id string) error {
	return s.store.OIDCTeamMappings.Delete(ctx, id)
}
