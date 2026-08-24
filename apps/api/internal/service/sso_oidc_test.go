package service

import (
	"testing"
	"time"
)

func TestSignAndVerifyOIDCState(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	state, err := signOIDCState("client-secret", "verifier-abc", "nonce-xyz", now.Add(10*time.Minute))
	if err != nil {
		t.Fatalf("signOIDCState: %v", err)
	}

	verifier, nonce, err := verifyOIDCState("client-secret", state, now)
	if err != nil {
		t.Fatalf("verifyOIDCState: %v", err)
	}
	if verifier != "verifier-abc" || nonce != "nonce-xyz" {
		t.Errorf("verifier = %q, nonce = %q", verifier, nonce)
	}
}

func TestVerifyOIDCStateRejectsExpired(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	state, err := signOIDCState("client-secret", "verifier-abc", "nonce-xyz", now.Add(-1*time.Minute))
	if err != nil {
		t.Fatalf("signOIDCState: %v", err)
	}

	if _, _, err := verifyOIDCState("client-secret", state, now); err == nil {
		t.Fatal("expected error for expired state")
	}
}

func TestVerifyOIDCStateRejectsTamperedPayload(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	state, err := signOIDCState("client-secret", "verifier-abc", "nonce-xyz", now.Add(10*time.Minute))
	if err != nil {
		t.Fatalf("signOIDCState: %v", err)
	}

	if _, _, err := verifyOIDCState("client-secret", state+"x", now); err == nil {
		t.Fatal("expected error for tampered state")
	}
}

func TestVerifyOIDCStateRejectsWrongSecret(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	state, err := signOIDCState("client-secret", "verifier-abc", "nonce-xyz", now.Add(10*time.Minute))
	if err != nil {
		t.Fatalf("signOIDCState: %v", err)
	}

	if _, _, err := verifyOIDCState("different-secret", state, now); err == nil {
		t.Fatal("expected error for a state signed with a different secret")
	}
}
