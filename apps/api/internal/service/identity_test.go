package service_test

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func testService(t *testing.T) *service.Service {
	t.Helper()
	return service.New(store.New(testutil.Pool(t, "identity_service")))
}

// testServiceAndStore is testService plus direct store access, for tests
// that need to arrange state no Service method exposes yet (e.g. setting
// must_change_password directly, ahead of SetRequirePasswordChange).
func testServiceAndStore(t *testing.T) (*service.Service, *store.Store) {
	t.Helper()
	st := store.New(testutil.Pool(t, "identity_service"))
	return service.New(st), st
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

// rootFolder finds a project's automatically-created root folder via the
// public ListFolders — this package's tests only have access to *service.Service
// from outside (package service_test), never the unexported store field.
func rootFolder(t *testing.T, s *service.Service, ctx context.Context, projectID string) (domain.Folder, error) {
	t.Helper()
	folders, err := s.ListFolders(ctx, projectID)
	if err != nil {
		return domain.Folder{}, err
	}
	for _, f := range folders {
		if f.ParentFolderID == "" {
			return f, nil
		}
	}
	return domain.Folder{}, fmt.Errorf("no root folder found for project %s", projectID)
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

	empty, err := s.UserDeletionPreview(ctx, actorFor(admin), target.ID)
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

	preview, err := s.UserDeletionPreview(ctx, actorFor(admin), target.ID)
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

// TestNonTenantAdminCannotViewUserDeletionPreview covers a defense-in-depth
// fix flagged by automated security review of the add-user-deletion commit:
// UserDeletionPreview relied solely on route-level requireTenantAdmin
// gating (verified not actually exploitable — an HTTP-level test already
// asserts a non-admin caller gets 403), but every sibling deletion-preview
// method (RoleDeletionPreview) checks actor.IsTenantAdmin in the service
// layer too. This brings UserDeletionPreview in line with that pattern.
func TestNonTenantAdminCannotViewUserDeletionPreview(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	target := mustCreateUser(t, s, "previewed2@example.com", "correcthorse", false)
	nonAdmin := actorFor(mustCreateUser(t, s, "member3@example.com", "correcthorse", false))

	_, err := s.UserDeletionPreview(ctx, nonAdmin, target.ID)
	var ferr *service.ForbiddenError
	if !asForbidden(err, &ferr) {
		t.Errorf("err = %v, want ForbiddenError", err)
	}
}

// TestUpdateUserEmail covers add-update-user task 2.1.
func TestUpdateUserEmail(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-email@example.com", "correcthorse", true))
	target := mustCreateUser(t, s, "old-email@example.com", "correcthorse", false)

	updated, err := s.UpdateUserEmail(ctx, admin, target.ID, "new-email@example.com")
	if err != nil {
		t.Fatalf("UpdateUserEmail: %v", err)
	}
	if updated.Email != "new-email@example.com" {
		t.Errorf("Email = %q, want %q", updated.Email, "new-email@example.com")
	}
}

func TestUpdateUserEmailRejectsDuplicate(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-dup@example.com", "correcthorse", true))
	mustCreateUser(t, s, "taken2@example.com", "correcthorse", false)
	target := mustCreateUser(t, s, "mine2@example.com", "correcthorse", false)

	_, err := s.UpdateUserEmail(ctx, admin, target.ID, "taken2@example.com")
	if err == nil {
		t.Error("duplicate email accepted, want error")
	}
}

func TestUpdateUserEmailRejectsInvalid(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-invalid@example.com", "correcthorse", true))
	target := mustCreateUser(t, s, "valid-email@example.com", "correcthorse", false)

	_, err := s.UpdateUserEmail(ctx, admin, target.ID, "not-an-email")
	if err == nil {
		t.Error("invalid email accepted, want error")
	}
}

func TestNonTenantAdminCannotUpdateAnotherUsersEmail(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	nonAdmin := actorFor(mustCreateUser(t, s, "not-admin-email@example.com", "correcthorse", false))
	target := mustCreateUser(t, s, "victim-email@example.com", "correcthorse", false)

	_, err := s.UpdateUserEmail(ctx, nonAdmin, target.ID, "hijacked@example.com")
	var ferr *service.ForbiddenError
	if !asForbidden(err, &ferr) {
		t.Errorf("err = %v, want ForbiddenError", err)
	}
}

// --- Change own password (add-change-own-password) ---

func TestChangeOwnPasswordUpdatesPasswordAndRevokesAllSessions(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	user := mustCreateUser(t, s, "changepw@example.com", "correcthorse-old", false)
	actor := actorFor(user)

	sess, _, err := s.Login(ctx, "changepw@example.com", "correcthorse-old")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	if err := s.ChangeOwnPassword(ctx, actor, "correcthorse-old", "correcthorse-new"); err != nil {
		t.Fatalf("ChangeOwnPassword: %v", err)
	}

	if _, err := s.AuthenticateSession(ctx, sess.ID); err == nil {
		t.Error("session still authenticates after password change, want revoked")
	}
	if _, _, err := s.Login(ctx, "changepw@example.com", "correcthorse-new"); err != nil {
		t.Errorf("login with new password failed: %v", err)
	}
}

func TestChangeOwnPasswordRejectsWrongCurrentPassword(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	actor := actorFor(mustCreateUser(t, s, "wrongcurrent@example.com", "correcthorse-old", false))

	if err := s.ChangeOwnPassword(ctx, actor, "not-the-real-password", "correcthorse-new"); err == nil {
		t.Error("expected error for an incorrect current password")
	}
	if _, _, err := s.Login(ctx, "wrongcurrent@example.com", "correcthorse-old"); err != nil {
		t.Errorf("original password should still work: %v", err)
	}
}

func TestChangeOwnPasswordRejectsWeakNewPassword(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	actor := actorFor(mustCreateUser(t, s, "weaknew@example.com", "correcthorse-old", false))

	if err := s.ChangeOwnPassword(ctx, actor, "correcthorse-old", "short"); err == nil {
		t.Error("weak new password accepted, want error")
	}
}

func TestChangeOwnPasswordClearsRequiredChangeFlag(t *testing.T) {
	s, st := testServiceAndStore(t)
	ctx := context.Background()
	user := mustCreateUser(t, s, "clearsflag@example.com", "correcthorse-old", false)
	actor := actorFor(user)

	if err := st.Users.SetMustChangePassword(ctx, user.ID, true); err != nil {
		t.Fatalf("SetMustChangePassword: %v", err)
	}
	before, err := s.GetUser(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUser: %v", err)
	}
	if !before.MustChangePassword {
		t.Fatal("MustChangePassword should be true before the change")
	}

	if err := s.ChangeOwnPassword(ctx, actor, "correcthorse-old", "correcthorse-new"); err != nil {
		t.Fatalf("ChangeOwnPassword: %v", err)
	}

	after, err := s.GetUser(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUser: %v", err)
	}
	if after.MustChangePassword {
		t.Error("MustChangePassword should be cleared after ChangeOwnPassword")
	}
}

// --- Forgot / reset password (add-forgot-password) ---

// fakeMailer records every send in-memory — no network I/O, so these tests
// exercise the real service logic without a real SMTP server.
type fakeMailer struct {
	sent []fakeMail
}

type fakeMail struct {
	to, subject, body string
}

func (f *fakeMailer) Send(_ context.Context, to, subject, body string) error {
	f.sent = append(f.sent, fakeMail{to: to, subject: subject, body: body})
	return nil
}

func testServiceWithMailer(t *testing.T) (*service.Service, *fakeMailer) {
	t.Helper()
	fm := &fakeMailer{}
	s := service.New(store.New(testutil.Pool(t, "identity_service"))).WithMailer(fm, "https://testpulse.example.com", true)
	return s, fm
}

func TestForgotPasswordSendsEmailForRealActiveAccount(t *testing.T) {
	s, fm := testServiceWithMailer(t)
	ctx := context.Background()
	mustCreateUser(t, s, "forgot@example.com", "correcthorse", false)

	if err := s.ForgotPassword(ctx, "forgot@example.com"); err != nil {
		t.Fatalf("ForgotPassword: %v", err)
	}
	if len(fm.sent) != 1 {
		t.Fatalf("sent = %d emails, want 1", len(fm.sent))
	}
	if fm.sent[0].to != "forgot@example.com" {
		t.Errorf("sent to %q, want forgot@example.com", fm.sent[0].to)
	}
	if !strings.Contains(fm.sent[0].body, "https://testpulse.example.com/reset-password?token=") {
		t.Errorf("body = %q, want a reset link", fm.sent[0].body)
	}
}

func TestForgotPasswordSilentForUnknownEmail(t *testing.T) {
	s, fm := testServiceWithMailer(t)

	if err := s.ForgotPassword(context.Background(), "nobody@example.com"); err != nil {
		t.Fatalf("ForgotPassword: %v", err)
	}
	if len(fm.sent) != 0 {
		t.Errorf("sent = %d emails, want 0 for an unknown email", len(fm.sent))
	}
}

func TestForgotPasswordSilentForDeactivatedAccount(t *testing.T) {
	s, fm := testServiceWithMailer(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-forgot@example.com", "correcthorse", true))
	target := mustCreateUser(t, s, "deactivated-forgot@example.com", "correcthorse", false)
	if err := s.DeactivateUser(ctx, target.ID); err != nil {
		t.Fatalf("DeactivateUser: %v", err)
	}
	_ = admin

	if err := s.ForgotPassword(ctx, "deactivated-forgot@example.com"); err != nil {
		t.Fatalf("ForgotPassword: %v", err)
	}
	if len(fm.sent) != 0 {
		t.Errorf("sent = %d emails, want 0 for a deactivated account", len(fm.sent))
	}
}

func TestForgotPasswordSilentWhenSMTPNotConfigured(t *testing.T) {
	s := testService(t) // no WithMailer — passwordResetEnabled defaults false
	ctx := context.Background()
	mustCreateUser(t, s, "no-smtp@example.com", "correcthorse", false)

	if err := s.ForgotPassword(ctx, "no-smtp@example.com"); err != nil {
		t.Fatalf("ForgotPassword: %v", err)
	}
}

func TestResetPasswordUpdatesPasswordAndRevokesSessions(t *testing.T) {
	s, fm := testServiceWithMailer(t)
	ctx := context.Background()
	mustCreateUser(t, s, "reset@example.com", "correcthorse-old", false)

	sess, _, err := s.Login(ctx, "reset@example.com", "correcthorse-old")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	if err := s.ForgotPassword(ctx, "reset@example.com"); err != nil {
		t.Fatalf("ForgotPassword: %v", err)
	}
	token := extractToken(t, fm.sent[0].body)

	if err := s.ResetPassword(ctx, token, "correcthorse-new"); err != nil {
		t.Fatalf("ResetPassword: %v", err)
	}

	if _, err := s.AuthenticateSession(ctx, sess.ID); err == nil {
		t.Error("session still authenticates after password reset, want revoked")
	}
	if _, _, err := s.Login(ctx, "reset@example.com", "correcthorse-new"); err != nil {
		t.Errorf("login with new password failed: %v", err)
	}
}

func TestResetPasswordRejectsExpiredToken(t *testing.T) {
	s, _ := testServiceWithMailer(t)
	ctx := context.Background()

	if err := s.ResetPassword(ctx, "not-a-real-token", "correcthorse-new"); err == nil {
		t.Error("expected error for an unknown/expired token")
	}
}

func TestResetPasswordRejectsUsedToken(t *testing.T) {
	s, fm := testServiceWithMailer(t)
	ctx := context.Background()
	mustCreateUser(t, s, "reused@example.com", "correcthorse-old", false)

	if err := s.ForgotPassword(ctx, "reused@example.com"); err != nil {
		t.Fatalf("ForgotPassword: %v", err)
	}
	token := extractToken(t, fm.sent[0].body)

	if err := s.ResetPassword(ctx, token, "correcthorse-new"); err != nil {
		t.Fatalf("first ResetPassword: %v", err)
	}
	if err := s.ResetPassword(ctx, token, "correcthorse-newer"); err == nil {
		t.Error("expected error reusing an already-redeemed token")
	}
}

func TestResetPasswordRejectsWeakPassword(t *testing.T) {
	s, fm := testServiceWithMailer(t)
	ctx := context.Background()
	mustCreateUser(t, s, "weakreset@example.com", "correcthorse-old", false)

	if err := s.ForgotPassword(ctx, "weakreset@example.com"); err != nil {
		t.Fatalf("ForgotPassword: %v", err)
	}
	token := extractToken(t, fm.sent[0].body)

	if err := s.ResetPassword(ctx, token, "short"); err == nil {
		t.Error("weak password accepted, want error")
	}
}

// extractToken pulls the raw token out of the reset link a fakeMailer
// captured, mirroring what the real reset-password page would read from
// its URL query string.
func extractToken(t *testing.T, body string) string {
	t.Helper()
	const marker = "/reset-password?token="
	i := strings.Index(body, marker)
	if i == -1 {
		t.Fatalf("body %q does not contain a reset link", body)
	}
	rest := body[i+len(marker):]
	end := strings.IndexAny(rest, "\r\n \t")
	if end == -1 {
		end = len(rest)
	}
	return rest[:end]
}

// --- Admin password actions (add-change-own-password) ---

func TestSendPasswordResetEmailForExistingAccount(t *testing.T) {
	s, fm := testServiceWithMailer(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-trigger@example.com", "correcthorse", true))
	target := mustCreateUser(t, s, "target-trigger@example.com", "correcthorse", false)

	if err := s.SendPasswordResetEmail(ctx, admin, target.ID); err != nil {
		t.Fatalf("SendPasswordResetEmail: %v", err)
	}
	if len(fm.sent) != 1 {
		t.Fatalf("sent = %d emails, want 1", len(fm.sent))
	}
	if fm.sent[0].to != "target-trigger@example.com" {
		t.Errorf("sent to %q, want target-trigger@example.com", fm.sent[0].to)
	}
}

func TestSendPasswordResetEmailRejectedWithoutSMTPConfigured(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-nosmtp@example.com", "correcthorse", true))
	target := mustCreateUser(t, s, "target-nosmtp@example.com", "correcthorse", false)

	if err := s.SendPasswordResetEmail(ctx, admin, target.ID); err == nil {
		t.Error("expected error when SMTP is not configured")
	}
}

func TestSendPasswordResetEmailRequiresTenantAdmin(t *testing.T) {
	s, _ := testServiceWithMailer(t)
	ctx := context.Background()
	nonAdmin := actorFor(mustCreateUser(t, s, "nonadmin-trigger@example.com", "correcthorse", false))
	target := mustCreateUser(t, s, "target-nonadmin@example.com", "correcthorse", false)

	err := s.SendPasswordResetEmail(ctx, nonAdmin, target.ID)
	var ferr *service.ForbiddenError
	if !asForbidden(err, &ferr) {
		t.Errorf("err = %v, want ForbiddenError", err)
	}
}

func TestSetRequirePasswordChangeFlagsAccount(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-flag@example.com", "correcthorse", true))
	target := mustCreateUser(t, s, "target-flag@example.com", "correcthorse", false)

	if err := s.SetRequirePasswordChange(ctx, admin, target.ID, true); err != nil {
		t.Fatalf("SetRequirePasswordChange: %v", err)
	}
	got, err := s.GetUser(ctx, target.ID)
	if err != nil {
		t.Fatalf("GetUser: %v", err)
	}
	if !got.MustChangePassword {
		t.Error("MustChangePassword = false, want true")
	}

	if err := s.SetRequirePasswordChange(ctx, admin, target.ID, false); err != nil {
		t.Fatalf("SetRequirePasswordChange(false): %v", err)
	}
	got, err = s.GetUser(ctx, target.ID)
	if err != nil {
		t.Fatalf("GetUser: %v", err)
	}
	if got.MustChangePassword {
		t.Error("MustChangePassword = true, want false after clearing")
	}
}

func TestGenerateTemporaryPasswordSetsFlagAndRevokesSessions(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-temp@example.com", "correcthorse", true))
	target := mustCreateUser(t, s, "target-temp@example.com", "correcthorse-old", false)

	sess, _, err := s.Login(ctx, "target-temp@example.com", "correcthorse-old")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	raw, err := s.GenerateTemporaryPassword(ctx, admin, target.ID)
	if err != nil {
		t.Fatalf("GenerateTemporaryPassword: %v", err)
	}
	if len(raw) < 12 {
		t.Errorf("generated password %q is shorter than the minimum length", raw)
	}

	if _, err := s.AuthenticateSession(ctx, sess.ID); err == nil {
		t.Error("old session still authenticates, want revoked")
	}
	if _, _, err := s.Login(ctx, "target-temp@example.com", raw); err != nil {
		t.Errorf("login with the generated password failed: %v", err)
	}
	got, err := s.GetUser(ctx, target.ID)
	if err != nil {
		t.Fatalf("GetUser: %v", err)
	}
	if !got.MustChangePassword {
		t.Error("MustChangePassword = false, want true after generating a temporary password")
	}
}

func TestGenerateTemporaryPasswordRejectedWhenSMTPConfigured(t *testing.T) {
	s, _ := testServiceWithMailer(t)
	ctx := context.Background()
	admin := actorFor(mustCreateUser(t, s, "admin-temp-smtp@example.com", "correcthorse", true))
	target := mustCreateUser(t, s, "target-temp-smtp@example.com", "correcthorse", false)

	if _, err := s.GenerateTemporaryPassword(ctx, admin, target.ID); err == nil {
		t.Error("expected error generating a temporary password when SMTP is configured")
	}
}

func TestGenerateTemporaryPasswordRequiresTenantAdmin(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	nonAdmin := actorFor(mustCreateUser(t, s, "nonadmin-temp@example.com", "correcthorse", false))
	target := mustCreateUser(t, s, "target-nonadmin-temp@example.com", "correcthorse", false)

	_, err := s.GenerateTemporaryPassword(ctx, nonAdmin, target.ID)
	var ferr *service.ForbiddenError
	if !asForbidden(err, &ferr) {
		t.Errorf("err = %v, want ForbiddenError", err)
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

// add-session-timeout-setting: sessionLifetime is no longer a hardcoded
// constant — both session creation and the sliding-window extension must
// read the currently-configured instance setting.

func TestLoginUsesConfiguredSessionTimeout(t *testing.T) {
	pool := testutil.Pool(t, "identity_session_timeout_login")
	st := store.New(pool)
	s := service.New(st)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	days := 5
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{SessionTimeoutDays: &days}); err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}

	mustCreateUser(t, s, "user@example.com", "correcthorse", false)
	sess, _, err := s.Login(context.Background(), "user@example.com", "correcthorse")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}

	untilExpiry := time.Until(sess.ExpiresAt)
	if untilExpiry < 4*24*time.Hour || untilExpiry > 6*24*time.Hour {
		t.Errorf("session expires in %v, want ~5 days (the configured sessionTimeoutDays), not the old hardcoded 30", untilExpiry)
	}
}

func TestAuthenticateSessionExtendsUsingConfiguredTimeout(t *testing.T) {
	pool := testutil.Pool(t, "identity_session_timeout_extend")
	st := store.New(pool)
	s := service.New(st)
	admin := mustCreateUser(t, s, "admin@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	days := 5
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{SessionTimeoutDays: &days}); err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}

	user := mustCreateUser(t, s, "user@example.com", "correcthorse", false)
	sess, _, err := s.Login(context.Background(), "user@example.com", "correcthorse")
	if err != nil {
		t.Fatalf("Login: %v", err)
	}
	if _, err := s.AuthenticateSession(context.Background(), sess.ID); err != nil {
		t.Fatalf("AuthenticateSession: %v", err)
	}

	var expiresAt time.Time
	if err := pool.QueryRow(context.Background(),
		`SELECT expires_at FROM sessions WHERE user_id = $1`, user.ID,
	).Scan(&expiresAt); err != nil {
		t.Fatalf("querying session expires_at: %v", err)
	}
	untilExpiry := time.Until(expiresAt)
	if untilExpiry < 4*24*time.Hour || untilExpiry > 6*24*time.Hour {
		t.Errorf("extended session expires in %v, want ~5 days (the configured sessionTimeoutDays), not the old hardcoded 30", untilExpiry)
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

// #176: deactivating a user must cut off the API tokens they created too,
// not just their own browser session -- AuthenticateSession already
// rejects a deactivated user; AuthenticateToken must do the same for
// tokens whose creator is now deactivated, unscoped or project-scoped.
func TestAuthenticateTokenRejectsTokenFromDeactivatedCreator(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "soon-deactivated@example.com", "correcthorse", false)
	ownerActor := actorFor(u)

	full, _, err := s.CreateToken(context.Background(), ownerActor, "ci-agent", nil, nil)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	if _, err := s.AuthenticateToken(context.Background(), full); err != nil {
		t.Fatalf("AuthenticateToken (before deactivation): %v", err)
	}

	if err := s.DeactivateUser(context.Background(), u.ID); err != nil {
		t.Fatalf("DeactivateUser: %v", err)
	}

	_, err = s.AuthenticateToken(context.Background(), full)
	var uerr *service.UnauthorizedError
	if !asUnauthorized(err, &uerr) {
		t.Errorf("AuthenticateToken after creator deactivated = %v, want UnauthorizedError", err)
	}
}

// #176: reactivating a user must restore authentication for the tokens
// they created, matching TestReactivatedUserCanLoginAgain's guarantee for
// sessions -- the check re-reads the creator's current state on every
// call, so reactivation needs no separate token-side action.
func TestReactivatedUserTokenAuthenticatesAgain(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "reactivated-owner@example.com", "correcthorse", false)
	ownerActor := actorFor(u)

	full, _, err := s.CreateToken(context.Background(), ownerActor, "ci-agent", nil, nil)
	if err != nil {
		t.Fatalf("CreateToken: %v", err)
	}
	if err := s.DeactivateUser(context.Background(), u.ID); err != nil {
		t.Fatalf("DeactivateUser: %v", err)
	}
	if err := s.ReactivateUser(context.Background(), u.ID); err != nil {
		t.Fatalf("ReactivateUser: %v", err)
	}

	if _, err := s.AuthenticateToken(context.Background(), full); err != nil {
		t.Fatalf("AuthenticateToken after reactivation: %v", err)
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

// --- HasAnyUser / first-run setup (add-first-run-setup) ---

func TestHasAnyUserReflectsInstanceState(t *testing.T) {
	s := testService(t)
	ctx := context.Background()

	has, err := s.HasAnyUser(ctx)
	if err != nil {
		t.Fatalf("HasAnyUser on empty instance: %v", err)
	}
	if has {
		t.Error("HasAnyUser = true on an empty instance, want false")
	}

	mustCreateUser(t, s, "a@example.com", "correcthorse", false)

	has, err = s.HasAnyUser(ctx)
	if err != nil {
		t.Fatalf("HasAnyUser after create: %v", err)
	}
	if !has {
		t.Error("HasAnyUser = false after a user was created, want true")
	}
}

func TestSetupFirstAdminCreatesTenantAdminAndSession(t *testing.T) {
	s := testService(t)
	ctx := context.Background()

	sess, user, err := s.SetupFirstAdmin(ctx, "founder@example.com", "correcthorse")
	if err != nil {
		t.Fatalf("SetupFirstAdmin: %v", err)
	}
	if !user.IsTenantAdmin {
		t.Error("SetupFirstAdmin user is not a Tenant Admin")
	}
	if user.MustChangePassword {
		t.Error("SetupFirstAdmin user has MustChangePassword = true, want false — the password was chosen directly, nothing temporary about it")
	}
	if sess.UserID != user.ID || sess.ID == "" {
		t.Errorf("session = %+v, user = %+v", sess, user)
	}
	if user.DisplayName == nil || *user.DisplayName != "Founder" {
		t.Errorf("DisplayName = %v, want \"Founder\" (derived from email, not BootstrapAdmin's fixed \"Admin\")", user.DisplayName)
	}
}

func TestSetupFirstAdminRejectedWhenUsersExist(t *testing.T) {
	s := testService(t)
	ctx := context.Background()
	mustCreateUser(t, s, "existing@example.com", "correcthorse", false)

	_, _, err := s.SetupFirstAdmin(ctx, "founder@example.com", "correcthorse")
	if err == nil {
		t.Fatal("SetupFirstAdmin succeeded on an instance that already has a user, want error")
	}
	var cerr *service.ConflictError
	if !errors.As(err, &cerr) {
		t.Errorf("error = %v (%T), want *service.ConflictError", err, err)
	}

	users, _ := s.ListUsers(ctx)
	if len(users) != 1 {
		t.Errorf("users = %+v, want unchanged (still 1)", users)
	}
}

// TestSetupFirstAdminRaceOnlyOneSucceeds reproduces two people (or the
// interactive path racing the env-var bootstrap path) hitting first-run
// setup at effectively the same time — exactly one call must create the
// account, the other must be rejected, and the instance must never end up
// with two accounts both believing they're the sole first admin.
func TestSetupFirstAdminRaceOnlyOneSucceeds(t *testing.T) {
	s := testService(t)
	ctx := context.Background()

	const attempts = 5
	var wg sync.WaitGroup
	results := make(chan error, attempts)
	for i := range attempts {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, _, err := s.SetupFirstAdmin(ctx, fmt.Sprintf("founder%d@example.com", i), "correcthorse")
			results <- err
		}(i)
	}
	wg.Wait()
	close(results)

	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Errorf("successes = %d, want exactly 1", successes)
	}

	users, err := s.ListUsers(ctx)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) != 1 {
		t.Errorf("users = %+v, want exactly 1", users)
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

func TestMoveCaseAuditEntryRecordsFromAndTo(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "mover@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Move Project"})
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "Login", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatal(err)
	}
	originalFolderID := c.FolderID

	target, err := s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Target", ParentFolderID: originalFolderID})
	if err != nil {
		t.Fatal(err)
	}

	if err := s.MoveCase(ctx, c.ID, target.ID); err != nil {
		t.Fatal(err)
	}

	history, err := s.AuditHistory(context.Background(), "case", c.ID)
	if err != nil {
		t.Fatal(err)
	}
	var moveEntry *domain.AuditEntry
	for i := range history {
		if history[i].Action == "move" {
			moveEntry = &history[i]
		}
	}
	if moveEntry == nil {
		t.Fatalf("no move audit entry found: %+v", history)
	}
	want := map[string]any{"from": originalFolderID, "to": target.ID}
	if !reflect.DeepEqual(moveEntry.Detail, want) {
		t.Errorf("move detail = %+v, want %+v", moveEntry.Detail, want)
	}
}

// TestMoveFolderAuditEntryRecordsFromAndTo covers add-library-folder-selection
// task 2.2: reparenting a folder audits "move"/"folder" with {from, to}
// exactly like MoveCase does.
func TestMoveFolderAuditEntryRecordsFromAndTo(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "folder-mover@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Move Folder Project"})
	if err != nil {
		t.Fatal(err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	auth, err := s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Auth", ParentFolderID: root.ID})
	if err != nil {
		t.Fatal(err)
	}
	settings, err := s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Settings", ParentFolderID: root.ID})
	if err != nil {
		t.Fatal(err)
	}

	moved, err := s.MoveFolder(ctx, auth.ID, settings.ID)
	if err != nil {
		t.Fatal(err)
	}
	if moved.ParentFolderID != settings.ID {
		t.Errorf("ParentFolderID = %q, want %q", moved.ParentFolderID, settings.ID)
	}

	history, err := s.AuditHistory(context.Background(), "folder", auth.ID)
	if err != nil {
		t.Fatal(err)
	}
	var moveEntry *domain.AuditEntry
	for i := range history {
		if history[i].Action == "move" {
			moveEntry = &history[i]
		}
	}
	if moveEntry == nil {
		t.Fatalf("no move audit entry found: %+v", history)
	}
	want := map[string]any{"from": root.ID, "to": settings.ID}
	if !reflect.DeepEqual(moveEntry.Detail, want) {
		t.Errorf("move detail = %+v, want %+v", moveEntry.Detail, want)
	}
}

// TestMoveFolderRejectsEmptyTarget covers the "targetParentID is required"
// validation the handler relies on to return 400, not a 500 from a bad SQL arg.
func TestMoveFolderRejectsEmptyTarget(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "folder-mover2@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Move Folder Validation Project"})
	if err != nil {
		t.Fatal(err)
	}
	root, err := rootFolder(t, s, ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	auth, err := s.CreateFolder(ctx, project.ID, domain.NewFolder{Name: "Auth", ParentFolderID: root.ID})
	if err != nil {
		t.Fatal(err)
	}

	var verr *service.ValidationError
	if _, err := s.MoveFolder(ctx, auth.ID, ""); !errors.As(err, &verr) {
		t.Errorf("MoveFolder with empty target = %v, want ValidationError", err)
	}
}

// #175: MoveCase must confine the destination folder to the case's own
// project -- otherwise a folder in another project can graft the case into
// a subtree that project's own routine folder-delete will later cascade
// into, destroying it with no permission check on the case's real project
// ever having run.
func TestMoveCaseRejectsFolderFromDifferentProject(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "cross-project-mover@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	projectA, err := s.CreateProject(ctx, service.ProjectInput{Name: "Project A"})
	if err != nil {
		t.Fatal(err)
	}
	projectB, err := s.CreateProject(ctx, service.ProjectInput{Name: "Project B"})
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.CreateCase(ctx, projectA.ID, "", domain.CaseContent{Title: "Login", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatal(err)
	}
	rootB, err := rootFolder(t, s, ctx, projectB.ID)
	if err != nil {
		t.Fatal(err)
	}
	folderB, err := s.CreateFolder(ctx, projectB.ID, domain.NewFolder{Name: "In B", ParentFolderID: rootB.ID})
	if err != nil {
		t.Fatal(err)
	}

	var verr *service.ValidationError
	if err := s.MoveCase(ctx, c.ID, folderB.ID); !errors.As(err, &verr) {
		t.Fatalf("MoveCase into a different project's folder = %v, want ValidationError", err)
	}

	after, err := s.GetCase(ctx, c.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.FolderID == folderB.ID {
		t.Errorf("case was moved into project B's folder despite the rejection")
	}
}

// #175: MoveFolder must confine the target parent to the same project as
// the folder being moved -- same cross-project graft risk as MoveCase.
func TestMoveFolderRejectsTargetFromDifferentProject(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "cross-project-folder-mover@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	projectA, err := s.CreateProject(ctx, service.ProjectInput{Name: "Project A"})
	if err != nil {
		t.Fatal(err)
	}
	projectB, err := s.CreateProject(ctx, service.ProjectInput{Name: "Project B"})
	if err != nil {
		t.Fatal(err)
	}
	rootA, err := rootFolder(t, s, ctx, projectA.ID)
	if err != nil {
		t.Fatal(err)
	}
	folderA, err := s.CreateFolder(ctx, projectA.ID, domain.NewFolder{Name: "In A", ParentFolderID: rootA.ID})
	if err != nil {
		t.Fatal(err)
	}
	rootB, err := rootFolder(t, s, ctx, projectB.ID)
	if err != nil {
		t.Fatal(err)
	}

	var verr *service.ValidationError
	if _, err := s.MoveFolder(ctx, folderA.ID, rootB.ID); !errors.As(err, &verr) {
		t.Fatalf("MoveFolder into a different project's tree = %v, want ValidationError", err)
	}

	afterFolders, err := s.ListFolders(ctx, projectA.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range afterFolders {
		if f.ID == folderA.ID && f.ParentFolderID == rootB.ID {
			t.Errorf("folder was grafted into project B's tree despite the rejection")
		}
	}
}

// Luis's post-implementation review of add-folder-slug-urls (2026-09-10):
// CreateCase never confirmed folderID belongs to projectID, unlike MoveCase
// (#175's precedent, TestMoveCaseRejectsFolderFromDifferentProject above).
// The gap predates add-folder-slug-urls but matters more now that this
// project's sibling-slug uniqueness guarantees are scoped by the inserted
// row's own project_id -- a cross-project folderID could otherwise graft a
// case into a subtree with none of this project's own checks ever having run.
func TestCreateCaseRejectsFolderFromDifferentProject(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "cross-project-case-creator@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	projectA, err := s.CreateProject(ctx, service.ProjectInput{Name: "Project A"})
	if err != nil {
		t.Fatal(err)
	}
	projectB, err := s.CreateProject(ctx, service.ProjectInput{Name: "Project B"})
	if err != nil {
		t.Fatal(err)
	}
	rootB, err := rootFolder(t, s, ctx, projectB.ID)
	if err != nil {
		t.Fatal(err)
	}

	var verr *service.ValidationError
	if _, err := s.CreateCase(ctx, projectA.ID, rootB.ID, domain.CaseContent{Title: "Login", Priority: domain.PriorityMedium}); !errors.As(err, &verr) {
		t.Fatalf("CreateCase in project A targeting project B's folder = %v, want ValidationError", err)
	}
}

// Same gap as above, for CreateFolder (Luis's finding).
func TestCreateFolderRejectsParentFromDifferentProject(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "cross-project-folder-creator@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	projectA, err := s.CreateProject(ctx, service.ProjectInput{Name: "Project A"})
	if err != nil {
		t.Fatal(err)
	}
	projectB, err := s.CreateProject(ctx, service.ProjectInput{Name: "Project B"})
	if err != nil {
		t.Fatal(err)
	}
	rootB, err := rootFolder(t, s, ctx, projectB.ID)
	if err != nil {
		t.Fatal(err)
	}

	var verr *service.ValidationError
	if _, err := s.CreateFolder(ctx, projectA.ID, domain.NewFolder{Name: "Grafted", ParentFolderID: rootB.ID}); !errors.As(err, &verr) {
		t.Fatalf("CreateFolder in project A targeting project B's parent = %v, want ValidationError", err)
	}
}

func TestRestoreVersionCreatesNewVersionWithOldContent(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "restorer@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Restore Project"})
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "v1 title", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.EditCase(ctx, c.ID, domain.CaseContent{Title: "v2 title", Priority: domain.PriorityMedium}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.EditCase(ctx, c.ID, domain.CaseContent{Title: "v3 title", Priority: domain.PriorityMedium}); err != nil {
		t.Fatal(err)
	}

	restored, err := s.RestoreVersion(ctx, c.ID, 1)
	if err != nil {
		t.Fatal(err)
	}
	if restored.CurrentVersion != 4 {
		t.Errorf("CurrentVersion = %d, want 4 (always higher than any existing version)", restored.CurrentVersion)
	}
	if restored.Content.Title != "v1 title" {
		t.Errorf("Content.Title = %q, want %q", restored.Content.Title, "v1 title")
	}

	history, err := s.AuditHistory(context.Background(), "case", c.ID)
	if err != nil {
		t.Fatal(err)
	}
	var restoreEntry *domain.AuditEntry
	for i := range history {
		if history[i].Action == "restore" {
			restoreEntry = &history[i]
		}
	}
	if restoreEntry == nil {
		t.Fatalf("no restore audit entry found: %+v", history)
	}
	want := map[string]any{"restoredFrom": float64(1), "newVersion": float64(4)}
	if !reflect.DeepEqual(restoreEntry.Detail, want) {
		t.Errorf("restore detail = %+v, want %+v", restoreEntry.Detail, want)
	}
}

func TestRestoreNonexistentVersionIsRejected(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "restorer2@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Restore Project 2"})
	if err != nil {
		t.Fatal(err)
	}
	c, err := s.CreateCase(ctx, project.ID, "", domain.CaseContent{Title: "only version", Priority: domain.PriorityMedium})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := s.RestoreVersion(ctx, c.ID, 99); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("RestoreVersion(nonexistent) = %v, want store.ErrNotFound", err)
	}
}

// TestDeleteProjectRequiresArchivedProject covers add-data-retention
// design.md D4: the archived-first precondition is real service-layer
// business logic (unlike permission checks, which live purely in HTTP
// middleware in this codebase) — a non-archived project cannot be deleted.
// TestUpdateProjectUnarchivesRatherThanNoOp covers add-data-retention
// design.md D7: before this change, archived: false was silently accepted
// and did nothing.
func TestUpdateProjectUnarchivesRatherThanNoOp(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "unarchiver@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Toggle Project"})
	if err != nil {
		t.Fatal(err)
	}
	archived := true
	if _, err := s.UpdateProject(ctx, project.ID, service.ProjectUpdate{Archived: &archived}); err != nil {
		t.Fatal(err)
	}

	unarchived := false
	got, err := s.UpdateProject(ctx, project.ID, service.ProjectUpdate{Archived: &unarchived})
	if err != nil {
		t.Fatalf("UpdateProject(archived: false): %v", err)
	}
	if got.Archived {
		t.Error("project should be unarchived, not still archived (was a silent no-op before design.md D7)")
	}
}

// TestUpdateProjectAutoArchiveExemptRequiresTenantAdmin covers add-data-retention
// design.md D9: the auto-archive exemption is settable only by a Tenant
// Admin, never a Project Admin — even one with manageProject, the
// permission that otherwise gates every other field UpdateProject accepts.
func TestUpdateProjectAutoArchiveExemptRequiresTenantAdmin(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "exempt-admin@example.com", "correcthorse", true)
	adminCtx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(adminCtx, service.ProjectInput{Name: "Exempt Me"})
	if err != nil {
		t.Fatal(err)
	}

	nonAdmin := mustCreateUser(t, s, "exempt-nonadmin@example.com", "correcthorse", false)
	nonAdminCtx := domain.WithActor(context.Background(), actorFor(nonAdmin))

	exempt := true
	var ferr *service.ForbiddenError
	if _, err := s.UpdateProject(nonAdminCtx, project.ID, service.ProjectUpdate{AutoArchiveExempt: &exempt}); !errors.As(err, &ferr) {
		t.Errorf("UpdateProject(AutoArchiveExempt) by non-Tenant-Admin = %v, want ForbiddenError", err)
	}
	got, err := s.GetProject(adminCtx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.AutoArchiveExempt {
		t.Error("AutoArchiveExempt was set by a non-Tenant-Admin, want unchanged false")
	}

	got, err = s.UpdateProject(adminCtx, project.ID, service.ProjectUpdate{AutoArchiveExempt: &exempt})
	if err != nil {
		t.Fatalf("UpdateProject(AutoArchiveExempt) by Tenant Admin: %v", err)
	}
	if !got.AutoArchiveExempt {
		t.Error("AutoArchiveExempt = false after a Tenant Admin set it true")
	}
}

func TestDeleteProjectRequiresArchivedProject(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "deleter1@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Active Project"})
	if err != nil {
		t.Fatal(err)
	}

	err = s.DeleteProject(ctx, project.ID)
	var verr *service.ValidationError
	if !errors.As(err, &verr) || !strings.Contains(err.Error(), "archived") {
		t.Errorf("err = %v (%T), want a ValidationError mentioning archived", err, err)
	}

	got, err := s.GetProject(ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != project.ID {
		t.Errorf("project should survive a rejected delete: %+v", got)
	}
}

func TestDeleteProjectMarksArchivedProjectForDeletion(t *testing.T) {
	s := testService(t)
	admin := mustCreateUser(t, s, "deleter2@example.com", "correcthorse", true)
	ctx := domain.WithActor(context.Background(), actorFor(admin))

	project, err := s.CreateProject(ctx, service.ProjectInput{Name: "Archived Project"})
	if err != nil {
		t.Fatal(err)
	}
	archived := true
	if _, err := s.UpdateProject(ctx, project.ID, service.ProjectUpdate{Archived: &archived}); err != nil {
		t.Fatal(err)
	}

	if err := s.DeleteProject(ctx, project.ID); err != nil {
		t.Fatalf("DeleteProject: %v", err)
	}

	list, err := s.ListProjects(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range list {
		if p.ID == project.ID {
			t.Error("a project marked for deletion should no longer be listed")
		}
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
