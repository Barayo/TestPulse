package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

// sessionLifetime is the sliding session expiry window (design D2).
const sessionLifetime = 30 * 24 * time.Hour

// passwordResetTokenLifetime is how long a forgot-password link stays
// redeemable (add-forgot-password design.md).
const passwordResetTokenLifetime = 30 * time.Minute

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func randomSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// --- Auth ---

// Login returns a generic "invalid email or password" error on any failure
// (unknown email, wrong password, deactivated account) so a caller cannot
// distinguish which is the case.
func (s *Service) Login(ctx context.Context, email, password string) (domain.Session, domain.User, error) {
	if email == "" || password == "" {
		return domain.Session{}, domain.User{}, unauthorized("invalid email or password")
	}
	user, hash, err := s.store.Users.GetByEmailWithHash(ctx, email)
	if errors.Is(err, store.ErrNotFound) {
		return domain.Session{}, domain.User{}, unauthorized("invalid email or password")
	}
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}
	if user.DeactivatedAt != nil {
		return domain.Session{}, domain.User{}, unauthorized("invalid email or password")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return domain.Session{}, domain.User{}, unauthorized("invalid email or password")
	}

	sess, err := s.createSession(ctx, user.ID)
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}
	return sess, user, nil
}

// createSession is Login's session-creation step, factored out so
// SetupFirstAdmin (add-first-run-setup) can log its newly-created account
// in without duplicating it.
func (s *Service) createSession(ctx context.Context, userID string) (domain.Session, error) {
	id, err := randomSecret()
	if err != nil {
		return domain.Session{}, err
	}
	sess, err := s.store.Sessions.Create(ctx, hashToken(id), userID, time.Now().Add(sessionLifetime))
	if err != nil {
		return domain.Session{}, err
	}
	// The store only ever sees/returns the hash (backlog #116) — id is the
	// one place the raw secret is known, so it's set here for the caller
	// to put in the cookie.
	sess.ID = id
	return sess, nil
}

// SetupFirstAdmin creates the instance's very first user, as a Tenant
// Admin, from an email and password chosen directly by whoever submits
// this — never a temporary/generated one — and logs them in immediately
// (add-first-run-setup). Unlike BootstrapAdmin (env-var driven, silent
// no-op if either var is blank), this is the interactive fallback: it
// SHALL fail with a ConflictError, creating nothing, once any user already
// exists — CreateFirstAdmin's advisory lock makes that check-and-insert
// atomic against concurrent callers (two people, or this racing
// BootstrapAdmin at startup). The account is not flagged
// must_change_password: there is nothing temporary about a password its
// own owner just chose, unlike GenerateTemporaryPassword's fallback.
func (s *Service) SetupFirstAdmin(ctx context.Context, email, password string) (domain.Session, domain.User, error) {
	if err := domain.ValidateEmail(email); err != nil {
		return domain.Session{}, domain.User{}, invalid("%s", err)
	}
	if err := domain.ValidatePassword(password); err != nil {
		return domain.Session{}, domain.User{}, invalid("%s", err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}

	user, err := s.store.Users.CreateFirstAdmin(ctx, email, string(hash))
	if errors.Is(err, store.ErrAlreadySetUp) {
		return domain.Session{}, domain.User{}, conflict("this instance has already been set up")
	}
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}

	// Same default-display-name treatment as any other CreateUser call —
	// a real human filled out this form, unlike BootstrapAdmin's
	// env-var-driven fixed "Admin" profile.
	defaultName := domain.DefaultDisplayName(email)
	user, err = s.store.Users.UpdateProfile(ctx, user.ID, domain.UserProfileUpdate{DisplayName: &defaultName})
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}

	sess, err := s.createSession(ctx, user.ID)
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}
	s.audit(ctx, "create", "user", user.ID)
	return sess, user, nil
}

// HasAnyUser reports whether the instance has at least one user account,
// bypassing RBAC entirely — there is no authenticated actor before the
// first one exists. Backs GET /api/v1/meta's setupRequired field and
// SetupFirstAdmin's own guard, mirroring HasAnyProject.
func (s *Service) HasAnyUser(ctx context.Context) (bool, error) {
	users, err := s.store.Users.List(ctx)
	if err != nil {
		return false, err
	}
	return len(users) > 0, nil
}

func (s *Service) Logout(ctx context.Context, sessionID string) error {
	return s.store.Sessions.Delete(ctx, hashToken(sessionID))
}

// CleanupExpiredSessions is run once at API startup so the sessions table
// does not grow unbounded (design.md's session-growth mitigation).
func (s *Service) CleanupExpiredSessions(ctx context.Context) error {
	return s.store.Sessions.DeleteExpired(ctx)
}

// AuthenticateSession resolves a session cookie to its Actor, extending the
// session's sliding expiry on success (design D2). A deactivated user's
// session stops authenticating immediately, without needing to delete the
// session row.
func (s *Service) AuthenticateSession(ctx context.Context, sessionID string) (domain.Actor, error) {
	sess, err := s.store.Sessions.Get(ctx, hashToken(sessionID))
	if errors.Is(err, store.ErrNotFound) {
		return domain.Actor{}, unauthorized("invalid or expired session")
	}
	if err != nil {
		return domain.Actor{}, err
	}
	user, err := s.store.Users.Get(ctx, sess.UserID)
	if err != nil {
		return domain.Actor{}, err
	}
	if user.DeactivatedAt != nil {
		return domain.Actor{}, unauthorized("account deactivated")
	}
	if err := s.store.Sessions.Extend(ctx, hashToken(sessionID), time.Now().Add(sessionLifetime)); err != nil {
		return domain.Actor{}, err
	}
	return domain.Actor{
		ID: user.ID, Kind: domain.ActorKindUser, DisplayName: user.Email,
		EffectiveUserID: user.ID, IsTenantAdmin: user.IsTenantAdmin,
		MustChangePassword: user.MustChangePassword,
	}, nil
}

// AuthenticateToken resolves a bearer token to its own Actor — an agent
// acting at its creator's permission level, never impersonating the human
// who created it, resolved fresh from the creator's *current* state on
// every request rather than a value cached at token-creation time (design
// D1/D3.1, extended by add-project-rbac design.md D4).
func (s *Service) AuthenticateToken(ctx context.Context, rawToken string) (domain.Actor, error) {
	tok, err := s.store.ApiTokens.GetByHash(ctx, hashToken(rawToken))
	if errors.Is(err, store.ErrNotFound) {
		return domain.Actor{}, unauthorized("invalid or revoked token")
	}
	if err != nil {
		return domain.Actor{}, err
	}
	creator, err := s.store.Users.Get(ctx, tok.CreatedBy)
	if err != nil {
		return domain.Actor{}, err
	}
	actor := domain.Actor{
		ID: tok.ID, Kind: domain.ActorKindAgent, DisplayName: tok.Name,
		EffectiveUserID: creator.ID, IsTenantAdmin: creator.IsTenantAdmin,
	}
	if tok.ProjectID != nil {
		// A scoped token's actor must never report IsTenantAdmin=true,
		// even if its creator is one — requirePermission checks that
		// flag first and bypasses everything else, which would silently
		// defeat scoping for exactly the highest-risk case (a leaked
		// Tenant-Admin-minted token) that motivated this feature
		// (backlog #117, design.md D3).
		actor.IsTenantAdmin = false
		role, err := s.store.Roles.Get(ctx, *tok.RoleID)
		if err != nil {
			return domain.Actor{}, err
		}
		// Fresh on every call — AuthenticateToken runs once per request
		// (the authenticate middleware), so this is already "request
		// time," never a value cached across requests. Reflects the
		// creator's *current* access, same staleness guarantee the
		// unscoped-inheritance path already has.
		creatorPerms, err := s.MyPermissions(ctx, domain.Actor{EffectiveUserID: creator.ID, IsTenantAdmin: creator.IsTenantAdmin}, *tok.ProjectID)
		if err != nil {
			return domain.Actor{}, err
		}
		intersected := role.Permissions().Intersect(creatorPerms)
		actor.ScopedProjectID = tok.ProjectID
		actor.ScopedPermissions = &intersected
	}
	return actor, nil
}

// BootstrapAdmin creates the first user, as a Tenant Admin, from
// env-provided credentials if (and only if) the users table is empty —
// never re-seeds an instance that already has users (design.md's bootstrap
// mitigation).
func (s *Service) BootstrapAdmin(ctx context.Context, email, password string) error {
	if email == "" || password == "" {
		return nil
	}
	users, err := s.store.Users.List(ctx)
	if err != nil {
		return err
	}
	if len(users) > 0 {
		return nil
	}
	user, err := s.CreateUser(ctx, email, password, true)
	if err != nil {
		return err
	}
	// A filled-in profile (add-user-profile) so a fresh instance's header
	// shows something other than a generated initial before anyone has
	// touched Settings — same reasoning as pre-seeding the Sample Project.
	displayName := "Admin"
	avatarKey := "grace-hopper"
	timezone := "UTC"
	_, err = s.store.Users.UpdateProfile(ctx, user.ID, domain.UserProfileUpdate{
		DisplayName: &displayName,
		AvatarKey:   &avatarKey,
		Timezone:    &timezone,
	})
	return err
}

// ForgotPassword always succeeds from the caller's perspective — an unknown
// email, a deactivated account, and SMTP not being configured all take the
// same silent no-op path, so the response never leaks account existence,
// deactivation status, or instance configuration (design.md). A new
// request does not invalidate a prior unexpired token; multiple valid
// tokens for the same user may coexist (design.md — redeeming any one of
// them revokes every session either way).
func (s *Service) ForgotPassword(ctx context.Context, email string) error {
	if !s.passwordResetEnabled {
		return nil
	}
	user, _, err := s.store.Users.GetByEmailWithHash(ctx, email)
	if errors.Is(err, store.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if user.DeactivatedAt != nil {
		return nil
	}
	return s.sendPasswordResetEmail(ctx, user)
}

// sendPasswordResetEmail creates a token and sends the reset link — shared
// by the public, enumeration-safe ForgotPassword (which does its own
// lookup/silent-no-op checks before calling this) and the admin-triggered
// SendPasswordResetEmail (which has no enumeration concern: the caller
// already knows the account is real).
func (s *Service) sendPasswordResetEmail(ctx context.Context, user domain.User) error {
	raw, err := randomSecret()
	if err != nil {
		return err
	}
	if err := s.store.PasswordResetTokens.Create(ctx, user.ID, hashToken(raw), time.Now().Add(passwordResetTokenLifetime)); err != nil {
		return err
	}
	link := s.publicURL + "/reset-password?token=" + raw
	body := "Someone requested a password reset for your TestPulse account.\r\n\r\n" +
		"Reset your password: " + link + "\r\n\r\n" +
		"This link expires in 30 minutes. If you didn't request this, you can ignore this email."
	return s.mailer.Send(ctx, user.Email, "Reset your TestPulse password", body)
}

// SendPasswordResetEmail is the admin-triggered variant of ForgotPassword
// (add-change-own-password) — a Tenant Admin sending a known account a
// reset link, rather than an unauthenticated caller supplying an email to
// check. Rejected when the instance has no SMTP configured; the temporary-
// password fallback (GenerateTemporaryPassword) exists for that case.
func (s *Service) SendPasswordResetEmail(ctx context.Context, actor domain.Actor, userID string) error {
	if !actor.IsTenantAdmin {
		return forbidden("only a Tenant Admin can trigger a password reset for another account")
	}
	if !s.passwordResetEnabled {
		return invalid("SMTP is not configured on this instance")
	}
	user, err := s.store.Users.Get(ctx, userID)
	if err != nil {
		return err
	}
	return s.sendPasswordResetEmail(ctx, user)
}

// SetRequirePasswordChange flags (or clears) an account as requiring a new
// password — enforced starting at that account's next login (design.md),
// not retroactively against any session already in progress.
func (s *Service) SetRequirePasswordChange(ctx context.Context, actor domain.Actor, userID string, require bool) error {
	if !actor.IsTenantAdmin {
		return forbidden("only a Tenant Admin can require a password change for another account")
	}
	if err := s.store.Users.SetMustChangePassword(ctx, userID, require); err != nil {
		return err
	}
	s.audit(ctx, "require_password_change", "user", userID)
	return nil
}

// GenerateTemporaryPassword is the SMTP-less fallback (add-change-own-password
// design.md): a Tenant Admin can no longer choose another account's
// password directly, only generate a random one server-side. Forces
// must_change_password in the same action, revokes every session, and
// returns the raw value once — it is never stored or logged in plain text.
func (s *Service) GenerateTemporaryPassword(ctx context.Context, actor domain.Actor, userID string) (string, error) {
	if !actor.IsTenantAdmin {
		return "", forbidden("only a Tenant Admin can generate a temporary password for another account")
	}
	if s.passwordResetEnabled {
		return "", invalid("SMTP is configured on this instance — send a password reset email instead")
	}
	raw, err := generateTemporaryPassword()
	if err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(raw), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	if err := s.store.Users.UpdatePasswordHash(ctx, userID, string(hash)); err != nil {
		return "", err
	}
	if err := s.store.Users.SetMustChangePassword(ctx, userID, true); err != nil {
		return "", err
	}
	if err := s.store.Sessions.DeleteByUser(ctx, userID); err != nil {
		return "", err
	}
	s.audit(ctx, "generate_temporary_password", "user", userID)
	return raw, nil
}

// temporaryPasswordAlphabet excludes visually-ambiguous characters
// (0/O, 1/l/I) — mirrors apps/web/src/lib/generatePassword.ts's alphabet,
// since this value may be relayed out of band and retyped, not always
// pasted.
const temporaryPasswordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"

// generateTemporaryPassword mirrors generatePassword.ts's approach
// server-side: crypto/rand (never math/rand — this stands in for a real
// credential), rejection sampling to avoid the modulo bias a naive
// byte % len(alphabet) would introduce.
func generateTemporaryPassword() (string, error) {
	const length = 20
	max := 256 - (256 % len(temporaryPasswordAlphabet))
	result := make([]byte, 0, length)
	buf := make([]byte, length)
	for len(result) < length {
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		for _, b := range buf {
			if len(result) == length {
				break
			}
			if int(b) < max {
				result = append(result, temporaryPasswordAlphabet[int(b)%len(temporaryPasswordAlphabet)])
			}
		}
	}
	return string(result), nil
}

// ResetPassword redeems a single-use token, sets a new password, and
// revokes every existing session for the account — a session's validity
// is never re-derived from the password hash.
func (s *Service) ResetPassword(ctx context.Context, token, newPassword string) error {
	if err := domain.ValidatePassword(newPassword); err != nil {
		return invalid("%s", err)
	}
	tokenHash := hashToken(token)
	rt, err := s.store.PasswordResetTokens.GetByHash(ctx, tokenHash)
	if errors.Is(err, store.ErrNotFound) {
		return invalid("invalid or expired reset link")
	}
	if err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.store.Users.UpdatePasswordHash(ctx, rt.UserID, string(hash)); err != nil {
		return err
	}
	if err := s.store.PasswordResetTokens.MarkUsed(ctx, tokenHash); err != nil {
		return err
	}
	// This is the account owner setting their own real password (proven by
	// possession of the emailed link), exactly what must_change_password
	// waits for — same reasoning as ChangeOwnPassword clearing it.
	if err := s.store.Users.SetMustChangePassword(ctx, rt.UserID, false); err != nil {
		return err
	}
	if err := s.store.Sessions.DeleteByUser(ctx, rt.UserID); err != nil {
		return err
	}
	s.audit(ctx, "reset_password", "user", rt.UserID)
	return nil
}

// --- Users ---

func (s *Service) CreateUser(ctx context.Context, email, password string, isTenantAdmin bool) (domain.User, error) {
	if err := domain.ValidateEmail(email); err != nil {
		return domain.User{}, invalid("%s", err)
	}
	if err := domain.ValidatePassword(password); err != nil {
		return domain.User{}, invalid("%s", err)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return domain.User{}, err
	}
	user, err := s.store.Users.Create(ctx, email, string(hash), isTenantAdmin)
	if isUniqueViolation(err) {
		return domain.User{}, invalid("email already in use")
	}
	if err != nil {
		return domain.User{}, err
	}
	// A real starting display name rather than permanently NULL until the
	// account visits Profile settings (link-case-version-actor-to-identity
	// design.md) — a default, not locked in; the account can change it later.
	defaultName := domain.DefaultDisplayName(email)
	user, err = s.store.Users.UpdateProfile(ctx, user.ID, domain.UserProfileUpdate{DisplayName: &defaultName})
	if err != nil {
		return domain.User{}, err
	}
	s.audit(ctx, "create", "user", user.ID)
	return user, nil
}

func (s *Service) ListUsers(ctx context.Context) ([]domain.User, error) {
	return s.store.Users.List(ctx)
}

func (s *Service) GetUser(ctx context.Context, id string) (domain.User, error) {
	return s.store.Users.Get(ctx, id)
}

// UpdateOwnProfile applies the self-service profile fields (add-user-profile)
// against the actor's own user row — there is no target-user parameter, so
// this can never edit anyone else's profile.
func (s *Service) UpdateOwnProfile(ctx context.Context, actor domain.Actor, update domain.UserProfileUpdate) (domain.User, error) {
	if actor.Kind != domain.ActorKindUser {
		return domain.User{}, invalid("only a human user has a profile to update")
	}
	if update.AvatarKey != nil && *update.AvatarKey == customAvatarKey {
		return domain.User{}, invalid("%q is a reserved avatar key, set only by uploading a photo", customAvatarKey)
	}
	if update.AvatarKey != nil && *update.AvatarKey != "" && !domain.AvatarPresetKeys[*update.AvatarKey] {
		return domain.User{}, invalid("unknown avatar key %q", *update.AvatarKey)
	}
	user, err := s.store.Users.UpdateProfile(ctx, actor.ID, update)
	if err != nil {
		return domain.User{}, err
	}
	s.audit(ctx, "update_profile", "user", actor.ID)
	return user, nil
}

// UpdateUserEmail changes a target user's email (add-update-user),
// Tenant-Admin-gated at the service layer, matching DeleteUser/DeleteTeam's
// pattern rather than relying on route middleware alone.
func (s *Service) UpdateUserEmail(ctx context.Context, actor domain.Actor, userID, email string) (domain.User, error) {
	if !actor.IsTenantAdmin {
		return domain.User{}, forbidden("only a Tenant Admin can update another user's account")
	}
	if err := domain.ValidateEmail(email); err != nil {
		return domain.User{}, invalid("%s", err)
	}
	user, err := s.store.Users.UpdateEmail(ctx, userID, email)
	if isUniqueViolation(err) {
		return domain.User{}, invalid("email already in use")
	}
	if err != nil {
		return domain.User{}, err
	}
	s.audit(ctx, "update_email", "user", userID)
	return user, nil
}

// ChangeOwnPassword lets an authenticated user change their own password,
// given proof they know the current one — one of three password-setting
// paths, each substituting a different proof: an emailed single-use token
// for ResetPassword, a Tenant Admin generating one server-side for
// GenerateTemporaryPassword, the current password itself here.
// Revokes every session for the account, including the one making the
// request, and clears must_change_password if it was set — this is the
// account owner setting their own real password, exactly what that flag
// exists to wait for.
func (s *Service) ChangeOwnPassword(ctx context.Context, actor domain.Actor, currentPassword, newPassword string) error {
	if actor.Kind != domain.ActorKindUser {
		return invalid("only a human user has a password to change")
	}
	_, hash, err := s.store.Users.GetByIDWithHash(ctx, actor.ID)
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(currentPassword)); err != nil {
		return unauthorized("incorrect current password")
	}
	if err := domain.ValidatePassword(newPassword); err != nil {
		return invalid("%s", err)
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	if err := s.store.Users.UpdatePasswordHash(ctx, actor.ID, string(newHash)); err != nil {
		return err
	}
	if err := s.store.Users.SetMustChangePassword(ctx, actor.ID, false); err != nil {
		return err
	}
	if err := s.store.Sessions.DeleteByUser(ctx, actor.ID); err != nil {
		return err
	}
	s.audit(ctx, "change_password", "user", actor.ID)
	return nil
}

func (s *Service) SetTenantAdmin(ctx context.Context, userID string, isTenantAdmin bool) error {
	if err := s.store.Users.SetTenantAdmin(ctx, userID, isTenantAdmin); err != nil {
		return err
	}
	s.audit(ctx, "update_role", "user", userID)
	return nil
}

func (s *Service) DeactivateUser(ctx context.Context, userID string) error {
	if err := s.store.Users.Deactivate(ctx, userID); err != nil {
		return err
	}
	s.audit(ctx, "deactivate", "user", userID)
	return nil
}

func (s *Service) ReactivateUser(ctx context.Context, userID string) error {
	if err := s.store.Users.Reactivate(ctx, userID); err != nil {
		return err
	}
	s.audit(ctx, "reactivate", "user", userID)
	return nil
}

// DeleteUser permanently removes a user account. It requires the target to
// already be deactivated (design.md D2 — never trust client-side hiding
// alone for anything irreversible) and rejects self-deletion server-side
// (design.md D3), even if the caller is a Tenant Admin.
func (s *Service) DeleteUser(ctx context.Context, actor domain.Actor, userID string) error {
	if actor.EffectiveUserID == userID {
		return forbidden("cannot delete your own account")
	}
	target, err := s.store.Users.Get(ctx, userID)
	if err != nil {
		return err
	}
	if target.DeactivatedAt == nil {
		return invalid("user must be deactivated before it can be deleted")
	}
	if err := s.store.Users.Delete(ctx, userID); err != nil {
		return err
	}
	s.audit(ctx, "delete", "user", userID)
	return nil
}

// UserDeletionPreview summarizes what deleting userID would remove — real
// counts for the delete-confirmation dialog (design.md D5), computed
// server-side rather than a client-side fan-out over every project.
func (s *Service) UserDeletionPreview(ctx context.Context, actor domain.Actor, userID string) (domain.UserDeletionPreview, error) {
	if !actor.IsTenantAdmin {
		return domain.UserDeletionPreview{}, forbidden("only a Tenant Admin can view user deletion preview")
	}
	teamIDs, err := s.store.Teams.TeamIDsForUser(ctx, userID)
	if err != nil {
		return domain.UserDeletionPreview{}, err
	}
	projectCount, err := s.store.ProjectMembers.DirectProjectCountForUser(ctx, userID)
	if err != nil {
		return domain.UserDeletionPreview{}, err
	}
	tokens, err := s.store.ApiTokens.ListByCreator(ctx, userID)
	if err != nil {
		return domain.UserDeletionPreview{}, err
	}
	liveTokens := 0
	for _, tok := range tokens {
		if tok.RevokedAt == nil {
			liveTokens++
		}
	}
	return domain.UserDeletionPreview{
		TeamCount:    len(teamIDs),
		ProjectCount: projectCount,
		TokenCount:   liveTokens,
	}, nil
}

// --- API tokens ---

// CreateToken returns the full token value once — it is hashed before
// storage and never retrievable again after this call returns (design D3).
// projectID/roleID: both nil creates an unscoped token (full inheritance,
// the original/default behavior); both set scopes it to that project +
// role, only accepted if every permission the role grants is already
// granted by the creating actor's own current access on that project
// (backlog #117, design.md D4) — the real enforcement happens on every
// request the token later makes (AuthenticateToken), this is a fail-fast
// creation-time courtesy, not the security boundary itself.
func (s *Service) CreateToken(ctx context.Context, actor domain.Actor, name string, projectID, roleID *string) (string, domain.ApiToken, error) {
	if err := domain.ValidateTokenName(name); err != nil {
		return "", domain.ApiToken{}, invalid("%s", err)
	}
	if (projectID == nil) != (roleID == nil) {
		return "", domain.ApiToken{}, invalid("projectId and roleId must both be set or both omitted")
	}
	if projectID != nil {
		role, err := s.store.Roles.Get(ctx, *roleID)
		if errors.Is(err, store.ErrNotFound) {
			return "", domain.ApiToken{}, invalid("role not found")
		}
		if err != nil {
			return "", domain.ApiToken{}, err
		}
		creatorPerms, err := s.MyPermissions(ctx, actor, *projectID)
		if err != nil {
			return "", domain.ApiToken{}, err
		}
		if !role.Permissions().IsSubsetOf(creatorPerms) {
			return "", domain.ApiToken{}, invalid("cannot scope a token to a role that grants more than your own current access on this project")
		}
	}
	raw, err := randomSecret()
	if err != nil {
		return "", domain.ApiToken{}, err
	}
	full := "tp_" + raw
	prefix := full
	if len(prefix) > 12 {
		prefix = prefix[:12]
	}
	tok, err := s.store.ApiTokens.Create(ctx, actor.ID, name, hashToken(full), prefix, projectID, roleID)
	if err != nil {
		return "", domain.ApiToken{}, err
	}
	s.audit(ctx, "create", "api_token", tok.ID)
	return full, tok, nil
}

func (s *Service) ListOwnTokens(ctx context.Context, actor domain.Actor) ([]domain.ApiToken, error) {
	return s.store.ApiTokens.ListByCreator(ctx, actor.ID)
}

// ListTokensForUser returns a specific user's tokens — restricted to that
// user themselves or a Tenant Admin (design D3.1 / authorization spec).
func (s *Service) ListTokensForUser(ctx context.Context, actor domain.Actor, userID string) ([]domain.ApiToken, error) {
	if actor.ID != userID && !actor.IsTenantAdmin {
		return nil, forbidden("cannot list another user's tokens")
	}
	return s.store.ApiTokens.ListByCreator(ctx, userID)
}

// RevokeToken allows a token's own creator, or a Tenant Admin, to revoke it.
func (s *Service) RevokeToken(ctx context.Context, actor domain.Actor, tokenID string) error {
	tok, err := s.store.ApiTokens.Get(ctx, tokenID)
	if err != nil {
		return err
	}
	if tok.CreatedBy != actor.ID && !actor.IsTenantAdmin {
		return forbidden("cannot revoke another user's token")
	}
	if err := s.store.ApiTokens.Revoke(ctx, tokenID); err != nil {
		return err
	}
	s.audit(ctx, "revoke", "api_token", tokenID)
	return nil
}

// --- Audit ---

// audit records one write against the Actor resolved into ctx by the
// Authenticate middleware (design D1/D6). It is a best-effort side effect:
// until every domain route is authenticated (task 5.2), calls made without
// a resolved Actor simply record nothing rather than failing the request.
// An optional detail map (add-version-restore design.md) carries
// action-specific before/after state, e.g. move: {from, to}; omit it for
// actions that need no extra detail.
func (s *Service) audit(ctx context.Context, action, entityType, entityID string, detail ...map[string]any) {
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return
	}
	var d map[string]any
	if len(detail) > 0 {
		d = detail[0]
	}
	_ = s.store.Audit.Append(ctx, domain.AuditEntry{
		ActorKind:  actor.Kind,
		ActorID:    actor.ID,
		ActorName:  actor.DisplayName,
		Action:     action,
		EntityType: entityType,
		EntityID:   entityID,
		Detail:     d,
	})
}

func (s *Service) AuditHistory(ctx context.Context, entityType, entityID string) ([]domain.AuditEntry, error) {
	return s.store.Audit.ListByEntity(ctx, entityType, entityID)
}
