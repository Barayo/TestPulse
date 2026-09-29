package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MCPIdempotencyKeyRepo backs a client-supplied idempotency key on a
// create-style MCP tool call (add-mcp-idempotency-keys design.md D1) — the
// result of a successful call is stored once, keyed by (actorID,
// toolName, idempotencyKey), and replayed verbatim on a retry within the
// TTL instead of re-executing the create.
type MCPIdempotencyKeyRepo struct {
	pool *pgxpool.Pool
}

// Store persists a successful call's result. Only ever called after a
// successful create — a failed attempt is never stored (design.md D2).
func (r *MCPIdempotencyKeyRepo) Store(ctx context.Context, actorID, toolName, idempotencyKey string, result json.RawMessage, expiresAt time.Time) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO mcp_idempotency_keys (actor_id, tool_name, idempotency_key, result_json, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		actorID, toolName, idempotencyKey, result, expiresAt,
	)
	return err
}

// Get returns the stored result only if it has not expired.
func (r *MCPIdempotencyKeyRepo) Get(ctx context.Context, actorID, toolName, idempotencyKey string) (json.RawMessage, error) {
	var result json.RawMessage
	err := r.pool.QueryRow(ctx,
		`SELECT result_json FROM mcp_idempotency_keys
		 WHERE actor_id = $1 AND tool_name = $2 AND idempotency_key = $3 AND expires_at > now()`,
		actorID, toolName, idempotencyKey,
	).Scan(&result)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return result, err
}

// DeleteExpired is run at API startup so the table does not grow
// unbounded, mirroring sessions.go's DeleteExpired.
func (r *MCPIdempotencyKeyRepo) DeleteExpired(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM mcp_idempotency_keys WHERE expires_at < now()`)
	return err
}
