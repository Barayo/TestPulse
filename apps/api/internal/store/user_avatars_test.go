package store_test

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/store"
)

func TestUserAvatarsPutGetDelete(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "avatar-owner@example.com", false)

	if _, _, _, err := s.UserAvatars.Get(ctx, u.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("Get before Put: got err %v, want ErrNotFound", err)
	}

	image := []byte{0xFF, 0xD8, 0xFF, 0x00, 0x01, 0x02}
	if err := s.UserAvatars.Put(ctx, u.ID, image, "image/jpeg"); err != nil {
		t.Fatalf("Put: %v", err)
	}

	gotImage, gotContentType, updatedAt, err := s.UserAvatars.Get(ctx, u.ID)
	if err != nil {
		t.Fatalf("Get after Put: %v", err)
	}
	if !bytes.Equal(gotImage, image) {
		t.Errorf("image = %v, want %v", gotImage, image)
	}
	if gotContentType != "image/jpeg" {
		t.Errorf("contentType = %q, want %q", gotContentType, "image/jpeg")
	}
	if updatedAt.IsZero() {
		t.Error("updatedAt is zero, want a real timestamp")
	}

	// Put again replaces the row (one avatar per user), not a second row.
	replacement := []byte{0xFF, 0xD8, 0xFF, 0x99}
	if err := s.UserAvatars.Put(ctx, u.ID, replacement, "image/jpeg"); err != nil {
		t.Fatalf("Put (replace): %v", err)
	}
	gotImage, _, _, err = s.UserAvatars.Get(ctx, u.ID)
	if err != nil {
		t.Fatalf("Get after replace: %v", err)
	}
	if !bytes.Equal(gotImage, replacement) {
		t.Errorf("image after replace = %v, want %v", gotImage, replacement)
	}

	if err := s.UserAvatars.Delete(ctx, u.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, _, _, err := s.UserAvatars.Get(ctx, u.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("Get after Delete: got err %v, want ErrNotFound", err)
	}
}

func TestUserAvatarsDeleteOfMissingAvatarIsNotAnError(t *testing.T) {
	s := testStore(t)
	ctx := context.Background()
	u := mustUser(t, s, "no-avatar@example.com", false)

	if err := s.UserAvatars.Delete(ctx, u.ID); err != nil {
		t.Fatalf("Delete with no avatar set: %v", err)
	}
}
