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
	err := r.pool.QueryRow(ctx,
		`SELECT public_projects_enabled, run_retention_days, auto_archive_inactive_days, color_theme, custom_palette, updated_at FROM instance_settings WHERE id`,
	).Scan(&s.PublicProjectsEnabled, &s.RunRetentionDays, &s.AutoArchiveInactiveDays, &s.ColorTheme, &customPalette, &s.UpdatedAt)
	if err != nil {
		return s, err
	}
	if customPalette != nil {
		s.CustomPalette = &domain.CustomPalette{}
		if err := json.Unmarshal(customPalette, s.CustomPalette); err != nil {
			return s, err
		}
	}
	return s, nil
}

// Update applies only the non-nil fields of upd (design.md D8/D9 of
// add-data-retention — generalizes the previous single-field
// SetPublicProjectsEnabled into a partial update; ColorTheme/CustomPalette
// added by add-color-theme-customization).
func (r *InstanceSettingsRepo) Update(ctx context.Context, upd domain.InstanceSettingsUpdate) (domain.InstanceSettings, error) {
	var customPaletteJSON []byte
	if upd.CustomPalette != nil {
		var err error
		customPaletteJSON, err = json.Marshal(upd.CustomPalette)
		if err != nil {
			return domain.InstanceSettings{}, err
		}
	}
	var s domain.InstanceSettings
	var customPalette []byte
	err := r.pool.QueryRow(ctx,
		`UPDATE instance_settings SET
		   public_projects_enabled = COALESCE($1, public_projects_enabled),
		   run_retention_days = COALESCE($2, run_retention_days),
		   auto_archive_inactive_days = COALESCE($3, auto_archive_inactive_days),
		   color_theme = COALESCE($4, color_theme),
		   custom_palette = COALESCE($5, custom_palette),
		   updated_at = now()
		 WHERE id
		 RETURNING public_projects_enabled, run_retention_days, auto_archive_inactive_days, color_theme, custom_palette, updated_at`,
		upd.PublicProjectsEnabled, upd.RunRetentionDays, upd.AutoArchiveInactiveDays, upd.ColorTheme, nullIfEmpty(customPaletteJSON),
	).Scan(&s.PublicProjectsEnabled, &s.RunRetentionDays, &s.AutoArchiveInactiveDays, &s.ColorTheme, &customPalette, &s.UpdatedAt)
	if err != nil {
		return s, err
	}
	if customPalette != nil {
		s.CustomPalette = &domain.CustomPalette{}
		if err := json.Unmarshal(customPalette, s.CustomPalette); err != nil {
			return s, err
		}
	}
	return s, nil
}

// nullIfEmpty lets COALESCE leave custom_palette untouched when the caller
// didn't set one, since pgx would otherwise bind a non-nil empty []byte.
func nullIfEmpty(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return b
}
