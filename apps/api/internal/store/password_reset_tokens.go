package store

import (
	"context"
	"errors"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PasswordResetTokenRepo struct {
	pool *pgxpool.Pool
}

func (r *PasswordResetTokenRepo) Create(ctx context.Context, userID, tokenHash string, expiresAt time.Time) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, tokenHash, expiresAt,
	)
	return err
}

// GetByHash returns the token only if it has not expired and has not
// already been used (design.md — a used token is not a live token).
func (r *PasswordResetTokenRepo) GetByHash(ctx context.Context, tokenHash string) (domain.PasswordResetToken, error) {
	var t domain.PasswordResetToken
	err := r.pool.QueryRow(ctx,
		`SELECT id, user_id, expires_at, used_at, created_at FROM password_reset_tokens
		 WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL`, tokenHash,
	).Scan(&t.ID, &t.UserID, &t.ExpiresAt, &t.UsedAt, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.PasswordResetToken{}, ErrNotFound
	}
	if err != nil {
		return domain.PasswordResetToken{}, err
	}
	return t, nil
}

func (r *PasswordResetTokenRepo) MarkUsed(ctx context.Context, tokenHash string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1`, tokenHash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
