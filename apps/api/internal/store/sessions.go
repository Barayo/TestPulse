package store

import (
	"context"
	"errors"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SessionRepo struct {
	pool *pgxpool.Pool
}

// Create persists a session under the given hash — sessionHash is a
// SHA-256 hash of the session secret, computed by the service layer
// (hashToken), never the raw secret itself (backlog #116, mirrors
// api_tokens.token_hash). The returned Session's ID is left empty: the
// store never hands a raw secret back out, so the caller (which already
// holds the raw value it hashed) must set it itself if needed for a
// cookie.
func (r *SessionRepo) Create(ctx context.Context, sessionHash, userID string, expiresAt time.Time) (domain.Session, error) {
	var s domain.Session
	err := r.pool.QueryRow(ctx,
		`INSERT INTO sessions (session_hash, user_id, expires_at) VALUES ($1, $2, $3)
		 RETURNING user_id, created_at, expires_at`,
		sessionHash, userID, expiresAt,
	).Scan(&s.UserID, &s.CreatedAt, &s.ExpiresAt)
	return s, err
}

// Get returns the session only if it has not expired (design D2/D6).
// sessionHash: see Create.
func (r *SessionRepo) Get(ctx context.Context, sessionHash string) (domain.Session, error) {
	var s domain.Session
	err := r.pool.QueryRow(ctx,
		`SELECT user_id, created_at, expires_at FROM sessions
		 WHERE session_hash = $1 AND expires_at > now()`, sessionHash,
	).Scan(&s.UserID, &s.CreatedAt, &s.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Session{}, ErrNotFound
	}
	if err != nil {
		return domain.Session{}, err
	}
	return s, nil
}

// Extend pushes a session's expiry forward — the sliding-window renewal
// applied on every successful authenticated request (design D2).
// sessionHash: see Create.
func (r *SessionRepo) Extend(ctx context.Context, sessionHash string, newExpiresAt time.Time) error {
	tag, err := r.pool.Exec(ctx, `UPDATE sessions SET expires_at = $2 WHERE session_hash = $1`, sessionHash, newExpiresAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete: sessionHash, see Create.
func (r *SessionRepo) Delete(ctx context.Context, sessionHash string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE session_hash = $1`, sessionHash)
	return err
}

// DeleteExpired is run at API startup so the sessions table does not grow
// unbounded (design.md's mitigation for the session-growth risk).
func (r *SessionRepo) DeleteExpired(ctx context.Context) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at < now()`)
	return err
}

// CountAll exists for tests verifying DeleteExpired's cleanup behavior.
func (r *SessionRepo) CountAll(ctx context.Context) (int, error) {
	var n int
	err := r.pool.QueryRow(ctx, `SELECT count(*) FROM sessions`).Scan(&n)
	return n, err
}
