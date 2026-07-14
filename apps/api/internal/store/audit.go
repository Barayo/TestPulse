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
func (r *AuditRepo) Append(ctx context.Context, entry domain.AuditEntry) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO audit_log (actor_kind, actor_id, actor_name, action, entity_type, entity_id)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		entry.ActorKind, entry.ActorID, entry.ActorName, entry.Action, entry.EntityType, entry.EntityID)
	return err
}

func (r *AuditRepo) ListByEntity(ctx context.Context, entityType, entityID string) ([]domain.AuditEntry, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, actor_kind, actor_id, actor_name, action, entity_type, entity_id, occurred_at
		 FROM audit_log WHERE entity_type = $1 AND entity_id = $2 ORDER BY occurred_at`,
		entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := []domain.AuditEntry{}
	for rows.Next() {
		var e domain.AuditEntry
		if err := rows.Scan(&e.ID, &e.ActorKind, &e.ActorID, &e.ActorName, &e.Action, &e.EntityType, &e.EntityID, &e.OccurredAt); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
