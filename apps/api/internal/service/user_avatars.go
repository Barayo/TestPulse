package service

import (
	"context"
	"errors"
	"time"

	"github.com/Barayo/TestPulse/apps/api/internal/avatarimage"
	"github.com/Barayo/TestPulse/apps/api/internal/domain"
)

// customAvatarKey is the reserved AvatarKey sentinel meaning "this user has
// an uploaded photo — look it up in user_avatars" (add-custom-avatar-upload
// design.md). Never accepted as a client-supplied value in UpdateOwnProfile;
// only UpdateOwnAvatar may set it, after actually storing the image.
const customAvatarKey = "custom"

// UpdateOwnAvatar validates and processes an uploaded photo (size, format,
// center-crop, resize — see avatarimage.ProcessAvatarUpload), stores it for
// the actor's own user row, and marks their profile as using it.
func (s *Service) UpdateOwnAvatar(ctx context.Context, actor domain.Actor, data []byte) (domain.User, error) {
	if actor.Kind != domain.ActorKindUser {
		return domain.User{}, invalid("only a human user has a profile to update")
	}

	processed, err := avatarimage.ProcessAvatarUpload(data)
	if errors.Is(err, avatarimage.ErrTooLarge) || errors.Is(err, avatarimage.ErrUnsupportedFormat) {
		return domain.User{}, invalid("%s", err)
	}
	if err != nil {
		return domain.User{}, err
	}

	if err := s.store.UserAvatars.Put(ctx, actor.ID, processed, "image/jpeg"); err != nil {
		return domain.User{}, err
	}

	key := customAvatarKey
	user, err := s.store.Users.UpdateProfile(ctx, actor.ID, domain.UserProfileUpdate{AvatarKey: &key})
	if err != nil {
		return domain.User{}, err
	}
	s.audit(ctx, "upload_avatar", "user", actor.ID)
	return user, nil
}

// RemoveOwnAvatar deletes the actor's stored custom avatar, if any, and
// clears their AvatarKey back to unset — the same end state as never having
// set one, so Avatar.tsx falls back to the generated default with no
// further changes needed.
func (s *Service) RemoveOwnAvatar(ctx context.Context, actor domain.Actor) (domain.User, error) {
	if actor.Kind != domain.ActorKindUser {
		return domain.User{}, invalid("only a human user has a profile to update")
	}

	if err := s.store.UserAvatars.Delete(ctx, actor.ID); err != nil {
		return domain.User{}, err
	}
	user, err := s.store.Users.ClearAvatarKey(ctx, actor.ID)
	if err != nil {
		return domain.User{}, err
	}
	s.audit(ctx, "remove_avatar", "user", actor.ID)
	return user, nil
}

// GetUserAvatar returns the raw stored image bytes, content type, and
// last-updated time for the given user id — served by
// GET /api/v1/users/{id}/avatar. Any authenticated actor may look up any
// user's avatar (design.md: same visibility as the People/assignee
// surfaces that already show it), so this takes no actor parameter to
// authorize against.
func (s *Service) GetUserAvatar(ctx context.Context, userID string) ([]byte, string, time.Time, error) {
	return s.store.UserAvatars.Get(ctx, userID)
}
