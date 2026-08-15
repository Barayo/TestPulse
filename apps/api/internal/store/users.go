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
		 RETURNING id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password`,
		email, passwordHash, isTenantAdmin,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword)
	return u, err
}

func (r *UserRepo) Get(ctx context.Context, id string) (domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword)
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
		`SELECT id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password, password_hash
		 FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, "", ErrNotFound
	}
	if err != nil {
		return domain.User{}, "", err
	}
	return u, hash, nil
}

// GetByIDWithHash is GetByEmailWithHash keyed by id — used by
// ChangeOwnPassword (add-change-own-password), where the caller already
// has the actor's own id and looking up by email would depend on
// domain.Actor.DisplayName happening to hold it (true for a session-based
// user actor, not for an agent/token actor).
func (r *UserRepo) GetByIDWithHash(ctx context.Context, id string) (domain.User, string, error) {
	var u domain.User
	var hash string
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password, password_hash
		 FROM users WHERE id = $1`, id,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword, &hash)
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
		`SELECT id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password
		 FROM users ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []domain.User{}
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword); err != nil {
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
		 RETURNING id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password`,
		id, update.DisplayName, update.AvatarKey, update.Timezone,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword)
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
		 RETURNING id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password`,
		id,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, ErrNotFound
	}
	if err != nil {
		return domain.User{}, err
	}
	return u, nil
}

// UpdateEmail changes a user's email (add-update-user) — the unique
// constraint on users.email surfaces a duplicate the same way Create does.
func (r *UserRepo) UpdateEmail(ctx context.Context, id, email string) (domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`UPDATE users SET email = $2 WHERE id = $1
		 RETURNING id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password`,
		id, email,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, ErrNotFound
	}
	if err != nil {
		return domain.User{}, err
	}
	return u, nil
}

// UpdatePasswordHash sets a new bcrypt hash for a user (add-update-user) —
// the caller is responsible for revoking existing sessions afterward
// (SessionRepo.DeleteByUser), since a session's validity is never
// re-derived from the password hash. It does not touch
// must_change_password — callers decide that separately (SetMustChangePassword),
// since the two flows that call this disagree on the outcome: the account
// owner setting their own real password clears it, an admin generating a
// temporary one sets it.
func (r *UserRepo) UpdatePasswordHash(ctx context.Context, id, hash string) error {
	tag, err := r.pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, id, hash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetMustChangePassword flips the required-password-change flag
// (add-change-own-password) — an admin sets it directly (require-at-next-
// login, or as a side effect of generating a temporary password); the
// account owner clears it by setting a real password of their own
// (ChangeOwnPassword, ResetPassword).
func (r *UserRepo) SetMustChangePassword(ctx context.Context, id string, must bool) error {
	tag, err := r.pool.Exec(ctx, `UPDATE users SET must_change_password = $2 WHERE id = $1`, id, must)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
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

// Delete permanently removes the user row. Sessions and API tokens the user
// owns cascade with it (00014_cascade_user_deletion.sql); team/project
// membership and favorites already cascaded before this change.
func (r *UserRepo) Delete(ctx context.Context, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
