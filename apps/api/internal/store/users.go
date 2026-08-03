package store

import (
	"context"
	"errors"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type UserRepo struct {
	pool *pgxpool.Pool
}

func (r *UserRepo) Create(ctx context.Context, email, passwordHash string, isTenantAdmin bool) (domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, is_tenant_admin) VALUES ($1, $2, $3)
		 RETURNING id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at`,
		email, passwordHash, isTenantAdmin,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt)
	return u, err
}

func (r *UserRepo) Get(ctx context.Context, id string) (domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, ErrNotFound
	}
	if err != nil {
		return domain.User{}, err
	}
	return u, nil
}

// GetByEmailWithHash returns the user plus their bcrypt hash — the hash
// never leaves the store/service layer, it exists only to be compared by
// AuthService.Login.
func (r *UserRepo) GetByEmailWithHash(ctx context.Context, email string) (domain.User, string, error) {
	var u domain.User
	var hash string
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, password_hash
		 FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, "", ErrNotFound
	}
	if err != nil {
		return domain.User{}, "", err
	}
	return u, hash, nil
}

func (r *UserRepo) List(ctx context.Context) ([]domain.User, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at
		 FROM users ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []domain.User{}
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// UpdateProfile applies the self-service profile fields (add-user-profile):
// a nil field in update leaves that column unchanged, via COALESCE.
func (r *UserRepo) UpdateProfile(ctx context.Context, id string, update domain.UserProfileUpdate) (domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`UPDATE users SET
		   display_name = COALESCE($2, display_name),
		   avatar_key = COALESCE($3, avatar_key),
		   timezone = COALESCE($4, timezone)
		 WHERE id = $1
		 RETURNING id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at`,
		id, update.DisplayName, update.AvatarKey, update.Timezone,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, ErrNotFound
	}
	if err != nil {
		return domain.User{}, err
	}
	return u, nil
}

// ClearAvatarKey sets avatar_key back to NULL (generated default) —
// UpdateProfile's COALESCE-based update cannot express "set this column to
// NULL" (a nil *string is indistinguishable from "leave unchanged"), so
// removing a custom avatar needs this dedicated, unambiguous call instead
// (add-custom-avatar-upload).
func (r *UserRepo) ClearAvatarKey(ctx context.Context, id string) (domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`UPDATE users SET avatar_key = NULL WHERE id = $1
		 RETURNING id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at`,
		id,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, ErrNotFound
	}
	if err != nil {
		return domain.User{}, err
	}
	return u, nil
}

func (r *UserRepo) SetTenantAdmin(ctx context.Context, id string, isTenantAdmin bool) error {
	tag, err := r.pool.Exec(ctx, `UPDATE users SET is_tenant_admin = $2 WHERE id = $1`, id, isTenantAdmin)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *UserRepo) Deactivate(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE users SET deactivated_at = now() WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *UserRepo) Reactivate(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE users SET deactivated_at = NULL WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
