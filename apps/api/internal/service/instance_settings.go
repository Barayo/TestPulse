package service

import (
	"context"
	"errors"
	"regexp"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

var (
	validColorThemes = map[string]bool{
		"teal": true, "indigo": true, "ocean": true, "forest": true, "custom": true,
	}
	hexColorPattern = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)
	// validLandingViews (add-configurable-project-landing design.md D6) is
	// shared between UpdateInstanceSettings (DefaultLandingView) and
	// UpdateProject (LandingView) so the two never drift.
	validLandingViews = map[string]bool{
		"dashboard": true, "library": true, "suites": true, "runs": true, "reports": true,
	}
)

// validateCustomPalette rejects any field not matching #RRGGBB, naming the
// specific field (add-color-theme-customization design.md: "rejects, not
// coerces").
func validateCustomPalette(p *domain.CustomPalette) error {
	fields := map[string]string{
		"light.background": p.Light.Background, "light.foreground": p.Light.Foreground,
		"light.card": p.Light.Card, "light.primary": p.Light.Primary,
		"light.primaryForeground": p.Light.PrimaryForeground, "light.muted": p.Light.Muted,
		"light.mutedForeground": p.Light.MutedForeground, "light.accent": p.Light.Accent,
		"light.border": p.Light.Border, "light.input": p.Light.Input,
		"dark.background": p.Dark.Background, "dark.foreground": p.Dark.Foreground,
		"dark.card": p.Dark.Card, "dark.primary": p.Dark.Primary,
		"dark.primaryForeground": p.Dark.PrimaryForeground, "dark.muted": p.Dark.Muted,
		"dark.mutedForeground": p.Dark.MutedForeground, "dark.accent": p.Dark.Accent,
		"dark.border": p.Dark.Border, "dark.input": p.Dark.Input,
	}
	for name, value := range fields {
		if !hexColorPattern.MatchString(value) {
			return invalid("customPalette.%s must be a #RRGGBB hex color", name)
		}
	}
	return nil
}

// InstanceSettings returns the single instance-wide settings row
// (enable-public-project-access). Unauthenticated callers may read it (it
// backs the public GET /api/v1/meta field) — no actor is required.
func (s *Service) InstanceSettings(ctx context.Context) (domain.InstanceSettings, error) {
	return s.store.InstanceSettings.Get(ctx)
}

// UpdateInstanceSettings applies a partial update to the instance-wide
// settings row (design.md D8/D9 of add-data-retention — generalizes the
// previous single-field SetPublicProjectsEnabled). Tenant Admin enforcement
// happens at the route level (requireTenantAdmin), the same as
// SetTenantAdmin — this method does not re-check the actor.
func (s *Service) UpdateInstanceSettings(ctx context.Context, upd domain.InstanceSettingsUpdate) (domain.InstanceSettings, error) {
	if upd.RunRetentionDays != nil && *upd.RunRetentionDays < 0 {
		return domain.InstanceSettings{}, invalid("runRetentionDays must not be negative")
	}
	if upd.AutoArchiveInactiveDays != nil && *upd.AutoArchiveInactiveDays < 0 {
		return domain.InstanceSettings{}, invalid("autoArchiveInactiveDays must not be negative")
	}
	if upd.SessionTimeoutDays != nil && (*upd.SessionTimeoutDays < 1 || *upd.SessionTimeoutDays > 90) {
		return domain.InstanceSettings{}, invalid("sessionTimeoutDays must be between 1 and 90")
	}
	if upd.ColorTheme != nil && !validColorThemes[*upd.ColorTheme] {
		return domain.InstanceSettings{}, invalid("colorTheme must be one of teal, indigo, ocean, forest, custom")
	}
	if upd.DefaultLandingView != nil && !validLandingViews[*upd.DefaultLandingView] {
		return domain.InstanceSettings{}, invalid("defaultLandingView must be one of dashboard, library, suites, runs, reports")
	}
	if upd.CustomPalette != nil {
		if err := validateCustomPalette(upd.CustomPalette); err != nil {
			return domain.InstanceSettings{}, err
		}
	}
	// add-sso-oidc design.md D7: a client secret can only ever be stored
	// encrypted — reject outright rather than silently store it in
	// plaintext or silently drop it.
	if upd.OIDCClientSecret != nil && s.encryptionKey == "" {
		return domain.InstanceSettings{}, invalid("TESTPULSE_ENCRYPTION_KEY must be configured to store an OIDC client secret")
	}
	var current domain.InstanceSettings
	if upd.DisableOIDC == nil && (upd.OIDCOnly != nil || upd.OIDCIssuer != nil || upd.OIDCClientID != nil || upd.OIDCClientSecret != nil) {
		var err error
		current, err = s.store.InstanceSettings.Get(ctx)
		if err != nil {
			return domain.InstanceSettings{}, err
		}
	}
	if upd.OIDCOnly != nil && *upd.OIDCOnly {
		// design.md D6: SSO-only has no break-glass, so it must never be
		// enabled while SSO itself isn't fully configured — that would
		// lock out every login with no way back in short of a direct DB
		// edit.
		issuer, clientID := current.OIDCIssuer, current.OIDCClientID
		if upd.OIDCIssuer != nil {
			issuer = *upd.OIDCIssuer
		}
		if upd.OIDCClientID != nil {
			clientID = *upd.OIDCClientID
		}
		secretSet := current.OIDCClientSecretSet || upd.OIDCClientSecret != nil
		if issuer == "" || clientID == "" || !secretSet {
			return domain.InstanceSettings{}, invalid("cannot enable SSO-only until an issuer, client ID, and client secret are all configured")
		}
	}

	settings, err := s.store.InstanceSettings.Update(ctx, upd)
	if err != nil {
		return domain.InstanceSettings{}, err
	}
	if upd.OIDCClientSecret != nil {
		encrypted, err := encryptSecret(s.encryptionKey, *upd.OIDCClientSecret)
		if err != nil {
			return domain.InstanceSettings{}, err
		}
		if err := s.store.InstanceSettings.SetOIDCClientSecret(ctx, encrypted); err != nil {
			return domain.InstanceSettings{}, err
		}
		settings.OIDCClientSecretSet = true
	}
	s.audit(ctx, "update", "instance_settings", "")
	return settings, nil
}

// DecryptedOIDCClientSecret returns the plaintext OIDC client secret,
// decrypted with the configured encryption key — used only by the server
// layer to build an OIDCAuthenticator, never exposed via InstanceSettings.
// ok is false when no secret has ever been stored.
func (s *Service) DecryptedOIDCClientSecret(ctx context.Context) (secret string, ok bool, err error) {
	encrypted, err := s.store.InstanceSettings.GetOIDCClientSecret(ctx)
	if err != nil {
		return "", false, err
	}
	if len(encrypted) == 0 {
		return "", false, nil
	}
	plaintext, err := decryptSecret(s.encryptionKey, encrypted)
	if err != nil {
		return "", false, err
	}
	return plaintext, true, nil
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
