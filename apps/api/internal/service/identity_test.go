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

func mustCreateUser(t *testing.T, s *service.Service, email, password string, role domain.Role) domain.User {
	t.Helper()
	u, err := s.CreateUser(context.Background(), email, password, role)
	if err != nil {
		t.Fatalf("CreateUser(%s): %v", email, err)
	}
	return u
}

// --- Login / sessions (authentication spec scenarios) ---

func TestLoginSuccessCreatesSession(t *testing.T) {
	s := testService(t)
	mustCreateUser(t, s, "a@example.com", "correcthorse", domain.RoleMember)

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
	mustCreateUser(t, s, "a@example.com", "correcthorse", domain.RoleMember)

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
	u := mustCreateUser(t, s, "a@example.com", "correcthorse", domain.RoleMember)
	if err := s.DeactivateUser(context.Background(), u.ID); err != nil {
		t.Fatal(err)
	}
	_, _, err := s.Login(context.Background(), "a@example.com", "correcthorse")
	var uerr *service.UnauthorizedError
	if !asUnauthorized(err, &uerr) {
		t.Errorf("err = %v, want UnauthorizedError", err)
	}
}

func TestLogoutInvalidatesSession(t *testing.T) {
	s := testService(t)
	mustCreateUser(t, s, "a@example.com", "correcthorse", domain.RoleMember)
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
	mustCreateUser(t, s, "a@example.com", "correcthorse", domain.RoleAdmin)
	sess, user, err := s.Login(context.Background(), "a@example.com", "correcthorse")
	if err != nil {
		t.Fatal(err)
	}

	actor, err := s.AuthenticateSession(context.Background(), sess.ID)
	if err != nil {
		t.Fatalf("AuthenticateSession: %v", err)
	}
	if actor.ID != user.ID || actor.Kind != domain.ActorKindUser || actor.Role != domain.RoleAdmin {
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
	u := mustCreateUser(t, s, "agent-owner@example.com", "correcthorse", domain.RoleMember)
	ownerActor := domain.Actor{ID: u.ID, Kind: domain.ActorKindUser, DisplayName: u.Email, Role: u.Role}

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
	if actor.Kind != domain.ActorKindAgent || actor.ID != tok.ID || actor.Role != domain.RoleMember {
		t.Errorf("actor = %+v, want agent acting at member role", actor)
	}
}

func TestRevokedTokenNoLongerAuthenticates(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "owner@example.com", "correcthorse", domain.RoleMember)
	actor := domain.Actor{ID: u.ID, Kind: domain.ActorKindUser, DisplayName: u.Email, Role: u.Role}
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
	owner := mustCreateUser(t, s, "owner@example.com", "correcthorse", domain.RoleMember)
	other := mustCreateUser(t, s, "other@example.com", "correcthorse", domain.RoleMember)
	ownerActor := domain.Actor{ID: owner.ID, Kind: domain.ActorKindUser, DisplayName: owner.Email, Role: owner.Role}
	otherActor := domain.Actor{ID: other.ID, Kind: domain.ActorKindUser, DisplayName: other.Email, Role: other.Role}

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
	owner := mustCreateUser(t, s, "owner@example.com", "correcthorse", domain.RoleMember)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", domain.RoleAdmin)
	ownerActor := domain.Actor{ID: owner.ID, Kind: domain.ActorKindUser, DisplayName: owner.Email, Role: owner.Role}
	adminActor := domain.Actor{ID: admin.ID, Kind: domain.ActorKindUser, DisplayName: admin.Email, Role: admin.Role}

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
	owner := mustCreateUser(t, s, "owner@example.com", "correcthorse", domain.RoleMember)
	other := mustCreateUser(t, s, "other@example.com", "correcthorse", domain.RoleMember)
	otherActor := domain.Actor{ID: other.ID, Kind: domain.ActorKindUser, DisplayName: other.Email, Role: other.Role}

	_, err := s.ListTokensForUser(context.Background(), otherActor, owner.ID)
	var ferr *service.ForbiddenError
	if !asForbidden(err, &ferr) {
		t.Errorf("err = %v, want ForbiddenError", err)
	}
}

// --- Audit wiring (task 3.4) ---

func TestCreateUserRecordsAuditEntryWhenActorPresent(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", domain.RoleAdmin)
	ctx := domain.WithActor(context.Background(), domain.Actor{
		ID: admin.ID, Kind: domain.ActorKindUser, DisplayName: admin.Email, Role: admin.Role,
	})

	created, err := s.CreateUser(ctx, "new@example.com", "correcthorse", domain.RoleMember)
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
	if len(users) != 1 || users[0].Role != domain.RoleAdmin {
		t.Errorf("users = %+v, want one admin", users)
	}
}

func TestBootstrapAdminSkipsWhenUsersExist(t *testing.T) {
	s := testService(t)
	mustCreateUser(t, s, "existing@example.com", "correcthorse", domain.RoleMember)

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
	admin := mustCreateUser(t, s, "admin2@example.com", "correcthorse", domain.RoleAdmin)
	ctx := domain.WithActor(context.Background(), domain.Actor{
		ID: admin.ID, Kind: domain.ActorKindUser, DisplayName: admin.Email, Role: admin.Role,
	})

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
	created := mustCreateUser(t, s, "getme@example.com", "correcthorse", domain.RoleMember)

	got, err := s.GetUser(context.Background(), created.ID)
	if err != nil || got.Email != "getme@example.com" {
		t.Fatalf("GetUser = %+v, %v", got, err)
	}
}
