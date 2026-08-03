## Context

`add-user-profile` shipped `User.AvatarKey`, a closed allowlist
(`domain.AvatarPresetKeys`, 23 Wikimedia Commons portraits) plus a
generated initial-on-color fallback when unset. The `Avatar.tsx`
component is the single rendering path used everywhere identity
appears (header, Profile, People, Project Members, run-item assignees,
result History) — it resolves `avatarKey` to a bundled static image or
falls back to the generated chip. This change adds a third source: a
photo the user uploads themselves, stored server-side rather than
shipped as a static asset.

TestPulse is a single-binary modular monolith with no object storage
dependency today (`docs/architecture` / CLAUDE.md's architecture
constraints) — the storage decision below is scoped to fit that,
not to introduce one.

## Goals / Non-Goals

**Goals:**
- A user can upload a photo, have it become their avatar everywhere
  their identity already renders, and remove it (reverting to the
  generated default) — all self-service, no admin involvement.
- Uploaded images are validated and normalized server-side so a
  malformed or hostile file can't reach storage or downstream
  renderers unprocessed.
- No new infrastructure dependency (no S3/GCS, no extra service).

**Non-Goals (v1):**
- Client-side interactive cropping UI. v1 does a server-side center
  crop to square; if the result looks wrong, the user re-uploads a
  differently-framed photo. An interactive cropper is a reasonable
  follow-up, not required to ship this.
- Multiple/historical avatars per user — one current image, replacing
  on re-upload, same as how a preset selection replaces the previous
  one today.
- Content moderation (automated or admin-review) of uploaded images —
  same trust model as display name today (self-service, no approval
  step). See Open Questions.
- Animated formats (GIF/WebP-animated) — static JPEG/PNG/WebP only.

## Decisions

**Storage: `bytea` in a dedicated `user_avatars` table, not a column
on `users`.** Every existing query that lists or fetches users
(`PeoplePage`, project member pickers, assignee dropdowns) selects
from `users` without wanting image bytes along for the ride. A
separate one-row-per-user table keeps those queries unchanged and
makes the image fetch an explicit, separate query
(`GET /api/v1/users/{id}/avatar`) that the frontend already does
naturally by pointing an `<img src>` at a URL. Alternative considered:
object storage (S3-compatible) — rejected as a new infrastructure
dependency for what's a few KB per user at the sizes this stores;
revisit only if avatar volume/size ever makes Postgres storage a real
problem (see Risks).

**`AvatarKey` gains a reserved sentinel value, `"custom"`, rather than
a separate discriminator column.** `AvatarPresetKeys` already answers
"is this a known preset key"; adding one more reserved string that
means "look up `user_avatars` for this user's id" keeps every
consumer's logic as a single three-way branch (`unset → generated
default`, `known preset key → static asset`, `"custom" → fetch
uploaded image`) instead of introducing a second field that has to
stay in sync with the first. Alternative considered: a separate
`avatar_type` enum column (`none`/`preset`/`custom`) — rejected as
redundant state that duplicates what `AvatarKey` already distinguishes
and can drift out of sync with it.

**Processing pipeline runs entirely server-side, in this order:** (1)
reject if `Content-Length` exceeds 500KB, before decoding anything —
bounds worst-case memory/CPU from a hostile upload; (2) sniff the real
file type from magic bytes (not the client-declared `Content-Type`
header, which is trivially spoofable) and reject anything outside
JPEG/PNG/WebP; (3) decode with Go's standard `image/jpeg`,
`image/png`, `golang.org/x/image/webp` decoders (well-audited stdlib
paths, not a shelled-out tool); (4) honor EXIF orientation before
cropping, so photos taken on phones don't end up sideways; (5)
center-crop to square, resize to 128×128 (matching the preset
convention — every consumer already expects that size); (6) re-encode
as JPEG regardless of input format and discard the original bytes —
this both strips any embedded metadata/exploit payload and means
`user_avatars.content_type` is always `image/jpeg`, simplifying
serving.

**Serving via `GET /api/v1/users/{id}/avatar`, authenticated like the
rest of the API, with `ETag`/`Cache-Control` derived from
`updated_at`.** No new authorization rule is needed beyond "the
requester is authenticated" — a user's avatar is already visible to
any authenticated teammate via People/assignee surfaces today, so this
endpoint has the same visibility as the data it's replacing.

**Removal (`DELETE /api/v1/users/me/avatar`) deletes the
`user_avatars` row and clears `AvatarKey` back to unset**, falling
back to the generated default — the same end state as "no avatar
selected" today, so no new fallback logic is needed in `Avatar.tsx`
beyond the new `"custom"` branch.

**Upload UI (Pepe design review, `avatar-upload-design.html` mock):**
one tile slot, not a separate control bolted onto the existing preset
grid. Empty, it's a dashed `size-10` circle `<button>` — same size as
every preset tile — sitting second in the avatar row, right after the
generated-default tile and ahead of all 23 presets. Selecting a file
uploads immediately (no confirm click, since there's nothing to adjust
before the server-side crop happens); the tile shows a spinner during
upload with **no raw-file preview**, since a preview would visually
imply an adjustment step v1 doesn't have. Once set, that same slot
renders the uploaded photo and becomes a real `<input
type="radio" value="custom">` joining the radiogroup — a genuine
selectable choice, not a second-class control — alongside a
plain-text "Remove" action (not the app's destructive-confirm-dialog
pattern used for Roles/People deletion: removing your own avatar is a
one-click, no-data-loss reversal, a different risk class). Validation
errors (wrong type, over the size cap) reuse the soft-tint callout
formula `docs/design-system.md` already established for the case-
detail expected-result box, but in `--destructive` rather than
`--primary` since this is a genuine failure — icon + short title in
red, explanation in regular foreground so it reads as routine and
self-correctable rather than alarming.

**Sample Project: no synthetic uploaded photo for the bootstrap
admin.** The standing rule (CLAUDE.md) is to update the Sample Project
showroom for user-facing changes, but this capability's entire value
is "your own photo" — seeding a canned stock image doesn't
demonstrate anything the existing preset system doesn't already show,
and would require bundling an extra binary asset purely to exercise a
code path. The bootstrap admin keeps its existing `grace-hopper`
preset. Recorded here (and as an explicit tasks.md item) rather than
silently skipped, per the standing rule's intent.

## Risks / Trade-offs

- **DB growth**: every custom avatar adds a fixed ~5–15KB row (128×128
  JPEG) to `user_avatars`, included in every backup/WAL. → Mitigation:
  the 500KB pre-processing cap and fixed 128×128 output bound this
  tightly regardless of what's uploaded; revisit storage location only
  if user counts make this a measurable problem.
- **Malicious upload (decompression bombs, parser exploits)** → 
  Mitigation: size cap before decode, stdlib decoders only, full
  re-encode (never storing or serving pass-through original bytes).
- **No moderation**: a user could upload an inappropriate image with
  no admin review gate. → Accepted for v1, same trust model as display
  name; flagged as an Open Question below in case this needs to change
  before general release.

## Migration Plan

Single additive migration: new `user_avatars` table
(`user_id` PK/FK → `users.id` cascade-delete, `image bytea not null`,
`content_type text not null`, `updated_at timestamptz not null`). No
change to the existing `users` table or any existing row. Rollback is
`DROP TABLE user_avatars` — no data outside that table is touched.

## Open Questions

- Should an admin be able to remove another user's custom avatar
  (moderation override) without waiting for a future admin-tooling
  change? Leaning no for v1 — flag for a follow-up if abuse turns out
  to be a real problem, not a hypothetical one.
