package service_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func testService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "identity_service")))
}

func mustCreateUser(t *testing.T, s *service.Service, email, password string, isTenantAdmin bool) domain.User {
	t.Helper()
	u, err := s.CreateUser(context.Background(), email, password, isTenantAdmin)
	if err != nil {
		t.Fatalf("CreateUser(%s): %v", email, err)
	}
	return u
}

func actorFor(u domain.User) domain.Actor {
	return domain.Actor{ID: u.ID, Kind: domain.ActorKindUser, DisplayName: u.Email, EffectiveUserID: u.ID, IsTenantAdmin: u.IsTenantAdmin}
}

// --- Login / sessions (authentication spec scenarios) ---

func TestLoginSuccessCreatesSession(t *testing.T) {
	s := testService(t)
	mustCreateUser(t, s, "a@example.com", "correcthorse", false)

	sess, user, err := s.Login(context.Background(), "a@example.com", "correcthorse")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if sess.UserID != user.ID || sess.ID == "" {
		t.Errorf("session = %+v, user = %+v", sess, user)
	}
}

// Sessions must be hashed at rest, exactly like api_tokens.token_hash
// already is (backlog #116) — the raw secret (what's in the cookie) must
// never be the value a database read could hand back. Proven by showing a
// lookup using the raw cookie value directly against the store, bypassing
// the service layer's hashing, finds nothing: if the raw secret were
// stored as-is, this same lookup would succeed.
func TestSessionIDIsHashedAtRest(t *testing.T) {
	pool := testutil.Pool(t, "identity_session_hash")
	st := store.New(pool)
	s := service.New(st)
	mustCreateUser(t, s, "a@example.com", "correcthorse", false)

	sess, _, err := s.Login(context.Background(), "a@example.com", "correcthorse")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	if _, err := st.Sessions.Get(context.Background(), sess.ID); err != store.ErrNotFound {
		t.Errorf("raw session id was directly usable as a store lookup key (err = %v) — it must be stored hashed, not in plaintext", err)
	}
}

func TestLoginWrongPasswordRejected(t *testing.T) {
	s := testService(t)
	mustCreateUser(t, s, "a@example.com", "correcthorse", false)

	_, _, err := s.Login(context.Background(), "a@example.com", "wrongpassword")
	var uerr *service.UnauthorizedError
	if err == nil {
		t.Fatal("expected error for wrong password")
	}
	if !asUnauthorized(err, &uerr) {
		t.Errorf("err = %v, want UnauthorizedError", err)
	}
}

func TestLoginUnknownEmailRejected(t *testing.T) {
	s := testService(t)
	_, _, err := s.Login(context.Background(), "nobody@example.com", "whatever1")
	var uerr *service.UnauthorizedError
	if !asUnauthorized(err, &uerr) {
		t.Errorf("err = %v, want UnauthorizedError", err)
	}
}

func TestLoginDeactivatedUserRejected(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "a@example.com", "correcthorse", false)
	if err := s.DeactivateUser(context.Background(), u.ID); err != nil {
		t.Fatal(err)
	}
	_, _, err := s.Login(context.Background(), "a@example.com", "correcthorse")
	var uerr *service.UnauthorizedError
	if !asUnauthorized(err, &uerr) {
		t.Errorf("err = %v, want UnauthorizedError", err)
	}
}

func TestReactivatedUserCanLoginAgain(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "a@example.com", "correcthorse", false)
	if err := s.DeactivateUser(context.Background(), u.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.ReactivateUser(context.Background(), u.ID); err != nil {
		t.Fatalf("ReactivateUser: %v", err)
	}

	_, _, err := s.Login(context.Background(), "a@example.com", "correcthorse")
	if err != nil {
		t.Fatalf("Login after reactivation: %v", err)
	}
}

// --- User deletion (add-user-deletion) ---

func TestDeleteUserRejectedWhileStillActive(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	target := mustCreateUser(t, s, "active@example.com", "correcthorse", false)

	err := s.DeleteUser(context.Background(), actorFor(admin), target.ID)
	if err == nil {
		t.Fatal("expected deleting an active (non-deactivated) user to be rejected")
	}
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("err = %v (%T), want a ValidationError (400)", err, err)
	}

	if _, getErr := s.GetUser(context.Background(), target.ID); getErr != nil {
		t.Errorf("target user should still exist after a rejected delete, GetUser err = %v", getErr)
	}
}

func TestDeleteUserRejectsSelfDeletionEvenIfDeactivated(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "self@example.com", "correcthorse", true)
	ctx := context.Background()
	if err := s.DeactivateUser(ctx, admin.ID); err != nil {
		t.Fatalf("DeactivateUser: %v", err)
	}

	err := s.DeleteUser(ctx, actorFor(admin), admin.ID)
	if err == nil {
		t.Fatal("expected self-deletion to be rejected even when deactivated")
	}
	var ferr *service.ForbiddenError
	if !asForbidden(err, &ferr) {
		t.Errorf("err = %v (%T), want ForbiddenError", err, err)
	}
}

func TestDeleteUserRemovesDeactivatedUserAndCascades(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	admin := mustCreateUser(t, s, "admin2@example.com", "correcthorse", true)
	target := mustCreateUser(t, s, "gone@example.com", "correcthorse", false)

	team, err := s.CreateTeam(ctx, actorFor(admin), "Deletable Team")
	if err != nil {
		t.Fatalf("CreateTeam: %v", err)
	}
	if _, err := s.AddTeamMember(ctx, actorFor(admin), team.ID, target.ID); err != nil {
		t.Fatalf("AddTeamMember: %v", err)
	}
	if _, _, err := s.CreateToken(ctx, actorFor(target), "target-token", nil, nil); err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	if _, _, err := s.Login(ctx, "gone@example.com", "correcthorse"); err != nil {
		t.Fatalf("Login: %v", err)
	}

	if err := s.DeactivateUser(ctx, target.ID); err != nil {
		t.Fatalf("DeactivateUser: %v", err)
	}
	if err := s.DeleteUser(ctx, actorFor(admin), target.ID); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}

	if _, err := s.GetUser(ctx, target.ID); err == nil {
		t.Error("expected the deleted user to no longer be found")
	}
	tokens, err := s.ListTokensForUser(ctx, actorFor(admin), target.ID)
	if err != nil {
		t.Fatalf("ListTokensForUser: %v", err)
	}
	if len(tokens) != 0 {
		t.Errorf("tokens after user delete = %v, want none (cascade)", tokens)
	}
}

// TestUserDeletionPreviewCountsTeamsProjectsAndLiveTokens covers
// add-user-deletion task 4.2 — the confirmation dialog's real-counts
// requirement (design.md D5).
func TestUserDeletionPreviewCountsTeamsProjectsAndLiveTokens(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	admin := mustCreateUser(t, s, "admin3@example.com", "correcthorse", true)
	target := mustCreateUser(t, s, "preview@example.com", "correcthorse", false)

	empty, err := s.UserDeletionPreview(ctx, target.ID)
	if err != nil {
		t.Fatalf("UserDeletionPreview (empty): %v", err)
	}
	if empty.TeamCount != 0 || empty.ProjectCount != 0 || empty.TokenCount != 0 {
		t.Errorf("empty preview = %+v, want all zero", empty)
	}

	team, err := s.CreateTeam(ctx, actorFor(admin), "Preview Team")
	if err != nil {
		t.Fatalf("CreateTeam: %v", err)
	}
	if _, err := s.AddTeamMember(ctx, actorFor(admin), team.ID, target.ID); err != nil {
		t.Fatalf("AddTeamMember: %v", err)
	}
	if _, _, err := s.CreateToken(ctx, actorFor(target), "live-token", nil, nil); err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	_, revoked, err := s.CreateToken(ctx, actorFor(target), "revoked-token", nil, nil)
	if err != nil {
		t.Fatalf("CreateToken (to revoke): %v", err)
	}
	if err := s.RevokeToken(ctx, actorFor(target), revoked.ID); err != nil {
		t.Fatalf("RevokeToken: %v", err)
	}

	preview, err := s.UserDeletionPreview(ctx, target.ID)
	if err != nil {
		t.Fatalf("UserDeletionPreview: %v", err)
	}
	if preview.TeamCount != 1 {
		t.Errorf("TeamCount = %d, want 1", preview.TeamCount)
	}
	if preview.TokenCount != 1 {
		t.Errorf("TokenCount = %d, want 1 (revoked token excluded)", preview.TokenCount)
	}
}

func TestLogoutInvalidatesSession(t *testing.T) {
	s := testService(t)
	mustCreateUser(t, s, "a@example.com", "correcthorse", false)
	sess, _, err := s.Login(context.Background(), "a@example.com", "correcthorse")
	if err != nil {
		t.Fatal(err)
	}

	if err := s.Logout(context.Background(), sess.ID); err != nil {
		t.Fatalf("Logout: %v", err)
	}
	if _, err := s.AuthenticateSession(context.Background(), sess.ID); err == nil {
		t.Error("session still authenticates after logout")
	}
}

func TestAuthenticateSessionResolvesActorAndExtendsExpiry(t *testing.T) {
	s := testService(t)
	mustCreateUser(t, s, "a@example.com", "correcthorse", true)
	sess, user, err := s.Login(context.Background(), "a@example.com", "correcthorse")
	if err != nil {
		t.Fatal(err)
	}

	actor, err := s.AuthenticateSession(context.Background(), sess.ID)
	if err != nil {
		t.Fatalf("AuthenticateSession: %v", err)
	}
	if actor.ID != user.ID || actor.Kind != domain.ActorKindUser || !actor.IsTenantAdmin || actor.EffectiveUserID != user.ID {
		t.Errorf("actor = %+v", actor)
	}
}

func TestAuthenticateSessionRejectsUnknownSession(t *testing.T) {
	s := testService(t)
	if _, err := s.AuthenticateSession(context.Background(), "does-not-exist"); err == nil {
		t.Error("unknown session authenticated, want error")
	}
}

// --- Tokens (authentication + authorization spec scenarios) ---

func TestCreateAndAuthenticateToken(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "agent-owner@example.com", "correcthorse", false)
	ownerActor := actorFor(u)

	full, tok, err := s.CreateToken(context.Background(), ownerActor, "ci-agent", nil, nil)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	if full == "" || tok.Prefix == "" {
		t.Errorf("token = %+v, full = %q", tok, full)
	}

	actor, err := s.AuthenticateToken(context.Background(), full)
	if err != nil {
		t.Fatalf("AuthenticateToken: %v", err)
	}
	if actor.Kind != domain.ActorKindAgent || actor.ID != tok.ID || actor.EffectiveUserID != u.ID || actor.IsTenantAdmin {
		t.Errorf("actor = %+v, want agent acting at creator's (non-admin) permission level", actor)
	}
	if actor.ScopedProjectID != nil || actor.ScopedPermissions != nil {
		t.Errorf("unscoped token actor = %+v, want nil ScopedProjectID/ScopedPermissions", actor)
	}
}

// backlog #117 (design.md D3): AuthenticateToken resolves a scoped
// token's ScopedPermissions as the intersection of its role's flags and
// its creator's current access — computed fresh every call (this IS
// "request time": authenticate middleware calls it on every request, no
// caching across calls), never a stale snapshot.
func TestAuthenticateScopedToken(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "scoped-auth-owner@example.com", "correcthorse", false)
	actorU := actorFor(u)
	ctx := context.Background()

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Scoped Auth Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	admin := actorFor(mustCreateUser(t, s, "admin-scoped-auth@example.com", "correcthorse", true))
	// Creator has read+caseEdit+caseDelete; the role only grants read+caseEdit
	// — the intersection must be read+caseEdit, not the broader creator set.
	creatorRole, err := s.CreateRole(ctx, admin, domain.Role{Name: "Creator Role (scoped auth)", CanRead: true, CanCaseEdit: true, CanCaseDelete: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := s.SetProjectMember(ctx, admin, project.ID, u.ID, creatorRole.ID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}
	tokenRole, err := s.CreateRole(ctx, admin, domain.Role{Name: "Token Role (scoped auth)", CanRead: true, CanCaseEdit: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}

	full, _, err := s.CreateToken(ctx, actorU, "scoped-auth-agent", &project.ID, &tokenRole.ID)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}

	actor, err := s.AuthenticateToken(ctx, full)
	if err != nil {
		t.Fatalf("AuthenticateToken: %v", err)
	}
	if actor.ScopedProjectID == nil || *actor.ScopedProjectID != project.ID {
		t.Fatalf("ScopedProjectID = %v, want %q", actor.ScopedProjectID, project.ID)
	}
	if actor.ScopedPermissions == nil || !actor.ScopedPermissions.Read || !actor.ScopedPermissions.CaseEdit {
		t.Errorf("ScopedPermissions = %+v, want read+caseEdit", actor.ScopedPermissions)
	}
	if actor.ScopedPermissions.CaseDelete {
		t.Error("ScopedPermissions grants caseDelete — the role never granted it, only the creator's broader access did")
	}
}

// The single most important invariant this whole feature exists for: a
// scoped token created by a Tenant Admin must NOT bypass scoping via the
// existing IsTenantAdmin shortcut requirePermission checks first — that
// would silently defeat the entire feature for exactly the highest-risk
// case (a leaked Tenant-Admin-minted token) that motivated it.
func TestScopedTokenFromTenantAdminIsNotTenantAdmin(t *testing.T) {
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "scoping-admin-auth@example.com", "correcthorse", true))
	ctx := context.Background()

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Admin Scoped Auth Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	role, err := s.CreateRole(ctx, admin, domain.Role{Name: "Read Only (admin scoped auth)", CanRead: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}

	full, _, err := s.CreateToken(ctx, admin, "admin-scoped-auth-agent", &project.ID, &role.ID)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}

	actor, err := s.AuthenticateToken(ctx, full)
	if err != nil {
		t.Fatalf("AuthenticateToken: %v", err)
	}
	if actor.IsTenantAdmin {
		t.Fatal("a scoped token's actor must never report IsTenantAdmin=true, even if its creator is one — this would bypass all scoping via requirePermission's admin shortcut")
	}
	if actor.ScopedPermissions == nil || actor.ScopedPermissions.ManageProject {
		t.Errorf("ScopedPermissions = %+v, want manageProject false (the role never granted it)", actor.ScopedPermissions)
	}
}

// backlog #117 (design.md D3): a scoped token's permissions must reflect
// the creator's *current* state, not a snapshot taken at token-creation
// time — the same staleness guarantee TestTokenReflectsCreatorsCurrentState
// already proves for unscoped tokens, applied here to the scoped case.
func TestScopedTokenNarrowsIfCreatorAccessNarrows(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "narrowing-creator@example.com", "correcthorse", false)
	actorU := actorFor(u)
	ctx := context.Background()

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Narrowing Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	admin := actorFor(mustCreateUser(t, s, "admin-narrowing@example.com", "correcthorse", true))
	broadRole, err := s.CreateRole(ctx, admin, domain.Role{Name: "Broad Role (narrowing)", CanRead: true, CanCaseEdit: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := s.SetProjectMember(ctx, admin, project.ID, u.ID, broadRole.ID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}
	// Token scoped to the same broad role — matches the creator's access
	// exactly at creation time.
	full, _, err := s.CreateToken(ctx, actorU, "narrowing-agent", &project.ID, &broadRole.ID)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}

	actorBefore, err := s.AuthenticateToken(ctx, full)
	if err != nil {
		t.Fatalf("AuthenticateToken (before): %v", err)
	}
	if !actorBefore.ScopedPermissions.CaseEdit {
		t.Fatalf("ScopedPermissions (before) = %+v, want caseEdit true", actorBefore.ScopedPermissions)
	}

	// The creator's own role on the project is downgraded to read-only —
	// after this, the token (still nominally scoped to broadRole, which
	// itself hasn't changed) must lose caseEdit too, because the
	// intersection is computed fresh against the creator's *current* access.
	narrowRole, err := s.CreateRole(ctx, admin, domain.Role{Name: "Narrow Role (narrowing)", CanRead: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := s.SetProjectMember(ctx, admin, project.ID, u.ID, narrowRole.ID); err != nil {
		t.Fatalf("SetProjectMember (downgrade): %v", err)
	}

	actorAfter, err := s.AuthenticateToken(ctx, full)
	if err != nil {
		t.Fatalf("AuthenticateToken (after): %v", err)
	}
	if actorAfter.ScopedPermissions.CaseEdit {
		t.Error("token still grants caseEdit after the creator's own access was downgraded — scoping did not reflect current state")
	}
	if !actorAfter.ScopedPermissions.Read {
		t.Error("token should still grant read — neither the role nor the creator's downgraded access lost it")
	}
}

// backlog #117 (design.md D4): a token MAY be created scoped to a project
// + role, but only if the creator currently holds every permission that
// role grants — never more power than the creator's own current access.
func TestCreateTokenScopedToProjectAndRole(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "scoped-owner@example.com", "correcthorse", false)
	actor := actorFor(u)
	ctx := context.Background()

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Scoped Token Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	admin := actorFor(mustCreateUser(t, s, "admin-for-scoped@example.com", "correcthorse", true))
	role, err := s.CreateRole(ctx, admin, domain.Role{Name: "Scoped Token Role", CanRead: true, CanCaseEdit: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	if err := s.SetProjectMember(ctx, admin, project.ID, u.ID, role.ID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}

	full, tok, err := s.CreateToken(ctx, actor, "scoped-agent", &project.ID, &role.ID)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	if tok.ProjectID == nil || *tok.ProjectID != project.ID || tok.RoleID == nil || *tok.RoleID != role.ID {
		t.Errorf("token = %+v, want scoped to project %q role %q", tok, project.ID, role.ID)
	}
	if full == "" {
		t.Error("expected a full token value")
	}
}

func TestCreateTokenScopeRejectedWhenExceedsCreatorAccess(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "underpowered@example.com", "correcthorse", false)
	actor := actorFor(u)
	ctx := context.Background()

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Underpowered Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	admin := actorFor(mustCreateUser(t, s, "admin-for-underpowered@example.com", "correcthorse", true))
	readOnly, err := s.CreateRole(ctx, admin, domain.Role{Name: "Read Only (underpowered test)", CanRead: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	broader, err := s.CreateRole(ctx, admin, domain.Role{Name: "Broader Role", CanRead: true, CanCaseDelete: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}
	// The creator only has read — not caseDelete, which broader grants.
	if err := s.SetProjectMember(ctx, admin, project.ID, u.ID, readOnly.ID); err != nil {
		t.Fatalf("SetProjectMember: %v", err)
	}

	_, _, err = s.CreateToken(ctx, actor, "over-scoped-agent", &project.ID, &broader.ID)
	if err == nil {
		t.Fatal("expected scoping to a more powerful role than the creator holds to be rejected")
	}
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("err = %v (%T), want a ValidationError (400)", err, err)
	}
}

func TestCreateTokenUnscopedUnaffectedByScopeValidation(t *testing.T) {
	// No projectID/roleID at all — must behave exactly as before this
	// change, regardless of what projects/roles exist or don't.
	s := testService(t)
	u := mustCreateUser(t, s, "still-unscoped@example.com", "correcthorse", false)

	full, tok, err := s.CreateToken(context.Background(), actorFor(u), "unscoped-agent", nil, nil)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	if tok.ProjectID != nil || tok.RoleID != nil {
		t.Errorf("token = %+v, want unscoped", tok)
	}
	if full == "" {
		t.Error("expected a full token value")
	}
}

func TestCreateTokenAsTenantAdminCanScopeAnyProjectAndRole(t *testing.T) {
	// A Tenant Admin's "current access" is universal (existing bypass) —
	// they can scope a token to any project/role without first being an
	// explicit member of that project.
	s := testService(t)
	admin := actorFor(mustCreateUser(t, s, "scoping-admin@example.com", "correcthorse", true))
	ctx := context.Background()

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Admin Scoped Project"})
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	role, err := s.CreateRole(ctx, admin, domain.Role{Name: "Admin Scoped Role", CanRead: true, CanManageProject: true})
	if err != nil {
		t.Fatalf("CreateRole: %v", err)
	}

	_, tok, err := s.CreateToken(ctx, admin, "admin-scoped-agent", &project.ID, &role.ID)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	if tok.ProjectID == nil || *tok.ProjectID != project.ID {
		t.Errorf("token = %+v, want scoped to project %q", tok, project.ID)
	}
}

// TestTokenReflectsCreatorsCurrentState covers design.md D4: an agent's
// permission level is resolved fresh from the creator's current state, not
// cached at token-creation time.
func TestTokenReflectsCreatorsCurrentState(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "creator@example.com", "correcthorse", false)
	full, _, err := s.CreateToken(context.Background(), actorFor(u), "ci-agent", nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	if err := s.SetTenantAdmin(context.Background(), u.ID, true); err != nil {
		t.Fatal(err)
	}

	actor, err := s.AuthenticateToken(context.Background(), full)
	if err != nil {
		t.Fatalf("AuthenticateToken: %v", err)
	}
	if !actor.IsTenantAdmin {
		t.Error("token did not reflect creator's promotion to Tenant Admin")
	}
}

func TestRevokedTokenNoLongerAuthenticates(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "owner@example.com", "correcthorse", false)
	actor := actorFor(u)
	full, tok, err := s.CreateToken(context.Background(), actor, "ci-agent", nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	if err := s.RevokeToken(context.Background(), actor, tok.ID); err != nil {
		t.Fatalf("RevokeToken: %v", err)
	}
	if _, err := s.AuthenticateToken(context.Background(), full); err == nil {
		t.Error("revoked token still authenticates")
	}
}

func TestNonOwnerCannotRevokeAnothersToken(t *testing.T) {
	s := testService(t)
	owner := mustCreateUser(t, s, "owner@example.com", "correcthorse", false)
	other := mustCreateUser(t, s, "other@example.com", "correcthorse", false)
	ownerActor := actorFor(owner)
	otherActor := actorFor(other)

	_, tok, err := s.CreateToken(context.Background(), ownerActor, "ci-agent", nil, nil)
	if err != nil {
		t.Fatal(err)
	}

	err = s.RevokeToken(context.Background(), otherActor, tok.ID)
	var ferr *service.ForbiddenError
	if !asForbidden(err, &ferr) {
		t.Errorf("err = %v, want ForbiddenError", err)
	}
}

func TestAdminCanRevokeAnyonesToken(t *testing.T) {
	s := testService(t)
	owner := mustCreateUser(t, s, "owner@example.com", "correcthorse", false)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ownerActor := actorFor(owner)
	adminActor := actorFor(admin)

	_, tok, err := s.CreateToken(context.Background(), ownerActor, "ci-agent", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.RevokeToken(context.Background(), adminActor, tok.ID); err != nil {
		t.Errorf("admin revoke failed: %v", err)
	}
}

func TestNonAdminCannotListAnothersTokens(t *testing.T) {
	s := testService(t)
	owner := mustCreateUser(t, s, "owner@example.com", "correcthorse", false)
	other := mustCreateUser(t, s, "other@example.com", "correcthorse", false)
	otherActor := actorFor(other)

	_, err := s.ListTokensForUser(context.Background(), otherActor, owner.ID)
	var ferr *service.ForbiddenError
	if !asForbidden(err, &ferr) {
		t.Errorf("err = %v, want ForbiddenError", err)
	}
}

// --- Audit wiring (task 3.4) ---

func TestCreateUserRecordsAuditEntryWhenActorPresent(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	created, err := s.CreateUser(ctx, "new@example.com", "correcthorse", false)
	if err != nil {
		t.Fatal(err)
	}

	history, err := s.AuditHistory(context.Background(), "user", created.ID)
	if err != nil || len(history) != 1 {
		t.Fatalf("AuditHistory = %d, %v; want 1", len(history), err)
	}
	if history[0].ActorID != admin.ID || history[0].Action != "create" {
		t.Errorf("entry = %+v", history[0])
	}
}

func TestCreateUserDefaultsDisplayNameFromEmail(t *testing.T) {
	s := testService(t)
	created := mustCreateUser(t, s, "jane.doe@example.com", "correcthorse", false)
	if created.DisplayName == nil || *created.DisplayName != "Jane Doe" {
		t.Errorf("DisplayName = %v, want \"Jane Doe\"", created.DisplayName)
	}
}

// --- Bootstrap admin ---

func TestBootstrapAdminSeedsOnEmptyTable(t *testing.T) {
	s := testService(t)
	if err := s.BootstrapAdmin(context.Background(), "admin@example.com", "correcthorse"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	users, _ := s.ListUsers(context.Background())
	if len(users) != 1 || !users[0].IsTenantAdmin {
		t.Errorf("users = %+v, want one Tenant Admin", users)
	}
}

// A fresh instance's admin gets a filled-in profile (add-user-profile) —
// something for an evaluator to see before they've touched Settings.
func TestBootstrapAdminSeedsAProfile(t *testing.T) {
	s := testService(t)
	if err := s.BootstrapAdmin(context.Background(), "admin@example.com", "correcthorse"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	users, _ := s.ListUsers(context.Background())
	if len(users) != 1 {
		t.Fatalf("users = %+v, want 1", users)
	}
	u := users[0]
	if u.DisplayName == nil || *u.DisplayName == "" {
		t.Errorf("DisplayName = %v, want non-empty", u.DisplayName)
	}
	if u.AvatarKey == nil || !domain.AvatarPresetKeys[*u.AvatarKey] {
		t.Errorf("AvatarKey = %v, want a known preset", u.AvatarKey)
	}
	if u.Timezone == nil || *u.Timezone == "" {
		t.Errorf("Timezone = %v, want non-empty", u.Timezone)
	}
}

func TestBootstrapAdminSkipsWhenUsersExist(t *testing.T) {
	s := testService(t)
	mustCreateUser(t, s, "existing@example.com", "correcthorse", false)

	if err := s.BootstrapAdmin(context.Background(), "admin@example.com", "correcthorse"); err != nil {
		t.Fatalf("BootstrapAdmin: %v", err)
	}
	users, _ := s.ListUsers(context.Background())
	if len(users) != 1 {
		t.Errorf("users = %+v, want unchanged (still 1)", users)
	}
}

// asUnauthorized/asForbidden avoid importing "errors" into every test.
func asUnauthorized(err error, target **service.UnauthorizedError) bool {
	if e, ok := err.(*service.UnauthorizedError); ok {
		*target = e
		return true
	}
	return false
}

func asForbidden(err error, target **service.ForbiddenError) bool {
	if e, ok := err.(*service.ForbiddenError); ok {
		*target = e
		return true
	}
	return false
}

// --- Audit wiring across domain areas (task 3.4, representative coverage) ---

func TestDomainWritesRecordAuditEntries(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin2@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Audited Project"})
	if err != nil {
		t.Fatal(err)
	}
	history, err := s.AuditHistory(context.Background(), "project", project.ID)
	if err != nil || len(history) != 1 || history[0].ActorID != admin.ID {
		t.Errorf("project audit history = %+v, %v", history, err)
	}

	c, err := s.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Login", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatal(err)
	}
	history, err = s.AuditHistory(context.Background(), "case", c.ID)
	if err != nil || len(history) != 1 {
		t.Errorf("case audit history = %+v, %v", history, err)
	}

	suite, err := s.CreateSuite(ctx, project.ID, "Smoke")
	if err != nil {
		t.Fatal(err)
	}
	history, err = s.AuditHistory(context.Background(), "suite", suite.ID)
	if err != nil || len(history) != 1 {
		t.Errorf("suite audit history = %+v, %v", history, err)
	}

	run, err := s.CreateRun(ctx, project.ID, service.RunInput{Name: "Run 1", CaseIDs: []string{c.ID}})
	if err != nil {
		t.Fatal(err)
	}
	history, err = s.AuditHistory(context.Background(), "run", run.ID)
	if err != nil || len(history) != 1 {
		t.Errorf("run audit history = %+v, %v", history, err)
	}
}

func TestGetUserByID(t *testing.T) {
	s := testService(t)
	created := mustCreateUser(t, s, "getme@example.com", "correcthorse", false)

	got, err := s.GetUser(context.Background(), created.ID)
	if err != nil || got.Email != "getme@example.com" {
		t.Fatalf("GetUser = %+v, %v", got, err)
	}
}
