## Context

Merges GitHub #36 ("Add Profile section") and #37 ("Review the user
visualization in the header") into one change — #37 can't ship without
#36's avatar field existing, and they'll be implemented together.

Read the actual code before scoping this (2026-07-15): `User` today is
`{ID, Email, Role, DeactivatedAt, CreatedAt}` — no display name, no
avatar, no timezone. The header renders `{user.email}` as plain text.
`/settings/tokens` (self-service, already works) and `/settings/users`
(admin-only, already works) both exist but nothing in the app links to
either — they're only reachable by typing the URL.

## Goals / Non-Goals

**Goals:**
- A self-service Profile page a user can actually find (via the header).
- Enough profile substance (display name, avatar, timezone) to be worth
  building now, without taking on work only a *future* feature needs.
- Leave a clean seam for the features this is really in service of —
  token management (exists, just needs linking to) and password
  change (doesn't exist yet) — without building them now.
- A single `Avatar` rendering path used everywhere a person's identity
  already appears — PeoplePage, ProjectMembersPage, run-item assignee
  chips, and user-attributed result History entries — not just the
  header/Profile page, so a chosen preset propagates consistently
  instead of only showing where it was set.

**Non-Goals:**
- Custom photo upload. Would require picking a storage answer for the
  first time in this project (no blob/file storage exists anywhere in
  the stack today) — a real architectural decision, not incidental to
  this change, so it's deliberately deferred rather than smuggled in.
- Colour palette — overlaps backlog #1/#27, not resolved here.
- Password change/reset — no endpoint exists; out of scope, but the
  Profile page's layout reserves a spot so it doesn't look unfinished
  when that ships.
- Timezone actually changing any rendered timestamp — nothing in the UI
  renders an absolute timestamp today (`timeAgo.ts` is relative-only).
  Storing the preference now is cheap; wiring it into a renderer is
  future work once one exists that needs it.

## Decisions

**Avatars are static bundled assets, not database rows.** A fixed,
curated set of ~12 preset portraits — historical scientists and
"verification"-adjacent figures (Ada Lovelace, Alan Turing, Grace
Hopper — who coined "debugging" — Marie Curie, Charles Darwin, Katherine
Johnson, etc.), sourced from Wikimedia Commons with each image's license
(public domain vs. CC-BY-SA, attribution requirements) checked
individually at implementation time. Shipped the same way
`assets/brand/` is — files in the repo, referenced by a plain string
key. `users.avatar_key` is `text NULL` (e.g. `'ada-lovelace'`), not a
foreign key into any blob table. No resize pipeline, no hash-addressed
storage, no upload endpoint — none of that machinery is needed because
nothing is ever uploaded. That machinery becomes real, separable future
work the day custom photo upload is built; nothing here should require
reworking to add it later, since `avatar_key` can simply start
resolving to either a preset or an uploaded-blob reference without a
schema change to the column itself.

**Default avatar (no `avatar_key` set) is a generated initial-on-color,
computed client-side, not stored.** Same GitHub/Slack pattern — first
letter of display name (or email if no display name), background color
deterministically derived from hashing the user id, so it's stable
across sessions without needing a database column for it.

**`Avatar` is the single rendering path for user identity app-wide, not
header-only.** `PeoplePage.tsx` and `ProjectMembersPage.tsx` already
render identity via the generated-color `avatarStyle`/`initialsFor`
helpers (no per-user customization); the run-item assignee chips added
by `link-run-item-assignee-to-identity` use the same helpers. All
switch to `Avatar` so a chosen preset (or the generated fallback) is
consistent everywhere. This also covers `RunItemDetailPage.tsx`'s
result History list: an entry already carries `actorKind`/`actorRefId`,
so one where `actorKind === 'user'` can resolve and show that user's
current `Avatar` the same way an assignee does — entries with
`actorKind: 'agent'`/`'unknown'`, or where the "record on behalf of"
free-text override was used, have no real user to key an avatar off
and keep today's plain-text treatment (a distinct agent/bot icon is a
separate design decision, not folded in here). Team identity has no
`avatar_key` in this proposal and keeps its existing generated-color
square chip everywhere, unchanged.

**Rejected: TV/comics-character avatars.** Considered and explicitly
rejected — those are trademarked/copyrighted IP regardless of the
specific image file's own license; using them in a redistributed
open-source app is a real exposure, not a style preference.

**`PATCH /api/v1/users/me` is a new, separate endpoint from
`PATCH /api/v1/users/{id}`.** The existing admin endpoint
(`UsersPage.tsx`) manages *other* users' role/deactivation — a
different authorization shape (admin-only, any target user) from a
user editing their own display name/avatar/timezone (any authenticated
user, self only, no role fields touchable). Reusing one endpoint for
both would mean every self-edit request carries an implicit "am I
editing myself or someone else" branch — cleaner to keep them as two
routes with two different authorization rules from the start.

**Timezone stored as an IANA identifier string** (e.g.
`"Europe/Madrid"`), not a UTC offset — offsets don't survive DST
transitions correctly; IANA zone names are the only representation that
does.

## Risks / Trade-offs

- Twelve avatars is a small gallery — acceptable for v1 given the
  explicit goal of "pick one, not curate an infinite closet"; expanding
  the set later is just adding more static files, no migration.
- Wikimedia sourcing/licensing is left as implementation-time work
  rather than nailed down here — each image needs its own license check
  (public domain vs. CC-BY-SA has different attribution obligations),
  which is mechanical verification, not a design decision.

## Open Questions

None outstanding.
