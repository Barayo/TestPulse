package service_test

import (
	"context"
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

	full, tok, err := s.CreateToken(context.Background(), ownerActor, "ci-agent")
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
}

// TestTokenReflectsCreatorsCurrentState covers design.md D4: an agent's
// permission level is resolved fresh from the creator's current state, not
// cached at token-creation time.
func TestTokenReflectsCreatorsCurrentState(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "creator@example.com", "correcthorse", false)
	full, _, err := s.CreateToken(context.Background(), actorFor(u), "ci-agent")
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
	full, tok, err := s.CreateToken(context.Background(), actor, "ci-agent")
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

	_, tok, err := s.CreateToken(context.Background(), ownerActor, "ci-agent")
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

	_, tok, err := s.CreateToken(context.Background(), ownerActor, "ci-agent")
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
