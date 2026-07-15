## Why

There is no self-service profile today. The header shows a user's raw
email as plain text (no avatar, no link anywhere), and `/settings/tokens`
and `/settings/users` both already exist and work but have zero
navigational entry point — they're only reachable by typing the URL.
Design review (2026-07-15) surfaced this while discussing GitHub issues
#36 ("Add Profile section") and #37 ("Review the user visualization in
the header") — merged into one change since #37 can't ship without #36's
avatar field existing, and both will be implemented together.

## What Changes

- Adds a self-service Profile page (`/settings/profile`) where a user can
  set: display name, an avatar (chosen from a small preset gallery — see
  design.md), and a timezone (IANA identifier).
- Adds `PATCH /api/v1/users/me` for a user to update their own profile
  fields (display name, avatar, timezone) — distinct from the existing
  admin-only user management (`UsersPage.tsx`/`PATCH /api/v1/users/{id}`).
- The header's plain-email text becomes an avatar (generated
  initial-on-background by default, or the chosen preset), which is now
  a link to the Profile page — the first real doorway into Settings.
- Profile page also links out to the two already-existing, previously
  orphaned settings pages (Tokens, and Users for admins), and includes a
  placeholder pointing at password change — not implemented yet, no
  password-change endpoint exists today; noted so the page doesn't look
  incomplete when that ships later.

## Explicitly Out of Scope

- **Custom photo upload.** Preset avatars only — shipped as static
  bundled assets (like `assets/brand/`), not stored in the database.
  Upload (and the hash-addressed blob storage + resize pipeline it would
  need) is a real future step, deliberately deferred — nothing here
  should require a rework to add it later.
- **Colour palette.** Overlaps existing backlog items #1 (admin
  theme) and #27 (light/dark toggle); not folded in here.
- **Password change/reset.** No endpoint exists yet; the Profile page
  reserves a spot for it but doesn't implement it.
- **Timezone actually changing any rendered timestamp.** No absolute
  (non-relative) timestamp exists anywhere in the UI today
  (`timeAgo.ts` is relative-only) — storing the preference now, wiring
  it into a renderer is future work once one exists.

## Impact

- Affected specs: `authentication` (new "Self-service profile"
  requirement), `ui-navigation` (header avatar replaces email/links to
  profile).
- Affected code: `apps/api/internal/domain` (User gains DisplayName,
  AvatarKey, Timezone), `apps/api/internal/service`,
  `apps/api/internal/db/migrations` (amend `users` table, pre-1.0
  policy), `packages/shared/openapi.yaml` (`PATCH /api/v1/users/me`),
  `apps/web/src/pages` (new ProfilePage), `apps/web/src/App.tsx` (header
  avatar), new avatar asset files.
- Closes GitHub #36 and #37 (merged into this one change).
