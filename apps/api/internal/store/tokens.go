package store

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ApiTokenRepo struct {
	pool *pgxpool.Pool
}

// Create stores only the hash and a display prefix — the full token value
// is generated and returned by the service layer once, never persisted
// (design D3).
func (r *ApiTokenRepo) Create(ctx context.Context, createdBy, name, tokenHash, tokenPrefix string) (domain.ApiToken, error) {
	var t domain.ApiToken
	err := r.pool.QueryRow(ctx,
		`INSERT INTO api_tokens (created_by, name, token_hash, token_prefix)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, created_by, name, token_prefix, revoked_at, created_at`,
		createdBy, name, tokenHash, tokenPrefix,
	).Scan(&t.ID, &t.CreatedBy, &t.Name, &t.Prefix, &t.RevokedAt, &t.CreatedAt)
	return t, err
}

// GetByHash resolves a bearer token to its record for authentication —
// revoked tokens are treated as not found (design D3/authentication spec).
func (r *ApiTokenRepo) GetByHash(ctx context.Context, tokenHash string) (domain.ApiToken, error) {
	var t domain.ApiToken
	err := r.pool.QueryRow(ctx,
		`SELECT id, created_by, name, token_prefix, revoked_at, created_at
		 FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL`, tokenHash,
	).Scan(&t.ID, &t.CreatedBy, &t.Name, &t.Prefix, &t.RevokedAt, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ApiToken{}, ErrNotFound
	}
	if err != nil {
		return domain.ApiToken{}, err
	}
	return t, nil
}

func (r *ApiTokenRepo) ListByCreator(ctx context.Context, createdBy string) ([]domain.ApiToken, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, created_by, name, token_prefix, revoked_at, created_at
		 FROM api_tokens WHERE created_by = $1 ORDER BY created_at`, createdBy)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tokens := []domain.ApiToken{}
	for rows.Next() {
		var t domain.ApiToken
		if err := rows.Scan(&t.ID, &t.CreatedBy, &t.Name, &t.Prefix, &t.RevokedAt, &t.CreatedAt); err != nil {
			return nil, err
		}
		tokens = append(tokens, t)
	}
	return tokens, rows.Err()
}

// Get returns a single token record (for ownership checks before revoking).
func (r *ApiTokenRepo) Get(ctx context.Context, id string) (domain.ApiToken, error) {
	var t domain.ApiToken
	err := r.pool.QueryRow(ctx,
		`SELECT id, created_by, name, token_prefix, revoked_at, created_at
		 FROM api_tokens WHERE id = $1`, id,
	).Scan(&t.ID, &t.CreatedBy, &t.Name, &t.Prefix, &t.RevokedAt, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ApiToken{}, ErrNotFound
	}
	if err != nil {
		return domain.ApiToken{}, err
	}
	return t, nil
}

func (r *ApiTokenRepo) Revoke(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE api_tokens SET revoked_at = now() WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
