## Why

As a user, when I set up my profile, I want to use my own photo as my
avatar instead of picking from a fixed set of historical figures, so
that my identity in TestPulse actually looks like me. `add-user-profile`
shipped a 23-image preset gallery (Wikimedia Commons portraits) plus a
generated initial-on-color fallback, but no way to upload a real photo
— the natural next request once someone opens the avatar picker and
doesn't see themselves in it.

## What Changes

- Adds `POST /api/v1/users/me/avatar` (multipart upload) and
  `DELETE /api/v1/users/me/avatar` for a user to set/clear a custom
  photo avatar, and `GET /api/v1/users/{id}/avatar` to serve the
  stored image bytes (cacheable, content-addressed).
- Server-side validates content type (JPEG/PNG/WebP only), rejects
  uploads over 500KB pre-processing, then center-crops to square and
  resizes to 128×128 before storing — matching the existing preset
  convention so no downstream rendering code needs to know which kind
  of avatar it's looking at.
- Stores the processed image as `bytea` in a new `user_avatars` table
  (one row per user, not a column on `users`) so the common case of
  fetching a user's profile/list never pulls image bytes along with
  it.
- `User.AvatarKey` (currently a closed preset-key allowlist) gains a
  third state alongside "a known preset key" and "unset/generated
  default": `"custom"`, meaning "look up the uploaded image for this
  user". The `Avatar` component and every surface that already renders
  it (header, Profile, People, Project Members, run-item assignees,
  result History) resolve this the same way they resolve a preset key
  today — no per-surface changes needed beyond `Avatar.tsx` itself.
- Profile page's avatar picker gains an "Upload a photo" option
  alongside the 23 presets and the generated-default tile.

## Capabilities

### New Capabilities
(none — this extends the existing self-service profile and avatar-
rendering requirements rather than introducing a new capability)

### Modified Capabilities
- `authentication`: the "Self-service profile" requirement gains a
  custom-avatar-upload scenario alongside the existing preset-avatar
  scenario, plus upload validation (file type, size cap) and removal
  scenarios.
- `ui-navigation`: the "Chosen avatar is shown everywhere a person's
  identity appears" requirement is reworded from "preset or generated
  default" to cover the third case (custom upload) — same rendering
  surfaces, no new ones.

## Impact

- **API**: two new endpoints (`POST`/`DELETE .../me/avatar`), one new
  read endpoint (`GET /api/v1/users/{id}/avatar`); `packages/shared/openapi.yaml`
  updated, `make generate` re-run.
- **DB**: new migration adding `user_avatars` (userId PK/FK, `image
  bytea`, `content_type text`, `updated_at timestamptz`) — no change
  to the existing `users` table.
- **Domain**: `AvatarKey` handling in `domain.go` gains the `"custom"`
  sentinel; `AvatarPresetKeys` allowlist logic needs a small branch for
  it in `UpdateOwnProfile`.
- **Frontend**: `Avatar.tsx` gains a third render path; `ProfilePage.tsx`'s
  avatar picker gains an upload control (file input + crop-preview);
  no changes needed in `PeoplePage.tsx`, `ProjectMembersPage.tsx`,
  `RunPage.tsx`, `RunItemDetailPage.tsx` — they already just pass
  `avatarKey` through to `Avatar.tsx`.
- **Sample Project**: out of scope — seeding a synthetic uploaded photo
  for the bootstrap admin isn't meaningful (see design.md); the
  existing preset-avatar seeding is untouched.
