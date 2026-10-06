package service_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/Barayo/TestPulse/apps/api/internal/domain"
	"github.com/Barayo/TestPulse/apps/api/internal/service"
)

func readAvatarFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("..", "avatarimage", "testdata", name))
	if err != nil {
		t.Fatalf("reading avatarimage testdata/%s: %v", name, err)
	}
	return data
}

func TestUpdateOwnAvatarProcessesStoresAndSetsCustomKey(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "photo@example.com", "correcthorse", false)
	actor := actorFor(u)

	updated, err := s.UpdateOwnAvatar(context.Background(), actor, readAvatarFixture(t, "sample.jpg"))
	if err != nil {
		t.Fatalf("UpdateOwnAvatar: %v", err)
	}
	if updated.AvatarKey == nil || *updated.AvatarKey != "custom" {
		t.Errorf("AvatarKey = %v, want \"custom\"", updated.AvatarKey)
	}
}

func TestUpdateOwnAvatarRejectsInvalidUpload(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "badphoto@example.com", "correcthorse", false)
	actor := actorFor(u)

	_, err := s.UpdateOwnAvatar(context.Background(), actor, readAvatarFixture(t, "not-an-image.txt"))
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("err = %v, want ValidationError", err)
	}
}

func TestUpdateOwnAvatarRejectsNonUserActor(t *testing.T) {
	s := testService(t)
	agentActor := domain.Actor{ID: "tok-1", Kind: domain.ActorKindAgent, DisplayName: "CI bot"}

	_, err := s.UpdateOwnAvatar(context.Background(), agentActor, readAvatarFixture(t, "sample.jpg"))
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("err = %v, want ValidationError", err)
	}
}

func TestRemoveOwnAvatarClearsCustomKeyAndFallsBackToGeneratedDefault(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "removeme@example.com", "correcthorse", false)
	actor := actorFor(u)
	if _, err := s.UpdateOwnAvatar(context.Background(), actor, readAvatarFixture(t, "sample.jpg")); err != nil {
		t.Fatalf("UpdateOwnAvatar: %v", err)
	}

	updated, err := s.RemoveOwnAvatar(context.Background(), actor)
	if err != nil {
		t.Fatalf("RemoveOwnAvatar: %v", err)
	}
	if updated.AvatarKey != nil {
		t.Errorf("AvatarKey = %v, want nil (generated default)", updated.AvatarKey)
	}
}

func TestRemoveOwnAvatarWithNoneSetIsNotAnError(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "neveruploaded@example.com", "correcthorse", false)
	actor := actorFor(u)

	if _, err := s.RemoveOwnAvatar(context.Background(), actor); err != nil {
		t.Fatalf("RemoveOwnAvatar with none set: %v", err)
	}
}

func TestRemoveOwnAvatarRejectsNonUserActor(t *testing.T) {
	s := testService(t)
	agentActor := domain.Actor{ID: "tok-1", Kind: domain.ActorKindAgent, DisplayName: "CI bot"}

	_, err := s.RemoveOwnAvatar(context.Background(), agentActor)
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("err = %v, want ValidationError", err)
	}
}

// UpdateOwnProfile must never accept "custom" as a client-supplied
// avatarKey — it is a reserved sentinel only the upload path may set
// (add-custom-avatar-upload design.md).
func TestUpdateOwnProfileRejectsCustomAsClientSuppliedAvatarKey(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "sneaky@example.com", "correcthorse", false)
	actor := actorFor(u)
	custom := "custom"

	_, err := s.UpdateOwnProfile(context.Background(), actor, domain.UserProfileUpdate{AvatarKey: &custom})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("err = %v, want ValidationError", err)
	}
}

// UpdateOwnProfile rejects an unsupported Language value (add-ui-i18n
// design.md D4), the same validation shape as AvatarKey above.
func TestUpdateOwnProfileRejectsUnsupportedLanguage(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "bad-lang@example.com", "correcthorse", false)
	actor := actorFor(u)
	lang := "klingon"

	_, err := s.UpdateOwnProfile(context.Background(), actor, domain.UserProfileUpdate{Language: &lang})
	var verr *service.ValidationError
	if !errors.As(err, &verr) {
		t.Errorf("err = %v, want ValidationError", err)
	}
}

func TestUpdateOwnProfileAppliesSupportedLanguage(t *testing.T) {
	s := testService(t)
	u := mustCreateUser(t, s, "good-lang@example.com", "correcthorse", false)
	actor := actorFor(u)
	lang := "de"

	got, err := s.UpdateOwnProfile(context.Background(), actor, domain.UserProfileUpdate{Language: &lang})
	if err != nil {
		t.Fatalf("UpdateOwnProfile: %v", err)
	}
	if got.Language == nil || *got.Language != "de" {
		t.Errorf("Language = %v, want \"de\"", got.Language)
	}
}
