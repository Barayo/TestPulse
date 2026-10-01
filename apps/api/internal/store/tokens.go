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
// (design D3). projectID/roleID are both nil for an unscoped token, or
// both set for one scoped to a project + role (backlog #117, design.md D1
// — validated by the caller, not here; the DB CHECK constraint is the
// last-resort backstop).
func (r *ApiTokenRepo) Create(ctx context.Context, createdBy, name, tokenHash, tokenPrefix string, projectID, roleID *string) (domain.ApiToken, error) {
	var t domain.ApiToken
	err := r.pool.QueryRow(ctx,
		`INSERT INTO api_tokens (created_by, name, token_hash, token_prefix, project_id, role_id)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, created_by, name, token_prefix, project_id, role_id, revoked_at, created_at`,
		createdBy, name, tokenHash, tokenPrefix, projectID, roleID,
	).Scan(&t.ID, &t.CreatedBy, &t.Name, &t.Prefix, &t.ProjectID, &t.RoleID, &t.RevokedAt, &t.CreatedAt)
	return t, err
}

// GetByHash resolves a bearer token to its record for authentication —
// revoked tokens are treated as not found (design D3/authentication spec).
func (r *ApiTokenRepo) GetByHash(ctx context.Context, tokenHash string) (domain.ApiToken, error) {
	var t domain.ApiToken
	err := r.pool.QueryRow(ctx,
		`SELECT id, created_by, name, token_prefix, project_id, role_id, revoked_at, created_at
		 FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL`, tokenHash,
	).Scan(&t.ID, &t.CreatedBy, &t.Name, &t.Prefix, &t.ProjectID, &t.RoleID, &t.RevokedAt, &t.CreatedAt)
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
		`SELECT id, created_by, name, token_prefix, project_id, role_id, revoked_at, created_at
		 FROM api_tokens WHERE created_by = $1 ORDER BY created_at`, createdBy)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tokens := []domain.ApiToken{}
	for rows.Next() {
		var t domain.ApiToken
		if err := rows.Scan(&t.ID, &t.CreatedBy, &t.Name, &t.Prefix, &t.ProjectID, &t.RoleID, &t.RevokedAt, &t.CreatedAt); err != nil {
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
		`SELECT id, created_by, name, token_prefix, project_id, role_id, revoked_at, created_at
		 FROM api_tokens WHERE id = $1`, id,
	).Scan(&t.ID, &t.CreatedBy, &t.Name, &t.Prefix, &t.ProjectID, &t.RoleID, &t.RevokedAt, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ApiToken{}, ErrNotFound
	}
	if err != nil {
		return domain.ApiToken{}, err
	}
	return t, nil
}

// ListAllPage returns every API token across every user, instance-wide
// (add-instance-token-listing) — owner/project/role resolved via LEFT
// JOINs (nullable since project_id/role_id are nil for an unscoped
// token), same (created_at, id) keyset-cursor template as
// UserRepo.ListPage.
func (r *ApiTokenRepo) ListAllPage(ctx context.Context, cursor string, limit int) ([]domain.ApiTokenWithOwner, string, error) {
	limit = clampLimit(limit)
	var cursorCreatedAt any
	var cursorID any
	if cursor != "" {
		createdAt, id, err := decodeCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		cursorCreatedAt, cursorID = createdAt, id
	}
	rows, err := r.pool.Query(ctx,
		`SELECT t.id, u.email, u.display_name, t.name, t.token_prefix, p.key, r.name, t.revoked_at, t.created_at
		 FROM api_tokens t
		 LEFT JOIN users u ON u.id = t.created_by
		 LEFT JOIN projects p ON p.id = t.project_id
		 LEFT JOIN roles r ON r.id = t.role_id
		 WHERE $1::timestamptz IS NULL OR (t.created_at, t.id) > ($1, $2)
		 ORDER BY t.created_at ASC, t.id ASC
		 LIMIT $3`, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	tokens := []domain.ApiTokenWithOwner{}
	for rows.Next() {
		var t domain.ApiTokenWithOwner
		if err := rows.Scan(&t.ID, &t.OwnerEmail, &t.OwnerDisplayName, &t.Name, &t.Prefix, &t.ProjectKey, &t.RoleName, &t.RevokedAt, &t.CreatedAt); err != nil {
			return nil, "", err
		}
		tokens = append(tokens, t)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(tokens) > limit {
		last := tokens[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		tokens = tokens[:limit]
	}
	return tokens, nextCursor, nil
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
