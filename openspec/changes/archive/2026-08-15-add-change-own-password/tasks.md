## 1. Schema: must_change_password

- [x] 1.1 Add `must_change_password boolean NOT NULL DEFAULT false` to `users` in `apps/api/internal/db/schema.sql` (pre-1.0.0, edited directly in place — no migration file)
- [x] 1.2 Add `MustChangePassword bool` to `domain.User`; thread it through `store.UserRepo`'s existing row-scanning methods (`Get`, `GetByEmailWithHash`, `List`, `Create`, `UpdateProfile`, `ClearAvatarKey`, `UpdateEmail`) — also added `UserRepo.SetMustChangePassword(ctx, id, must bool) error`

## 2. Service: self-service change-password

- [x] 2.1 Write failing tests in `apps/api/internal/service/identity_test.go`: `TestChangeOwnPasswordUpdatesPasswordAndRevokesAllSessions`, `TestChangeOwnPasswordRejectsWrongCurrentPassword`, `TestChangeOwnPasswordRejectsWeakNewPassword`, `TestChangeOwnPasswordClearsRequiredChangeFlag` (arranged via direct store access — `SetRequirePasswordChange` doesn't exist yet at this point, task 3)
- [x] 2.2 Add `Service.ChangeOwnPassword(ctx, actor, currentPassword, newPassword) error` in `apps/api/internal/service/identity.go` — looks up the actor's own hash via a new `UserRepo.GetByIDWithHash` (not `GetByEmailWithHash` keyed on `actor.DisplayName`, which only holds the email for a session-based user actor, not an agent/token actor)
- [x] 2.3 Verify tests pass

## 3. Service: admin actions replacing SetUserPassword

- [x] 3.1 Write failing tests: `TestSendPasswordResetEmailForExistingAccount` (asserts a real token exists / email sent, mirroring `TestForgotPasswordSendsEmailForRealActiveAccount`'s shape but admin-triggered), `TestSendPasswordResetEmailRejectedWithoutSMTPConfigured`, `TestSendPasswordResetEmailRequiresTenantAdmin`, `TestSetRequirePasswordChangeFlagsAccount`, `TestGenerateTemporaryPasswordSetsFlagAndRevokesSessions`, `TestGenerateTemporaryPasswordRejectedWhenSMTPConfigured`, `TestGenerateTemporaryPasswordRequiresTenantAdmin`
- [x] 3.2 Extract the token-creation + email-send body out of `ForgotPassword` into an unexported `s.sendPasswordResetEmail(ctx, user domain.User) error`; `ForgotPassword` calls it after its existing lookup/enumeration-safety checks
- [x] 3.3 Add `Service.SendPasswordResetEmail(ctx, actor, userID) error` (Tenant-Admin-only, rejects if `!s.passwordResetEnabled`, looks up the target directly, calls the shared helper)
- [x] 3.4 Add `Service.SetRequirePasswordChange(ctx, actor, userID string, require bool) error` (Tenant-Admin-only)
- [x] 3.5 Add unexported `generateTemporaryPassword() (string, error)` (crypto/rand, mirrors `apps/web/src/lib/generatePassword.ts`'s alphabet/length/rejection-sampling approach) and `Service.GenerateTemporaryPassword(ctx, actor, userID) (string, error)` (Tenant-Admin-only, rejects if `s.passwordResetEnabled`, sets password + flag + revokes sessions, returns the raw value once)
- [x] 3.6 Remove `Service.SetUserPassword` entirely — also updated `ResetPassword` to clear `must_change_password` on success (not in the original task list: the emailed-token flow is also "the owner setting their own real password," so it should clear the flag exactly like `ChangeOwnPassword` does, for consistency)
- [x] 3.7 Verify tests pass — service package: all green, fresh run

## 4. Server: routes + must-change-password enforcement middleware

- [x] 4.1 Write failing tests in `apps/api/internal/server/identity_api_test.go`: `TestScenario_ChangeOwnPasswordSucceeds`, `TestScenario_ChangeOwnPasswordRejectsWrongCurrentPassword`, `TestScenario_AdminTriggersPasswordResetEmail`, `TestScenario_AdminTriggersPasswordResetEmailRejectedWithoutSMTP`, `TestScenario_AdminSetsRequirePasswordChangeFlag` (also covers the login-response signal), `TestScenario_AdminGeneratesTemporaryPassword` (asserts the response includes the raw value once, also covers the login-response signal), `TestScenario_AdminGenerateTemporaryPasswordRejectedWithSMTPConfigured`, `TestScenario_FlaggedAccountBlockedFromOrdinaryRoutesUntilItChangesPassword` (also covers the allowlist and that changing the password clears the block) — also fixed/replaced two now-obsolete tests that exercised the removed `PATCH .../password` field (`TestScenario_TenantAdminSetsNewPasswordOverHTTP` deleted; `TestScenario_NonTenantAdminCannotUpdateAnotherUsersEmailOrPasswordOverHTTP` renamed and updated to cover the new endpoints instead)
- [x] 4.2 Add `POST /api/v1/users/me/password` to `mountIdentity`
- [x] 4.3 Add `POST /api/v1/users/{userId}/password-reset-email`, extend `PATCH /api/v1/users/{userId}` with `requirePasswordChange *bool`, add `POST /api/v1/users/{userId}/generate-temporary-password`; removed `password` from the `userUpdate` request struct entirely
- [x] 4.4 Add `requireNoPendingPasswordChange` middleware (mirrors `requireTenantAdmin`'s shape) with an allowlist of `GET /api/v1/users/me`, `POST /api/v1/users/me/password` (`/auth/logout` doesn't need allowlisting — it's mounted unauthenticated, outside this middleware's group entirely); wire `domain.Actor.MustChangePassword` from `AuthenticateSession` (always `false` for an agent/token actor, since `AuthenticateToken` never sets it); applied to the authenticated route group in `server.go`
- [x] 4.5 Include `mustChangePassword` in the login response body — free: `domain.User`'s new JSON-tagged field serializes automatically, no handler change needed
- [x] 4.6 Verify tests pass — full Go suite (`go build`, `go vet`, `gofmt -l`, `go test -count=1 ./...`, `golangci-lint`) all clean

## 5. API contract

- [x] 5.1 Update `packages/shared/openapi.yaml`: remove `password` from the user-update schema (replaced with `requirePasswordChange`); add the three new endpoints (`POST /users/me/password`, `POST /users/{userId}/password-reset-email`, `POST /users/{userId}/generate-temporary-password`) and their schemas (`ChangeOwnPasswordInput`, `TemporaryPassword`); add `mustChangePassword` to `User` (the login response already references `User`, so it's covered automatically) — caught and fixed a duplicate-key YAML break caused by a truncated `Read` earlier in the edit (severed `deletion-preview`'s own `403`/`404` from its block; restored them and removed the accidental duplicate)
- [x] 5.2 Run `make generate`; confirm no drift — stable across two consecutive runs

## 6. Web: shared GeneratedPasswordChip

- [x] 6.1 Extract `GeneratedPasswordChip` from `PeoplePage.tsx` into `apps/web/src/components/GeneratedPasswordChip.tsx`; update the New-user form's import (behavior unchanged, out of scope to alter) — also added a dedicated `GeneratedPasswordChip.test.tsx` (matches this codebase's convention of testing every shared component directly, not only indirectly through pages that use it)

## 7. Web: self-service change-password (Profile)

- [x] 7.1 Write failing tests in `ProfilePage.test.tsx`: the "Change password" row opens a real dialog, submits current+new password, shows an inline error on a wrong current password, redirects to `/login` on success, warns about signing out everywhere — also removed 2 now-obsolete tests that asserted the old disabled/"Coming soon" placeholder
- [x] 7.2 Replace the disabled row in `apps/web/src/pages/ProfilePage.tsx` with a working dialog (reusing `PeoplePage.tsx`'s Edit-user dialog conventions and the "signs you out everywhere" warning); on success, navigate to `/login` with the same `{ state: { passwordReset: true } }` `ConfirmBanner` idiom `add-forgot-password` already wired into `LoginPage.tsx` — reused directly, not reinvented
- [x] 7.3 Verify tests pass — full web suite (1008 tests), typecheck, lint all clean

## 8. Web: ResetPasswordPage Generate affordance

- [x] 8.1 Write failing tests: a "Generate" control fills both the new-password and confirm fields with the same value and reveals the chip; editing either field afterward invalidates the chip
- [x] 8.2 Add the Generate button to `apps/web/src/pages/ResetPasswordPage.tsx`, reusing the extracted `GeneratedPasswordChip` and `lib/generatePassword.ts`
- [x] 8.3 Verify tests pass — dedicated file (11/11), typecheck, and lint all clean fresh. The full 1008-test suite could not get one clean complete run this session (host under heavy unrelated CPU contention — a Virtualization.framework process at ~77% CPU, load average up to 21+ on 11 cores — causing vitest worker-pool *startup* timeouts, not test failures); across 3 independent full-suite attempts, every test that actually started passed (869/869, 955/955, 554/554), and 100% of the reported errors were pool-startup timeouts on files untouched by this change (e.g. `trimProjectBreadcrumb.test.ts`), never a real assertion failure. Treated as sufficient verification given the pattern; a clean full run should be re-confirmed in CI

## 9. Web: PeoplePage Edit-user dialog rework

- [x] 9.1 Write failing tests in `PeoplePage.test.tsx`: no free-text password field renders in the Edit-user dialog under either SMTP state; with SMTP configured, a "Send password reset email" action fires immediately with an inline confirmation, and a "Require a password change at next login" checkbox is present; without SMTP configured, a "Generate a temporary password" action is shown instead, reveals the chip on click, and sets the require-change consequence inline — also removed 3 now-obsolete tests (free-text password field pre-fill/caution-notice/password-only-submit) and the entire obsolete "Generate password" describe block for the Edit-user dialog, replaced by the new suite
- [x] 9.2 Rework the Edit-user dialog in `apps/web/src/pages/PeoplePage.tsx` per Pepe's design — removed the free-text password field entirely; reads `passwordResetEnabled` from `/api/v1/meta` (added to `load()`'s existing `Promise.all`); the "require a password change" checkbox is deferred to Save (like email), while send-reset-email/generate-temporary-password fire immediately, matching the design's own distinction
- [x] 9.3 Verify tests pass — full web suite (1011 tests), typecheck, lint all clean

## 10. Web: required-password-change gate

- [x] 10.1 Write failing tests: after a login response with `mustChangePassword: true`, the app renders a full-screen change-password gate instead of the app shell; submitting a valid change proceeds normally afterward — in `App.test.tsx` (gate shown/not-shown) and a dedicated `RequiredPasswordChangePage.test.tsx`
- [x] 10.2 Extracted the shared form from task 7's dialog into `apps/web/src/components/ChangePasswordForm.tsx` (own dedicated tests) — reused by both `ProfilePage.tsx`'s dialog (with Cancel) and the new `RequiredPasswordChangePage.tsx` (no Cancel — mandatory, no dismiss). Wired into `App.tsx`'s `RequireAuth` **and** `AllowAnonymous` — a real gap found while testing: the root path (`/`) is itself an anonymous route, so gating only `RequireAuth` would have missed a flagged admin landing there right after login
- [x] 10.3 Verify tests pass — full web suite (1021 tests), typecheck, lint, and `make coverage-web` (92.06%/84.15%/89.09%/94.41%, gate passes) all clean

## 11. E2E

- [x] 11.1 Add E2E coverage: self-service change-password (`apps/web/e2e/change-own-password.spec.ts`, TD-84 — log in, change via Profile, confirm the old session is dead and the new password works) and required-password-change gate (TD-85 — admin flags an account, the target is gated at next login, blocked from `/api/v1/projects` until it changes its password, then unblocked); admin-triggered reset email replaces the now-obsolete TD-80 in `update-user.spec.ts` (TD-83). The SMTP-less generate-temporary-password path is not E2E-tested — the compose stack has Mailpit configured by default (`add-forgot-password`), so that branch is unreachable without temporarily unsetting SMTP env vars mid-suite, the same "not practical" reasoning `add-forgot-password` task 8.3 already established for its own negative case; covered instead by `Service`/`PeoplePage` unit tests. Verified live: full suite 115/116 passed, the 1 failure (`test-execution.spec.ts`'s right-click context menu, unrelated to this change) confirmed as the known flaky-in-isolation pattern, passing cleanly on its own

## 12. Docs

- [x] 12.1 Document the new/changed endpoints in `docs/api.md` (also fixed 2 rows referencing the removed direct-password-set capability); added a "Password management" subsection to `docs/test-management.md`'s "Project roles and teams" section covering self-service change, admin reset-email trigger, temporary-password fallback, and the required-change-at-next-login flag

## 13. Sample Project showcase

- [x] 13.1 Auth capability, not project content — no seeded data change. Confirmed live in both SMTP states: SMTP-configured (compose stack with Mailpit, via the E2E specs in task 11 — self-service change, admin reset-email trigger) and SMTP-less (a locally-run binary against a fresh throwaway database, `TESTPULSE_ADMIN_EMAIL`/`_PASSWORD` seeded, no `TESTPULSE_SMTP_*` set — `passwordResetEnabled: false` confirmed; admin `generate-temporary-password` for a target user, old password dead, temporary password logs in with `mustChangePassword: true`, ordinary routes 403 while own-profile-read stays open, `ChangeOwnPassword` clears the flag, next login reports `mustChangePassword: false`) — the full chain worked exactly as designed

## 14. Spec sync

- [x] 14.1 Sync `specs/authentication/spec.md`'s delta (MODIFIED "Local user accounts" + 4 ADDED requirements — tasks.md's own count was stale; the delta file itself, checked as the source of truth, has 4: Self-service password change, Admin-triggered password reset email, Required password change at next login, Temporary password generation without SMTP configured) into `openspec/specs/authentication/spec.md`; verified with `openspec validate --changes "add-change-own-password" --strict` (6 passed, 0 failed)
