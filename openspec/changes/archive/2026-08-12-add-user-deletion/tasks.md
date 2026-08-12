## 1. Migration (new incremental file, CLAUDE.md migration policy)

- [x] 1.1 Add `00014_cascade_user_deletion.sql`: add `ON DELETE CASCADE` to `sessions.user_id` and `api_tokens.created_by` — confirmed via direct inspection that neither cascades today (design.md D4)
- [x] 1.2 Verify via `docker compose down -v` + rebuild that the new migration applies cleanly and a `DELETE FROM users WHERE id = ...` cascades correctly against real seeded data with an active session and a created token (manual `psql`/`curl` check, not just unit tests)
      Implementation notes: migration applies cleanly against a fresh
      test DB (`go test ./internal/db/...`, all 3 tests green, migrated
      to version 14). The `DELETE FROM users` cascade correctness itself
      is verified by task 2.3's service-level test (seeds a session and
      a token, deletes the user, asserts both rows are gone) plus the
      final `docker compose down -v` rebuild in task group 8.

## 2. Service (TDD)

- [x] 2.1 Write failing tests: `DeleteUser` requires the target to be deactivated first — assert deletion of an active user is rejected with a validation error and the user survives (design.md D2)
- [x] 2.2 Write failing tests: `DeleteUser` rejects self-deletion (`actor.EffectiveUserID == userID`), even if deactivated (design.md D3) — this is the service's first `actor`-aware guard among the user-management methods; don't skip it because `DeactivateUser`/`ReactivateUser`/`SetTenantAdmin` don't have one today
- [x] 2.3 Write failing tests: successful deletion of a deactivated, non-self user removes the row and cascades through team memberships, project memberships, sessions, and tokens (seed one of each, then delete and assert every row is gone)
      Implementation notes: added store-level tests
      (`TestUserDelete`, `TestUserDeleteNonexistentReturnsNotFound`,
      `TestUserDeleteCascadesSessionsAndTokens`) plus service-level tests
      (`TestDeleteUserRejectedWhileStillActive`,
      `TestDeleteUserRejectsSelfDeletionEvenIfDeactivated`,
      `TestDeleteUserRemovesDeactivatedUserAndCascades` — the last one
      exercises team membership, a token, and a session together). All
      RED-confirmed (compile failure / missing method) before
      implementation, all GREEN after.
- [x] 2.4 Implement `Service.DeleteUser(ctx context.Context, actor domain.Actor, userID string) error`, audited (`s.audit(ctx, "delete", "user", userID)`)
- [x] 2.5 Confirm green

## 3. HTTP routes and OpenAPI (TDD)

- [x] 3.1 Write failing HTTP scenario tests: `DELETE /api/v1/users/{userId}` — success once deactivated (204), 400 while active, 400/403 on self-delete, 403 for a non-Tenant-Admin caller
      Implementation notes: `TestScenario_DeleteUserRequiresDeactivationFirst`,
      `TestScenario_DeleteUserRejectsSelfDelete`,
      `TestScenario_DeleteDeactivatedUserSucceeds`,
      `TestScenario_NonTenantAdminCannotDeleteUser`. The self-delete test
      needed a bearer token minted before self-deactivation rather than
      the admin's own session cookie: deactivating an account immediately
      invalidates its *existing* session on the very next request
      (`AuthenticateSession` checks `DeactivatedAt`) — a real,
      pre-existing gap already flagged in design.md's Risks — so a
      deactivated admin can't even reach the handler via cookie auth.
      `AuthenticateToken` doesn't check the creator's `DeactivatedAt`
      today, so a token created while still active stays valid — that's
      what actually makes the self-delete guard reachable/testable over
      HTTP. RED-confirmed (405, then a revealing 401 from the
      cookie-based attempt) before the route existed; GREEN after.
- [x] 3.2 Register the route in `identity_handlers.go` behind `requireTenantAdmin` (same middleware as `POST /users` and `PATCH /users/{userId}` — design.md D1, no new permission flag)
- [x] 3.3 `openapi.yaml`: add the `DELETE /api/v1/users/{userId}` path (204 success, 400 validation, 403 forbidden)
- [x] 3.4 `make generate`; confirm no drift
- [x] 3.5 Confirm green

## 4. Backend: deletion-preview endpoint (TDD) — added during design review

Pepe's design review (see design.md D5's revision) caught that the original
plan to compute the project-membership count client-side would require an
N+1 fan-out with no reverse lookup available — this task group adds the
missing endpoint before the frontend consumes it.

- [x] 4.1 Write a failing store test: a new `ProjectMemberRepo` method
      returning a user's direct project-membership count (`SELECT count(*)
      FROM project_members WHERE user_id = $1`). Confirm it fails, then
      passes.
      `TestDirectProjectCountForUser`.
- [x] 4.2 Write a failing service test: `Service.UserDeletionPreview(ctx,
      userID) (domain.UserDeletionPreview{TeamCount, ProjectCount,
      TokenCount}, error)` — team count via the existing
      `TeamIDsForUser`, project count via 4.1's new method, token count via
      the existing `ApiTokens.ListByCreator` filtered to non-revoked.
      Confirm it fails, then passes.
      `TestUserDeletionPreviewCountsTeamsProjectsAndLiveTokens`.
- [x] 4.3 Write a failing HTTP scenario test: `GET
      /api/v1/users/{userId}/deletion-preview`, Tenant-Admin-gated (same
      `requireTenantAdmin` as the rest of user management), returns the
      three counts as JSON. Confirm it fails, then passes.
      `TestScenario_UserDeletionPreviewReturnsRealCounts`,
      `TestScenario_NonTenantAdminCannotViewDeletionPreview`.
- [x] 4.4 `openapi.yaml`: add the path and a `UserDeletionPreview` schema.
      `make generate`; confirm no drift.
      Full `go build`, `go vet`, `go test ./...`, and `golangci-lint`
      (0 issues) all green after task group 4.

## 5. Frontend (TDD) — visual sign-off required before commit (standing rule)

Design finalized by Pepe (Fable 5), mock published for review before this
task group started — see design.md D5 and the mock link recorded in the
session. Implementing exactly as specified: a "Reactivate · Delete" text
link pair (not icon buttons — two bare icons in a 36px slot is ambiguous
for actions this consequential), `·` interpunct divider matching the
pattern already used elsewhere (`ProjectPage.tsx`, `CaseDetailPage.tsx`),
persistent (not hover-only) `text-destructive` on Delete, `hover:underline`
reusing `button.tsx`'s link-variant idiom, and the grid's last column
changed from a fixed `36px` to `minmax(36px,auto)` (both the base and `sm:`
templates) so the wider "Reactivate · Delete" pair fits without breaking
the active-row layout.

- [x] 5.1 `PeoplePage.tsx`: add the "Delete" text link on a deactivated
      user's row (alongside the existing Reactivate link, `u.id !== me.id`
      guard mirroring the active-row Deactivate button), plus the grid
      column-width fix — TDD first
      Also fixed a real, pre-existing bug caught while reviewing Pepe's
      mock against the live source: the roster header labeled the
      Tenant-Admin/Member column "Role" (line 416), colliding with this
      app's actual project-scoped Role concept (Tester/Contributor/etc.).
      Renamed to "Access". Unrelated to deletion but same file, low-risk,
      user approved fixing it in the same pass.
- [x] 5.2 Confirmation dialog naming the account, showing real counts from
      4.'s new `GET /api/v1/users/{userId}/deletion-preview` endpoint —
      opens instantly, counts load async with a spinner (reusing
      `ProfilePage.tsx`'s loading-spinner idiom) in place of the numbers,
      Confirm disabled until they resolve — TDD first
      Implementation notes: 4 new tests (Delete link visibility incl.
      self-guard, dialog-opens-disabled-until-loaded using a manually
      controlled deferred promise to make the loading window observable,
      cancel doesn't call the API, confirm calls `DELETE` and closes).
      RED-confirmed (compile passes, assertions fail — Delete control
      doesn't exist yet) before implementation, GREEN after (29/29 in
      `PeoplePage.test.tsx`). `tsc -b` clean.
- [ ] 5.3 Get the user's live visual sign-off on the delete flow before committing (standing rule — UI changes are not "done" until signed off separately from implementation)

## 5. Docs

- [ ] 5.1 `docs/api.md`: document the new `DELETE /api/v1/users/{userId}` endpoint, its deactivated-first precondition, and the self-delete rejection
- [ ] 5.2 `docs/database.md`: document the new cascade behavior on `sessions`/`api_tokens`
- [ ] 5.3 `docs/test-management.md` (or wherever user administration is documented): document that deletion requires deactivation first and is permanent

## 6. Fast-follow (not blocking this change, tracked so it isn't forgotten)

- [ ] 6.1 File a backlog issue: add a real server-side self-deactivation guard to `Service.DeactivateUser` (currently frontend-only, found while investigating this change — design.md Risks) — out of scope here since deletion gets the real guard via task 2.2, but the milder deactivation gap shouldn't be silently dropped

## 7. Sample Project showcase (CLAUDE.md standing rule)

- [ ] 7.1 This is an instance-level user-management capability, not project content — it has no natural home inside the Sample Project itself (a single project entity). Judgment call, confirm with the user before implementing: seed one additional, already-deactivated demo user account (e.g. "Former Contributor — deactivated") at bootstrap time (alongside the Sample Project seed, same `sampledata` package or a sibling step), specifically so a Tenant Admin evaluating the product has a safe, obviously-disposable account to try the new delete action on — without needing to deactivate a real teammate first.
- [ ] 7.2 If seeded, add a corresponding integration-test assertion (deactivated user exists after seeding) and confirm it doesn't interfere with any existing e2e scenario that lists/counts users.

## 8. Verification

- [ ] 8.1 `go build ./...`, `go vet ./...`, full backend `go test ./...` (incl. DB integration against `TESTPULSE_TEST_DATABASE_URL`), `make coverage-api` ≥80%, `golangci-lint` 0 issues
- [ ] 8.2 Frontend `tsc -b` clean, full `vitest run`, `make coverage-web` ≥80% all metrics, `oxlint` clean
- [ ] 8.3 `openspec validate add-user-deletion --strict` passes
- [ ] 8.4 Clean `docker compose down -v` + rebuild; live spot-check of the delete flow (Playwright/Chromium or manual) including the deactivated-first rejection, the self-delete rejection, and the confirmation dialog's real counts
