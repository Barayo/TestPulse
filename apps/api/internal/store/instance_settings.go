package store

import (
	"context"
	"encoding/json"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// InstanceSettingsRepo reads and updates the single instance_settings row
// (enable-public-project-access, add-data-retention D8) — a singleton
// enforced by the table's `id boolean primary key check (id)` schema.
type InstanceSettingsRepo struct {
	pool *pgxpool.Pool
}

func (r *InstanceSettingsRepo) Get(ctx context.Context) (domain.InstanceSettings, error) {
	var s domain.InstanceSettings
	var customPalette []byte
	var oidcIssuer, oidcClientID, oidcGroupClaim *string
	var oidcClientSecret []byte
	var oidcAdminClaimValues []string
	var jiraSiteURL *string
	err := r.pool.QueryRow(ctx,
		`SELECT public_projects_enabled, run_retention_days, auto_archive_inactive_days, run_auto_archive_inactive_days, color_theme, custom_palette, updated_at,
		        oidc_issuer, oidc_client_id, oidc_client_secret_encrypted, oidc_group_claim, oidc_admin_claim_values, oidc_only,
		        jira_site_url, session_timeout_days, default_landing_view, default_language, per_user_language_enabled
		 FROM instance_settings WHERE id`,
	).Scan(&s.PublicProjectsEnabled, &s.RunRetentionDays, &s.AutoArchiveInactiveDays, &s.RunAutoArchiveInactiveDays, &s.ColorTheme, &customPalette, &s.UpdatedAt,
		&oidcIssuer, &oidcClientID, &oidcClientSecret, &oidcGroupClaim, &oidcAdminClaimValues, &s.OIDCOnly, &jiraSiteURL, &s.SessionTimeoutDays,
		&s.DefaultLandingView, &s.DefaultLanguage, &s.PerUserLanguageEnabled)
	if err != nil {
		return s, err
	}
	if jiraSiteURL != nil {
		s.JiraSiteURL = *jiraSiteURL
	}
	if customPalette != nil {
		s.CustomPalette = &domain.CustomPalette{}
		if err := json.Unmarshal(customPalette, s.CustomPalette); err != nil {
			return s, err
		}
	}
	if oidcIssuer != nil {
		s.OIDCIssuer = *oidcIssuer
	}
	if oidcClientID != nil {
		s.OIDCClientID = *oidcClientID
	}
	if oidcGroupClaim != nil {
		s.OIDCGroupClaim = *oidcGroupClaim
	}
	s.OIDCClientSecretSet = len(oidcClientSecret) > 0
	s.OIDCAdminClaimValues = oidcAdminClaimValues
	return s, nil
}

// GetOIDCClientSecret returns the raw encrypted bytes stored for the OIDC
// client secret — used only by the server layer to build an
// OIDCAuthenticator (via Service.DecryptedOIDCClientSecret), never exposed
// through Get/domain.InstanceSettings.
func (r *InstanceSettingsRepo) GetOIDCClientSecret(ctx context.Context) ([]byte, error) {
	var secret []byte
	err := r.pool.QueryRow(ctx, `SELECT oidc_client_secret_encrypted FROM instance_settings WHERE id`).Scan(&secret)
	return secret, err
}

// SetOIDCClientSecret stores pre-encrypted bytes directly — encryption
// itself happens in the service layer, which holds the encryption key.
func (r *InstanceSettingsRepo) SetOIDCClientSecret(ctx context.Context, encrypted []byte) error {
	_, err := r.pool.Exec(ctx, `UPDATE instance_settings SET oidc_client_secret_encrypted = $1 WHERE id`, encrypted)
	return err
}

// Update applies only the non-nil fields of upd (design.md D8/D9 of
// add-data-retention — generalizes the previous single-field
// SetPublicProjectsEnabled into a partial update; ColorTheme/CustomPalette
// added by add-color-theme-customization).
func (r *InstanceSettingsRepo) Update(ctx context.Context, upd domain.InstanceSettingsUpdate) (domain.InstanceSettings, error) {
	if upd.DisableOIDC != nil && *upd.DisableOIDC {
		// A dedicated clear, not expressible via COALESCE (which can never
		// set a column back to NULL/empty) — clears every oidc_* column at
		// once regardless of anything else in the same update.
		if _, err := r.pool.Exec(ctx,
			`UPDATE instance_settings SET
			   oidc_issuer = NULL, oidc_client_id = NULL, oidc_client_secret_encrypted = NULL,
			   oidc_group_claim = NULL, oidc_admin_claim_values = NULL, oidc_only = false,
			   updated_at = now()
			 WHERE id`,
		); err != nil {
			return domain.InstanceSettings{}, err
		}
		return r.Get(ctx)
	}

	var customPaletteJSON []byte
	if upd.CustomPalette != nil {
		var err error
		customPaletteJSON, err = json.Marshal(upd.CustomPalette)
		if err != nil {
			return domain.InstanceSettings{}, err
		}
	}
	var adminClaimValues []string
	if upd.OIDCAdminClaimValues != nil {
		adminClaimValues = *upd.OIDCAdminClaimValues
	}
	if _, err := r.pool.Exec(ctx,
		`UPDATE instance_settings SET
		   public_projects_enabled = COALESCE($1, public_projects_enabled),
		   run_retention_days = COALESCE($2, run_retention_days),
		   auto_archive_inactive_days = COALESCE($3, auto_archive_inactive_days),
		   run_auto_archive_inactive_days = COALESCE($4, run_auto_archive_inactive_days),
		   color_theme = COALESCE($5, color_theme),
		   custom_palette = COALESCE($6, custom_palette),
		   oidc_issuer = COALESCE($7, oidc_issuer),
		   oidc_client_id = COALESCE($8, oidc_client_id),
		   oidc_group_claim = COALESCE($9, oidc_group_claim),
		   oidc_admin_claim_values = COALESCE($10, oidc_admin_claim_values),
		   oidc_only = COALESCE($11, oidc_only),
		   jira_site_url = COALESCE($12, jira_site_url),
		   session_timeout_days = COALESCE($13, session_timeout_days),
		   default_landing_view = COALESCE($14, default_landing_view),
		   default_language = COALESCE($15, default_language),
		   per_user_language_enabled = COALESCE($16, per_user_language_enabled),
		   updated_at = now()
		 WHERE id`,
		upd.PublicProjectsEnabled, upd.RunRetentionDays, upd.AutoArchiveInactiveDays, upd.RunAutoArchiveInactiveDays, upd.ColorTheme, nullIfEmpty(customPaletteJSON),
		upd.OIDCIssuer, upd.OIDCClientID, upd.OIDCGroupClaim, nullIfEmptyStrings(adminClaimValues, upd.OIDCAdminClaimValues), upd.OIDCOnly,
		upd.JiraSiteURL, upd.SessionTimeoutDays, upd.DefaultLandingView, upd.DefaultLanguage, upd.PerUserLanguageEnabled,
	); err != nil {
		return domain.InstanceSettings{}, err
	}
	return r.Get(ctx)
}

// nullIfEmptyStrings lets COALESCE leave oidc_admin_claim_values untouched
// when the caller didn't set it (set == nil), while still allowing it to be
// explicitly cleared to an empty list (set non-nil, values empty).
func nullIfEmptyStrings(values []string, set *[]string) any {
	if set == nil {
		return nil
	}
	return values
}

// nullIfEmpty lets COALESCE leave custom_palette untouched when the caller
// didn't set one, since pgx would otherwise bind a non-nil empty []byte.
func nullIfEmpty(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}
