package store

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// InstanceSettingsRepo reads and updates the single instance_settings row
// (enable-public-project-access) — a singleton enforced by the table's
// `id boolean primary key check (id)` schema.
type InstanceSettingsRepo struct {
	pool *pgxpool.Pool
}

func (r *InstanceSettingsRepo) Get(ctx context.Context) (domain.InstanceSettings, error) {
	var s domain.InstanceSettings
	err := r.pool.QueryRow(ctx,
		`SELECT public_projects_enabled, updated_at FROM instance_settings WHERE id`,
	).Scan(&s.PublicProjectsEnabled, &s.UpdatedAt)
	return s, err
}

func (r *InstanceSettingsRepo) SetPublicProjectsEnabled(ctx context.Context, enabled bool) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE instance_settings SET public_projects_enabled = $1, updated_at = now() WHERE id`, enabled)
	return err
}
