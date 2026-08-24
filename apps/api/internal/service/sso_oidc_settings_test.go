package service_test

import (
	"context"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
	"github.com/Barayo/TestPulse/apps/api/internal/store"
	"github.com/Barayo/TestPulse/apps/api/internal/testutil"
)

func testServiceWithEncryptionKey(t *testing.T, key string) (*service.Service, *store.Store) {
	t.Helper()
	st := store.New(testutil.Pool(t, "identity_service"))
	return service.New(st).WithEncryptionKey(key), st
}

func TestUpdateInstanceSettingsRejectsClientSecretWithoutEncryptionKey(t *testing.T) {
	s, _ := testServiceWithEncryptionKey(t, "")
	secret := "shh"
	_, err := s.UpdateInstanceSettings(context.Background(), domain.InstanceSettingsUpdate{OIDCClientSecret: &secret})
	if err == nil {
		t.Fatal("expected error saving a client secret with no encryption key configured")
	}
}

func TestUpdateInstanceSettingsEncryptsClientSecretAtRest(t *testing.T) {
	s, st := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	ctx := context.Background()
	secret := "my-oidc-client-secret"

	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{OIDCClientSecret: &secret}); err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}

	settings, err := s.InstanceSettings(ctx)
	if err != nil {
		t.Fatalf("InstanceSettings: %v", err)
	}
	if !settings.OIDCClientSecretSet {
		t.Error("OIDCClientSecretSet = false, want true")
	}

	stored, err := st.InstanceSettings.GetOIDCClientSecret(ctx)
	if err != nil {
		t.Fatalf("GetOIDCClientSecret: %v", err)
	}
	if string(stored) == secret {
		t.Error("stored secret equals plaintext — not encrypted")
	}
}

func TestUpdateInstanceSettingsDisableOIDCClearsSettings(t *testing.T) {
	s, _ := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	ctx := context.Background()
	secret := "my-oidc-client-secret"
	issuer := "https://idp.example.com"
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{OIDCIssuer: &issuer, OIDCClientSecret: &secret}); err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}

	disable := true
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{DisableOIDC: &disable}); err != nil {
		t.Fatalf("UpdateInstanceSettings(disable): %v", err)
	}

	settings, err := s.InstanceSettings(ctx)
	if err != nil {
		t.Fatalf("InstanceSettings: %v", err)
	}
	if settings.OIDCIssuer != "" || settings.OIDCClientSecretSet {
		t.Errorf("settings = %+v, want issuer/secret cleared", settings)
	}
}

func TestDecryptedOIDCClientSecretRoundTrips(t *testing.T) {
	s, _ := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	ctx := context.Background()
	secret := "my-oidc-client-secret"
	if _, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{OIDCClientSecret: &secret}); err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}

	got, ok, err := s.DecryptedOIDCClientSecret(ctx)
	if err != nil {
		t.Fatalf("DecryptedOIDCClientSecret: %v", err)
	}
	if !ok {
		t.Fatal("ok = false, want true")
	}
	if got != secret {
		t.Errorf("got = %q, want %q", got, secret)
	}
}

func TestUpdateInstanceSettingsRejectsSSOOnlyWithoutFullOIDCConfig(t *testing.T) {
	s, _ := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	oidcOnly := true
	_, err := s.UpdateInstanceSettings(context.Background(), domain.InstanceSettingsUpdate{OIDCOnly: &oidcOnly})
	if err == nil {
		t.Fatal("expected error enabling SSO-only with no issuer/client ID/secret configured")
	}
}

func TestUpdateInstanceSettingsAllowsSSOOnlyWhenFullyConfiguredInSameRequest(t *testing.T) {
	s, _ := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	ctx := context.Background()
	issuer, clientID, secret := "https://idp.example.com", "testpulse", "shh"
	oidcOnly := true
	_, err := s.UpdateInstanceSettings(ctx, domain.InstanceSettingsUpdate{
		OIDCIssuer: &issuer, OIDCClientID: &clientID, OIDCClientSecret: &secret, OIDCOnly: &oidcOnly,
	})
	if err != nil {
		t.Fatalf("UpdateInstanceSettings: %v", err)
	}
	settings, err := s.InstanceSettings(ctx)
	if err != nil {
		t.Fatalf("InstanceSettings: %v", err)
	}
	if !settings.OIDCOnly {
		t.Error("OIDCOnly = false, want true")
	}
}

func TestDecryptedOIDCClientSecretNotSet(t *testing.T) {
	s, _ := testServiceWithEncryptionKey(t, "a-real-encryption-key")
	_, ok, err := s.DecryptedOIDCClientSecret(context.Background())
	if err != nil {
		t.Fatalf("DecryptedOIDCClientSecret: %v", err)
	}
	if ok {
		t.Error("ok = true, want false when no secret has been set")
	}
}
