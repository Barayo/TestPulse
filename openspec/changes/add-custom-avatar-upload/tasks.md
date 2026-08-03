## 1. Database

- [x] 1.1 Write a new migration `apps/api/internal/db/migrations/NNNNN_add_user_avatars.sql`: `user_avatars` table (`user_id` PK/FK → `users.id` cascade-delete, `image bytea not null`, `content_type text not null`, `updated_at timestamptz not null`)
- [x] 1.2 Confirm goose applies it cleanly on a fresh DB and on top of the current `add-user-profile` schema

## 2. Backend: image processing pipeline (TDD)

- [x] 2.1 Write failing tests for a pure `ProcessAvatarUpload(data []byte) ([]byte, error)` helper: rejects >500KB input, rejects non-JPEG/PNG/WebP content (sniffed from magic bytes, not a trusted header), honors EXIF orientation, center-crops to square, resizes to 128×128, always re-encodes as JPEG
- [x] 2.2 Implement the helper using stdlib `image/jpeg`, `image/png`, `golang.org/x/image/webp` decoders — no shelled-out tools
- [x] 2.3 Confirm green

## 3. Backend: store + service (TDD)

- [x] 3.1 Write failing store tests: `UserAvatars.Put(ctx, userID, image, contentType)`, `UserAvatars.Get(ctx, userID) (image, contentType, updatedAt, error)`, `UserAvatars.Delete(ctx, userID)`
- [x] 3.2 Implement `apps/api/internal/store/user_avatars.go`
- [x] 3.3 Write failing service tests: `UpdateOwnAvatar` (runs the processing pipeline, stores the result, sets `User.AvatarKey = "custom"`), `RemoveOwnAvatar` (deletes the row, clears `AvatarKey`) — both reject non-user actors and enforce self-only scope, matching `UpdateOwnProfile`'s existing authorization pattern
- [x] 3.4 Extend `UpdateOwnProfile`'s avatar-key validation so `"custom"` is only ever set by the upload path, never accepted as a client-supplied `avatarKey` value in `PATCH /api/v1/users/me`
- [x] 3.5 Confirm green

## 4. Backend: HTTP handlers (TDD)

- [x] 4.1 Write failing handler tests for `POST /api/v1/users/me/avatar` (multipart upload; 400 on validation failure; 200 with updated user on success), `DELETE /api/v1/users/me/avatar`, `GET /api/v1/users/{id}/avatar` (200 with image bytes + `Content-Type` + `ETag`/`Cache-Control` from `updated_at`; 404 if no custom avatar stored; 304 on matching `If-None-Match`)
- [x] 4.2 Implement the three handlers and wire routes
- [x] 4.3 Update `packages/shared/openapi.yaml` (new endpoints, `User.avatarKey` doc note that `"custom"` is a reserved value); `make generate`; confirm no drift
- [x] 4.4 Confirm green

## 5. Frontend: Avatar rendering (TDD)

- [x] 5.1 Write failing tests extending `Avatar.test.tsx`: `avatarKey === 'custom'` renders an `<img>` pointed at `GET /api/v1/users/{id}/avatar` (component needs the user id, not just the key, for this branch — check call sites)
- [x] 5.2 Implement the third branch in `Avatar.tsx`
- [x] 5.3 Confirm green — turned out each call site (`PeoplePage.tsx`, `ProjectMembersPage.tsx`, `RunPage.tsx`, `RunItemDetailPage.tsx` ×2, `UserMenu.tsx`, `ProfilePage.tsx`) did have the user id available but wasn't yet passing it through as `userId` — wired all seven

## 6. Frontend: upload UI (TDD)

- [x] 6.1 Write failing tests extending `ProfilePage.test.tsx`, per the Pepe design (`avatar-upload-design.html`): an upload tile sits second in the avatar row (after generated-default, before the presets); selecting a valid file uploads immediately (no confirm step) and the tile becomes the selected radio choice; an oversized or wrong-type file is rejected client-side with an inline error and never calls the endpoint; a plain-text "Remove" action appears only once a custom avatar is set and calls the delete endpoint
- [x] 6.2 Implement the upload control in `ProfilePage.tsx`: a `<button>` tile while empty (dashed circle, `size-10` matching preset tiles) that swaps to a real `<input type="radio" value="custom">` once a custom avatar is set, so it stays part of the existing radiogroup; a spinner state during upload with no raw-file preview; the error callout uses the same soft-tint pattern as the case-detail expected-result box, in `--destructive`
- [x] 6.3 Confirm green — surfaced and fixed a real test race along the way: asserting with `getByRole` immediately after an unrelated `findByLabelText` doesn't wait for the `avatarKey`-sync effect (which runs post-mount) to flush; fixed by awaiting the state-dependent element directly via `findByRole`

## 7. Documentation and Sample Project

- [x] 7.1 Update `docs/api.md` and `docs/database.md` for the new endpoints and `user_avatars` table
- [x] 7.2 Sample Project: no change — record the decision (already reasoned in design.md) not to seed a synthetic uploaded photo for the bootstrap admin, since this capability's value is specifically "your own photo" and a canned image wouldn't showcase anything the existing preset system doesn't already demonstrate
- [x] 7.3 `openspec validate add-custom-avatar-upload --strict` and `openspec validate --specs` both pass

## 8. End-to-end

- [x] 8.1 Add an e2e scenario (`apps/web/e2e/`) covering: upload a photo on the Profile page → avatar appears in the header → remove it → generated default returns, titled with the requirement/scenario name per project convention
