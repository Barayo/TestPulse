package store

import (
	"context"

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
	err := r.pool.QueryRow(ctx,
		`SELECT public_projects_enabled, run_retention_days, auto_archive_inactive_days, updated_at FROM instance_settings WHERE id`,
	).Scan(&s.PublicProjectsEnabled, &s.RunRetentionDays, &s.AutoArchiveInactiveDays, &s.UpdatedAt)
	return s, err
}

// Update applies only the non-nil fields of upd (design.md D8/D9 of
// add-data-retention — generalizes the previous single-field
// SetPublicProjectsEnabled into a partial update).
func (r *InstanceSettingsRepo) Update(ctx context.Context, upd domain.InstanceSettingsUpdate) (domain.InstanceSettings, error) {
	var s domain.InstanceSettings
	err := r.pool.QueryRow(ctx,
		`UPDATE instance_settings SET
		   public_projects_enabled = COALESCE($1, public_projects_enabled),
		   run_retention_days = COALESCE($2, run_retention_days),
		   auto_archive_inactive_days = COALESCE($3, auto_archive_inactive_days),
		   updated_at = now()
		 WHERE id
		 RETURNING public_projects_enabled, run_retention_days, auto_archive_inactive_days, updated_at`,
		upd.PublicProjectsEnabled, upd.RunRetentionDays, upd.AutoArchiveInactiveDays,
	).Scan(&s.PublicProjectsEnabled, &s.RunRetentionDays, &s.AutoArchiveInactiveDays, &s.UpdatedAt)
	return s, err
}
