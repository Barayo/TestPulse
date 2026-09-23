package store

import (
	"context"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditRepo struct {
	pool *pgxpool.Pool
}

// Append records one write. actor_name is denormalized at write time so
// history remains readable even after the actor is deleted (design D5).
// entry.Detail is optional structured before/after state (add-version-restore
// design.md), stored as jsonb; nil is stored as SQL NULL, not "null".
func (r *AuditRepo) Append(ctx context.Context, entry domain.AuditEntry) error {
	var detail any
	if entry.Detail != nil {
		detail = entry.Detail
	}
	var projectID any
	if entry.ProjectID != "" {
		projectID = entry.ProjectID
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO audit_log (actor_kind, actor_id, actor_name, action, entity_type, entity_id, project_id, detail)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		entry.ActorKind, entry.ActorID, entry.ActorName, entry.Action, entry.EntityType, entry.EntityID, projectID, detail)
	return err
}

// ListByProject returns a project's most recent audit entries, newest
// first, capped to limit (project-activity-feed) — backs the dashboard
// Activity panel, using the project_id/occurred_at index the owning
// migration adds.
func (r *AuditRepo) ListByProject(ctx context.Context, projectID string, limit int) ([]domain.AuditEntry, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, actor_kind, actor_id, actor_name, action, entity_type, entity_id, project_id, occurred_at, detail
		 FROM audit_log WHERE project_id = $1 ORDER BY occurred_at DESC LIMIT $2`,
		projectID, clampLimit(limit))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []domain.AuditEntry{}
	for rows.Next() {
		var e domain.AuditEntry
		var entryProjectID *string
		if err := rows.Scan(&e.ID, &e.ActorKind, &e.ActorID, &e.ActorName, &e.Action, &e.EntityType, &e.EntityID, &entryProjectID, &e.OccurredAt, &e.Detail); err != nil {
			return nil, err
		}
		if entryProjectID != nil {
			e.ProjectID = *entryProjectID
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

func (r *AuditRepo) ListByEntity(ctx context.Context, entityType, entityID string) ([]domain.AuditEntry, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, actor_kind, actor_id, actor_name, action, entity_type, entity_id, project_id, occurred_at, detail
		 FROM audit_log WHERE entity_type = $1 AND entity_id = $2 ORDER BY occurred_at`,
		entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []domain.AuditEntry{}
	for rows.Next() {
		var e domain.AuditEntry
		var projectID *string
		if err := rows.Scan(&e.ID, &e.ActorKind, &e.ActorID, &e.ActorName, &e.Action, &e.EntityType, &e.EntityID, &projectID, &e.OccurredAt, &e.Detail); err != nil {
			return nil, err
		}
		if projectID != nil {
			e.ProjectID = *projectID
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
