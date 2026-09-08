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

// ErrAlreadySetUp marks a CreateFirstAdmin call that lost the race — the
// instance already has at least one user by the time its transaction ran.
var ErrAlreadySetUp = errors.New("instance already has a user")

// ErrOIDCSubjectAlreadyLinked marks a LinkOIDCSubject call against an
// account that already has a *different* oidc_subject recorded
// (add-sso-oidc) — linking only ever happens once, the first time a
// pre-existing password account's verified email matches an OIDC login;
// silently rebinding an already-linked account to a new subject would let
// anyone who can obtain a verified-email assertion for that address (from
// the one IdP the instance trusts) hijack it, regardless of who the
// account was originally linked to.
var ErrOIDCSubjectAlreadyLinked = errors.New("account already linked to a different oidc subject")

// firstAdminSetupLockKey is an arbitrary, fixed Postgres advisory-lock key
// (add-first-run-setup) — serializes concurrent CreateFirstAdmin calls
// against each other for the lifetime of one transaction each, so "is the
// instance still empty" and "insert the first user" happen atomically
// instead of racing (two people, or the interactive path racing the
// env-var BootstrapAdmin path, hitting it at the same moment). No schema
// change needed: advisory locks are session/transaction state, not a row.
const firstAdminSetupLockKey = 4271819

// CreateFirstAdmin creates the very first user as a Tenant Admin, but only
// if the users table is still empty by the time this transaction acquires
// the advisory lock — returns ErrAlreadySetUp otherwise, and creates
// nothing.
func (r *UserRepo) CreateFirstAdmin(ctx context.Context, email, passwordHash string) (domain.User, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return domain.User{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, firstAdminSetupLockKey); err != nil {
		return domain.User{}, err
	}

	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&count); err != nil {
		return domain.User{}, err
	}
	if count > 0 {
		return domain.User{}, ErrAlreadySetUp
	}

	var u domain.User
	err = tx.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, is_tenant_admin) VALUES ($1, $2, true)
		 RETURNING id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password`,
		email, passwordHash,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword)
	if err != nil {
		return domain.User{}, err
	}
	return u, tx.Commit(ctx)
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

// CreateSSO JIT-provisions a user with no password, linked to an external
// OIDC identity by subject (add-sso-oidc) — the account can only ever be
// authenticated via OIDC login unless a Tenant Admin later sets a password.
func (r *UserRepo) CreateSSO(ctx context.Context, email, oidcSubject string) (domain.User, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, oidc_subject) VALUES ($1, NULL, $2)
		 RETURNING id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password`,
		email, oidcSubject,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword)
	return u, err
}

// GetByOIDCSubject looks up a user previously linked to an external OIDC
// identity (add-sso-oidc) — this is the first, most stable match a login
// attempt tries, ahead of matching by email.
func (r *UserRepo) GetByOIDCSubject(ctx context.Context, subject string) (domain.User, bool, error) {
	var u domain.User
	err := r.pool.QueryRow(ctx,
		`SELECT id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password
		 FROM users WHERE oidc_subject = $1`, subject,
	).Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, false, nil
	}
	if err != nil {
		return domain.User{}, false, err
	}
	return u, true, nil
}

// LinkOIDCSubject backfills oidc_subject onto an existing account
// (add-sso-oidc) — used the first time a pre-existing, password-based
// account's verified email matches an OIDC login, so subsequent logins
// match by subject even if the email later changes at the IdP. Only
// succeeds while oidc_subject is still unset: an account already linked to
// a subject never gets silently rebound to a different one (see
// ErrOIDCSubjectAlreadyLinked).
func (r *UserRepo) LinkOIDCSubject(ctx context.Context, id, subject string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET oidc_subject = $2 WHERE id = $1 AND oidc_subject IS NULL`, id, subject)
	if err != nil {
		return err
	}
	if tag.RowsAffected() > 0 {
		return nil
	}
	var exists bool
	if err := r.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)`, id).Scan(&exists); err != nil {
		return err
	}
	if exists {
		return ErrOIDCSubjectAlreadyLinked
	}
	return ErrNotFound
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
// AuthService.Login. An SSO-only account (add-sso-oidc) has no password
// hash; this returns "" for it rather than erroring, since
// bcrypt.CompareHashAndPassword already fails closed against an empty hash.
func (r *UserRepo) GetByEmailWithHash(ctx context.Context, email string) (domain.User, string, error) {
	var u domain.User
	var hash *string
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
	if hash == nil {
		return u, "", nil
	}
	return u, *hash, nil
}

// GetByIDWithHash is GetByEmailWithHash keyed by id — used by
// ChangeOwnPassword (add-change-own-password), where the caller already
// has the actor's own id and looking up by email would depend on
// domain.Actor.DisplayName happening to hold it (true for a session-based
// user actor, not for an agent/token actor).
func (r *UserRepo) GetByIDWithHash(ctx context.Context, id string) (domain.User, string, error) {
	var u domain.User
	var hash *string
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
	if hash == nil {
		return u, "", nil
	}
	return u, *hash, nil
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

// ListPage is List, cursor-paginated (add-cursor-pagination). Preserves
// List's existing created_at ASC (insertion) order, with id ASC as the
// deterministic tiebreak.
func (r *UserRepo) ListPage(ctx context.Context, cursor string, limit int) ([]domain.User, string, error) {
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
		`SELECT id, email, is_tenant_admin, display_name, avatar_key, timezone, deactivated_at, created_at, must_change_password
		 FROM users
		 WHERE $1::timestamptz IS NULL OR (created_at, id) > ($1, $2)
		 ORDER BY created_at ASC, id ASC
		 LIMIT $3`, cursorCreatedAt, cursorID, limit+1)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	users := []domain.User{}
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Email, &u.IsTenantAdmin, &u.DisplayName, &u.AvatarKey, &u.Timezone, &u.DeactivatedAt, &u.CreatedAt, &u.MustChangePassword); err != nil {
			return nil, "", err
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}

	nextCursor := ""
	if len(users) > limit {
		last := users[limit-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
		users = users[:limit]
	}
	return users, nextCursor, nil
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
