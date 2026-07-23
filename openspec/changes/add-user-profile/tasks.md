## 1. Contract first

- [ ] 1.1 Add `displayName`, `avatarKey`, `timezone` (all optional) to the `User` schema in `packages/shared/openapi.yaml`
- [ ] 1.2 Add `PATCH /api/v1/users/me` (body: displayName?, avatarKey?, timezone?; returns updated `User`) to the contract, distinct from the existing admin `PATCH /api/v1/users/{id}`
- [ ] 1.3 `make generate`, confirm no drift

## 2. Avatar assets

- [ ] 2.1 Source ~12 preset portraits from Wikimedia Commons (historical scientists/verification-adjacent figures — see design.md); verify each image's individual license (public domain vs. CC-BY-SA) and record attribution where required
- [ ] 2.2 Add the images to `assets/` and a matching set of web-optimized copies under `apps/web/src/assets/avatars/` (or equivalent), keyed by a stable string (e.g. `ada-lovelace`)
- [ ] 2.3 Write a small shared manifest (key -> display name, image path) consumed by both the picker UI and the header/avatar-rendering component

## 3. Backend: self-service profile (TDD)

- [ ] 3.1 Write failing store/domain tests: `avatar_key jsonb`/`text`, `display_name text`, `timezone text` persist and round-trip on `User`
- [ ] 3.2 Amend the users migration in place (pre-1.0 policy) to add the three nullable columns; thread through `domain.User` and the store
- [ ] 3.3 Write failing service/handler tests for `PATCH /api/v1/users/me`: updates only the caller's own row; rejects an unknown `avatarKey` not in the known preset set; a user cannot target another user's id via this route
- [ ] 3.4 Implement the service method and handler; confirm green; `make coverage-api`

## 4. Frontend: Profile page (TDD)

- [ ] 4.1 Write failing tests for a new `ProfilePage` at `/settings/profile`: shows current display name/avatar/timezone; avatar picker lists all presets plus "generated default"; saving calls `PATCH /api/v1/users/me` and reflects the update; links to `/settings/tokens` always, `/settings/users` only when the account is admin; a visible (disabled/"coming soon") entry for password change
- [ ] 4.2 Implement `ProfilePage.tsx` and the route in `App.tsx`
- [ ] 4.3 Write a small `Avatar` component: renders the preset image if `avatarKey` is set, else a generated initial-on-color computed from display name/email + user id
- [ ] 4.4 Confirm green

## 5. Frontend: header avatar (TDD)

- [ ] 5.1 Write failing `App.test.tsx` assertions: the header shows the `Avatar` component instead of the raw email; it's a link to `/settings/profile`
- [ ] 5.2 Replace the header's `{user.email}` span with the `Avatar` link
- [ ] 5.3 Confirm green; `make coverage-web`

## 6. Verification

- [ ] 6.1 `make lint`, `make test`, coverage gates all green
- [ ] 6.2 Manual check against the compose stack: set a display name, pick an avatar, set a timezone, confirm the header updates and the Profile page's links to Tokens/Users work

## 7. Sample Project showcase (CLAUDE.md standing rule)

- [ ] 7.1 This feature is about the current user's own profile, not project content — it has no natural home inside the Sample Project itself. Judgment call, confirm with the user before implementing: set the bootstrap admin's profile (display name, a preset avatar, a timezone) at the same point `BootstrapAdmin`/`sampledata.Seed` run at startup, so a fresh instance's header shows a filled-in example immediately instead of the generated-initial default — giving an evaluator something to look at before they've touched Settings themselves.
- [ ] 7.2 If implemented, add a corresponding assertion (bootstrap admin has a non-empty display name/avatar/timezone after startup) alongside the existing `seedSampleProjectIfEmpty`-adjacent tests in `cmd/testpulse-api`.

## 8. Docs and spec sync

- [ ] 8.1 Update `docs/` wherever the header/settings navigation is documented
- [ ] 8.2 Confirm `openspec validate add-user-profile` passes
