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

	id, err := randomSecret()
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}
	sess, err := s.store.Sessions.Create(ctx, hashToken(id), user.ID, time.Now().Add(sessionLifetime))
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}
	// The store only ever sees/returns the hash (backlog #116) — id is the
	// one place the raw secret is known, so it's set here for the caller
	// to put in the cookie.
	sess.ID = id
	return sess, user, nil
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
func (s *Service) UserDeletionPreview(ctx context.Context, userID string) (domain.UserDeletionPreview, error) {
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
func (s *Service) audit(ctx context.Context, action, entityType, entityID string) {
	actor, ok := domain.ActorFromContext(ctx)
	if !ok {
		return
	}
	_ = s.store.Audit.Append(ctx, domain.AuditEntry{
		ActorKind:  actor.Kind,
		ActorID:    actor.ID,
		ActorName:  actor.DisplayName,
		Action:     action,
		EntityType: entityType,
		EntityID:   entityID,
	})
}

func (s *Service) AuditHistory(ctx context.Context, entityType, entityID string) ([]domain.AuditEntry, error) {
	return s.store.Audit.ListByEntity(ctx, entityType, entityID)
}
