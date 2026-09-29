package service

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

// mcpIdempotencyKeyTTL is fixed, not admin-configurable (add-mcp-
// idempotency-keys design.md D4) — long enough to cover a retry after a
// slow timeout or brief outage, short enough the table never meaningfully
// grows.
const mcpIdempotencyKeyTTL = 24 * time.Hour

// IdempotentResult looks up a prior successful result for (actorID,
// toolName, idempotencyKey), returning ok=false if none exists (a fresh
// key, or one that's expired) — the caller should perform the operation
// normally in that case.
func (s *Service) IdempotentResult(ctx context.Context, actorID, toolName, idempotencyKey string) (json.RawMessage, bool, error) {
	result, err := s.store.MCPIdempotencyKeys.Get(ctx, actorID, toolName, idempotencyKey)
	if errors.Is(err, store.ErrNotFound) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return result, true, nil
}

// SaveIdempotentResult persists a successful call's result under
// (actorID, toolName, idempotencyKey), for IdempotentResult to replay on
// a retry. Only ever called after a successful create — a failed attempt
// is never stored (design.md D2), so it stays freely retryable.
func (s *Service) SaveIdempotentResult(ctx context.Context, actorID, toolName, idempotencyKey string, result any) error {
	b, err := json.Marshal(result)
	if err != nil {
		return err
	}
	return s.store.MCPIdempotencyKeys.Store(ctx, actorID, toolName, idempotencyKey, b, time.Now().Add(mcpIdempotencyKeyTTL))
}

// CleanupExpiredIdempotencyKeys is run once at API startup so the table
// does not grow unbounded, mirroring CleanupExpiredSessions exactly
// (design.md D5).
func (s *Service) CleanupExpiredIdempotencyKeys(ctx context.Context) error {
	return s.store.MCPIdempotencyKeys.DeleteExpired(ctx)
}
