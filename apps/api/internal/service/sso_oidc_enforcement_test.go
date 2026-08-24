package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

// enableSSOOnly arranges instance_settings into a fully-configured,
// SSO-only state directly (bypassing UpdateInstanceSettings's own
// encryption-key requirement, since these tests only care about Login/
// ForgotPassword/ResetPassword's *enforcement*, not settings validation,
// which sso_oidc_settings_test.go already covers).
func enableSSOOnly(t *testing.T, st *store.Store) {
	t.Helper()
	issuer, clientID := "https://idp.example.com", "testpulse"
	oidcOnly := true
	if _, err := st.InstanceSettings.Update(context.Background(), domain.InstanceSettingsUpdate{
		OIDCIssuer: &issuer, OIDCClientID: &clientID, OIDCOnly: &oidcOnly,
	}); err != nil {
		t.Fatalf("arranging SSO-only settings: %v", err)
	}
	if err := st.InstanceSettings.SetOIDCClientSecret(context.Background(), []byte("encrypted-bytes")); err != nil {
		t.Fatalf("arranging SSO-only settings (secret): %v", err)
	}
}

func TestLoginRejectedWhenSSOOnlyEnabled(t *testing.T) {
	st := store.New(testutil.Pool(t, "identity_service"))
	s := service.New(st)
	mustCreateUser(t, s, "sso-only@example.com", "correcthorsebatterystaple1", false)
	enableSSOOnly(t, st)

	_, _, err := s.Login(context.Background(), "sso-only@example.com", "correcthorsebatterystaple1")
	if err == nil {
		t.Fatal("expected Login to reject correct credentials when SSO-only is enabled")
	}
}

func TestForgotPasswordNoOpsWhenSSOOnlyEnabled(t *testing.T) {
	st := store.New(testutil.Pool(t, "identity_service"))
	fm := &fakeMailer{}
	// Create the user first without SSO-only, since Login/CreateUser must
	// still work to set the account up at all.
	mustCreateUser(t, service.New(st), "reset-sso-only@example.com", "correcthorsebatterystaple1", false)
	enableSSOOnly(t, st)

	s := service.New(st).WithMailer(fm, "https://testpulse.example.com", true)
	if err := s.ForgotPassword(context.Background(), "reset-sso-only@example.com"); err != nil {
		t.Fatalf("ForgotPassword: %v", err)
	}
	if len(fm.sent) != 0 {
		t.Errorf("sent = %d emails, want 0 (SSO-only should no-op)", len(fm.sent))
	}
}

func TestResetPasswordRejectsWhenSSOOnlyEnabled(t *testing.T) {
	st := store.New(testutil.Pool(t, "identity_service"))
	fm := &fakeMailer{}
	base := service.New(st).WithMailer(fm, "https://testpulse.example.com", true)
	mustCreateUser(t, base, "reset-token-sso-only@example.com", "correcthorsebatterystaple1", false)

	// Issue a valid token before SSO-only is enabled.
	if err := base.ForgotPassword(context.Background(), "reset-token-sso-only@example.com"); err != nil {
		t.Fatalf("ForgotPassword: %v", err)
	}
	token := extractToken(t, fm.sent[0].body)
	enableSSOOnly(t, st)

	s := service.New(st)
	if err := s.ResetPassword(context.Background(), token, "brand-new-password1"); err == nil {
		t.Fatal("expected ResetPassword to reject a valid token when SSO-only is enabled")
	}
}
