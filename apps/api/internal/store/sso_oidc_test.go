package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestUserCreateSSOHasNoPasswordHash(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	u, err := s.Users.CreateSSO(ctx, "sso@example.com", "subject-123")
	if err != nil {
		t.Fatalf("CreateSSO: %v", err)
	}
	if u.Email != "sso@example.com" {
		t.Errorf("Email = %q, want sso@example.com", u.Email)
	}

	got, hash, err := s.Users.GetByEmailWithHash(ctx, "sso@example.com")
	if err != nil {
		t.Fatalf("GetByEmailWithHash: %v", err)
	}
	if got.ID != u.ID {
		t.Errorf("got.ID = %q, want %q", got.ID, u.ID)
	}
	if hash != "" {
		t.Errorf("hash = %q, want empty for an SSO-provisioned account", hash)
	}
}

func TestUserGetByOIDCSubject(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()

	created, err := s.Users.CreateSSO(ctx, "found-me@example.com", "subject-abc")
	if err != nil {
		t.Fatalf("CreateSSO: %v", err)
	}

	got, ok, err := s.Users.GetByOIDCSubject(ctx, "subject-abc")
	if err != nil {
		t.Fatalf("GetByOIDCSubject: %v", err)
	}
	if !ok {
		t.Fatal("GetByOIDCSubject: ok = false, want true")
	}
	if got.ID != created.ID {
		t.Errorf("got.ID = %q, want %q", got.ID, created.ID)
	}
}

func TestUserGetByOIDCSubjectNotFound(t *testing.T) {
	s := testStore(t)
	_, ok, err := s.Users.GetByOIDCSubject(context.Background(), "no-such-subject")
	if err != nil {
		t.Fatalf("GetByOIDCSubject: %v", err)
	}
	if ok {
		t.Error("ok = true, want false for an unknown subject")
	}
}

func TestUserLinkOIDCSubjectBackfillsExistingAccount(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "existing@example.com", false)

	if err := s.Users.LinkOIDCSubject(ctx, u.ID, "subject-xyz"); err != nil {
		t.Fatalf("LinkOIDCSubject: %v", err)
	}

	got, ok, err := s.Users.GetByOIDCSubject(ctx, "subject-xyz")
	if err != nil {
		t.Fatalf("GetByOIDCSubject: %v", err)
	}
	if !ok || got.ID != u.ID {
		t.Errorf("got = %+v, ok = %v, want linked to %q", got, ok, u.ID)
	}
}

func TestUserLinkOIDCSubjectRefusesToOverwriteExisting(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "already-linked@example.com", false)

	if err := s.Users.LinkOIDCSubject(ctx, u.ID, "subject-first"); err != nil {
		t.Fatalf("first LinkOIDCSubject: %v", err)
	}

	err := s.Users.LinkOIDCSubject(ctx, u.ID, "subject-second")
	if !errors.Is(err, store.ErrOIDCSubjectAlreadyLinked) {
		t.Errorf("err = %v, want ErrOIDCSubjectAlreadyLinked", err)
	}

	got, ok, err := s.Users.GetByOIDCSubject(ctx, "subject-first")
	if err != nil {
		t.Fatalf("GetByOIDCSubject: %v", err)
	}
	if !ok || got.ID != u.ID {
		t.Errorf("account should still be linked to its original subject after a rejected rebind attempt")
	}
}

func TestUserLinkOIDCSubjectUnknownUser(t *testing.T) {
	s := testStore(t)
	err := s.Users.LinkOIDCSubject(context.Background(), "00000000-0000-0000-0000-000000000000", "subject-none")
	if err != store.ErrNotFound {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}
