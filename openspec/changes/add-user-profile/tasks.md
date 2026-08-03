## 1. Contract first

- [x] 1.1 Add `displayName`, `avatarKey`, `timezone` (all optional) to the `User` schema in `packages/shared/openapi.yaml`
- [x] 1.2 Add `PATCH /api/v1/users/me` (body: displayName?, avatarKey?, timezone?; returns updated `User`) to the contract, distinct from the existing admin `PATCH /api/v1/users/{id}`
- [x] 1.3 `make generate`, confirm no drift

## 2. Avatar assets

- [x] 2.1 Sourced 12 preset portraits from Wikimedia Commons, each individually license-checked — see `assets/avatars/ATTRIBUTION.md` for the full table (source, license, attribution requirement per image). Rosalind Franklin (originally proposed in design.md) was dropped after research turned up genuinely unclear/disputed copyright status on her best-known photographs; substituted Emmy Noether (clean public domain, pre-1910, anonymous author).
- [x] 2.2 Master images (512×512, square-cropped — top-aligned for straightforward bust portraits, a manually chosen region for the three full-figure sources where a naive crop would miss the face) at `assets/avatars/<key>.jpg`; web-bundled copies (128×128) at `apps/web/src/assets/avatars/<key>.jpg`
- [x] 2.3 `apps/web/src/lib/avatarPresets.ts` — the shared manifest (key → display name → bundled image), consumed by both `ProfilePage`'s picker and the `Avatar` component

## 3. Backend: self-service profile (TDD)

- [x] 3.1 Write failing store/domain tests: `avatar_key`/`display_name`/`timezone text` persist and round-trip on `User`
- [x] 3.2 New migration `00006_add_user_profile.sql` adding the three nullable columns (CLAUDE.md's migration policy changed after this change was drafted — never edit an existing migration file; a stacked file is now required even pre-1.0); threaded through `domain.User` and the store
- [x] 3.3 Write failing service/handler tests for `PATCH /api/v1/users/me`: updates only the caller's own row; rejects an unknown `avatarKey` not in the known preset set (`domain.AvatarPresetKeys`); a user cannot target another user's id via this route (no such parameter exists on it)
- [x] 3.4 Implement the service method (`Service.UpdateOwnProfile`) and handler (`api.updateCurrentUserProfile`, `PATCH /users/me` — a static route, so it doesn't collide with the admin `/{userId}` route); confirm green; `make coverage-api` (81.1%, ≥80% gate)

## 4. Frontend: Profile page (TDD)

- [x] 4.1 Write failing tests for a new `ProfilePage` at `/settings/profile`: shows current display name/avatar/timezone; avatar picker lists all presets plus "generated default"; saving calls `PATCH /api/v1/users/me` and reflects the update; links to `/settings/tokens`; a visible (disabled/"coming soon") entry for password change. **Revised after review**: the originally-planned admin-only "Manage users" link was dropped — it pointed at a route (`/settings/users`) that doesn't exist (the real page is `/settings/people`), and even fixed it would have duplicated the top-level Admin menu's existing "People" entry, contradicting `UserMenu.tsx`'s own established principle that instance administration is a distinct concern from personal account settings and deliberately lives outside it.
- [x] 4.2 Implement `ProfilePage.tsx` and the route in `App.tsx`
- [x] 4.3 `Avatar` component (`apps/web/src/components/Avatar.tsx`): renders the preset image if `avatarKey` resolves to a known preset, else the existing generated initial-on-color chip (`avatarStyle`/`initialsFor`)
- [x] 4.4 Confirm green (7/7 `ProfilePage.test.tsx`, 4/4 `Avatar.test.tsx`)

## 5. Frontend: header avatar (TDD)

- [x] 5.1 Write failing tests: `UserMenu.tsx`'s trigger shows an `Avatar` (not just plain email text), and the dropdown gains a "Profile" entry linking to `/settings/profile`. (The header's account control had already evolved from plain `{email}` text into a `UserMenu` dropdown by a separate, more recent change since this proposal was drafted — adapted to that reality rather than reverting it: Profile joins the existing menu instead of the trigger itself becoming a link.)
- [x] 5.2 `UserMenu.tsx`'s trigger now renders `<Avatar>` (`aria-hidden`, decorative — the adjacent email text already carries the accessible name) + email; added a "Profile" menuitem before "API tokens". `useAuth`'s `AuthUser` extended with `displayName`/`avatarKey`/`timezone`; added `refreshUser()` so `ProfilePage` can update the header without a full reload.
- [x] 5.3 Confirm green; `make coverage-web`. (Fixed two pre-existing `App.test.tsx` fixtures that didn't explicitly stub `/api/v1/users/me`, falling through to a generic `{data: []}` catch-all — harmless before this change since nothing dereferenced into the response, now exposed since `Avatar` needs a real `email`/`displayName`.)

## 6. Frontend: propagate `Avatar` to other user-identity surfaces

- [x] 6.1 Write failing tests: `PeoplePage.tsx`'s Users list and `ProjectMembersPage.tsx`'s Members list render each user row through `Avatar` instead of `avatarStyle`/`initialsFor` directly
- [x] 6.2 Updated `PeoplePage.tsx` and `ProjectMembersPage.tsx` accordingly; team rows unaffected (still the generated-color square chip, no `avatar_key` concept for teams)
- [x] 6.3 Write failing tests: a `kind: 'user'` run-item assignee (`RunPage.tsx` board rows, `RunItemDetailPage.tsx`'s Properties sidebar) renders through `Avatar`; a `kind: 'team'` assignee is unaffected
- [x] 6.4 Updated `RunPage.tsx` and `RunItemDetailPage.tsx` accordingly. Required a small backend addition beyond the original task scope: `RunItemAssignee` (contract), `domain.Assignee`, and the `Items` SQL query (`store/runs.go`) gained `avatarKey`, resolved live via `LEFT JOIN users` (same "always current" guarantee the assignee's `name` already had) — new store regression test `TestAssigneeAvatarKeyResolvesLive` confirms it updates when the assignee's profile changes, not just at assignment time.
- [x] 6.5 Write failing tests: `RunItemDetailPage.tsx`'s result History list shows an `Avatar` for entries where `actorKind === 'user'`, resolving that user's *current* `avatarKey` (not the historical `actor` string); entries with `actorKind: 'agent'`/`'unknown'` or a free-text override are unaffected
- [x] 6.6 Implemented via the client-side lookup option (simpler at implementation time, per the task's own note): `RunItemDetailPage` fetches `GET /api/v1/users` once on load (not Tenant-Admin-gated) and resolves `actorRefId` → `avatarKey`, mirroring `PeoplePage`'s existing pattern
- [x] 6.7 Confirm green: unit 768/768, typecheck clean, `make coverage-web` (Statements 92.19%, Branches 83.45%, Functions 90.25%, Lines 94.84% — all ≥80% gate)

## 7. Verification

- [x] 7.1 Go: `go test ./...` all packages pass; `make coverage-api` 81.1% (≥80% gate). Web: `npx tsc -b --force` clean; `npx vitest run` 768/768; `make coverage-web` all four metrics ≥80%.
- [x] 7.2 Manual check against a freshly-rebuilt compose stack (`down -v` + `up --build`): verified the bootstrap-admin profile seed shows immediately in the header (Grace Hopper avatar); changed avatar to Ada Lovelace and saved — header updated instantly without a reload; PeoplePage shows the same avatar for admin, generated chips for users with no preset; a run item's History entry attributed to admin shows Ada Lovelace (the *current* profile, live-resolved, not whatever was set when the result was recorded); a run item assigned to a user with no avatarKey correctly shows the generated fallback. Full e2e suite (90/90) confirmed no regressions.

## 8. Sample Project showcase (CLAUDE.md standing rule)

- [x] 8.1 Confirmed with the user: yes, seed it. `Service.BootstrapAdmin` (which only ever runs once, on a genuinely empty `users` table — the same guard that already made it safe to auto-create the first admin) now also sets that admin's profile: display name "Admin", avatar `grace-hopper`, timezone "UTC".
- [x] 8.2 `TestBootstrapAdminSeedsAProfile` (`internal/service/identity_test.go`) asserts the bootstrap admin has a non-empty `DisplayName`, an `AvatarKey` that resolves in `domain.AvatarPresetKeys`, and a non-empty `Timezone` after `BootstrapAdmin` runs.

## 9. Docs and spec sync

- [x] 9.1 Updated `docs/api.md` (`PATCH /api/v1/users/me`), `docs/database.md` (`users` profile columns), `docs/development.md` (header account menu, `/settings/profile`), `docs/test-management.md` (live-resolved assignee/History avatars). Delta specs (`authentication`, `ui-navigation`) revised in place to match what actually shipped — the header's account control had already evolved into a dropdown menu by a separate change since this proposal was drafted, so "Profile" joins that menu rather than the avatar itself becoming a direct link.
- [x] 9.2 `openspec validate --specs` and `openspec validate add-user-profile` both pass
