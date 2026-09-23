package store

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type WebhookRepo struct {
	pool *pgxpool.Pool
}

func scanWebhookDestination(row pgx.Row) (domain.WebhookDestination, error) {
	var d domain.WebhookDestination
	err := row.Scan(&d.ID, &d.ProjectID, &d.URL, &d.CreatedAt)
	return d, err
}

// Create inserts a webhook destination. The caller (service layer) is
// responsible for URL validation — the store persists whatever URL it's
// given.
func (r *WebhookRepo) Create(ctx context.Context, projectID, url string) (domain.WebhookDestination, error) {
	row := r.pool.QueryRow(ctx,
		`INSERT INTO webhook_destinations (project_id, url)
		 VALUES ($1, $2)
		 RETURNING id, project_id, url, created_at`,
		projectID, url,
	)
	return scanWebhookDestination(row)
}

// ListByProject returns every configured destination for a project, in
// no particular guaranteed order — every destination receives every
// event, so order doesn't matter for dispatch; oldest-first for display.
func (r *WebhookRepo) ListByProject(ctx context.Context, projectID string) ([]domain.WebhookDestination, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, project_id, url, created_at FROM webhook_destinations
		 WHERE project_id = $1 ORDER BY created_at ASC`,
		projectID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.WebhookDestination
	for rows.Next() {
		d, err := scanWebhookDestination(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (r *WebhookRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM webhook_destinations WHERE id = $1`, id)
	return err
}

// ProjectID resolves a webhook destination's owning project — used by
// requirePermission's per-resource resolver for the delete route, which
// isn't nested under /projects/{projectKey}.
func (r *WebhookRepo) ProjectID(ctx context.Context, id string) (string, error) {
	var projectID string
	err := r.pool.QueryRow(ctx,
		`SELECT project_id FROM webhook_destinations WHERE id = $1`, id,
	).Scan(&projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return projectID, err
}
