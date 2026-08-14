## 1. Config: SMTP + public URL

- [x] 1.1 Write failing tests in `apps/api/internal/config/config_test.go`: `TestLoadReadsSMTPSettings`, `TestPasswordResetEnabledRequiresAllVars` (a `Config.PasswordResetEnabled() bool` helper — `true` only when host/port/from-address and `TESTPULSE_PUBLIC_URL` are all non-empty; username/password may be blank for an unauthenticated relay)
- [x] 1.2 Add `SMTPHost`, `SMTPPort`, `SMTPUsername`, `SMTPPassword`, `SMTPFromAddress`, `PublicURL` fields to `Config` in `apps/api/internal/config/config.go`, read from `TESTPULSE_SMTP_HOST`/`_PORT`/`_USERNAME`/`_PASSWORD`/`_FROM_ADDRESS`/`TESTPULSE_PUBLIC_URL`; add the `PasswordResetEnabled()` method; update the package doc comment
- [x] 1.3 Verify tests pass

## 2. Mailer package

- [x] 2.1 Write failing tests in `apps/api/internal/mailer/mailer_test.go`: a `Sender` interface (`Send(ctx, to, subject, body string) error`) is satisfiable by a fake used elsewhere; the real `SMTPSender` builds a correctly-formatted RFC 5322 message (headers present, body present)
- [x] 2.2 Implement `internal/mailer/mailer.go`: `Sender` interface, `SMTPSender` wrapping `net/smtp.SendMail` with `PlainAuth`
- [x] 2.3 Verify tests pass

## 3. Store: password reset tokens

- [x] 3.1 Write failing tests in `apps/api/internal/store/identity_test.go`: `TestPasswordResetTokenCreateAndGetByHash`, `TestPasswordResetTokenGetByHashUnknownNotFound`, `TestPasswordResetTokenExpiredIsNotFound`, `TestPasswordResetTokenMarkUsed`
- [x] 3.2 ~~Add migration `00015_add_password_reset_tokens.sql`~~ — superseded by `replace-migrations-with-schema-sql` (pre-1.0.0, no more incremental migration files): the `password_reset_tokens` table (`token_hash` unique, `expires_at`, nullable `used_at`, `user_id` `ON DELETE CASCADE`, indexed on `user_id`) is defined directly in `apps/api/internal/db/schema.sql`
- [x] 3.3 Implement `PasswordResetTokenRepo` in `apps/api/internal/store/password_reset_tokens.go`: `Create(ctx, userID, tokenHash string, expiresAt time.Time) error`, `GetByHash(ctx, tokenHash) (domain.PasswordResetToken, error)` (only unexpired, unused rows), `MarkUsed(ctx, tokenHash) error`
- [x] 3.4 Verify tests pass

## 4. Service: forgot-password / reset-password

- [x] 4.1 Write failing tests in `apps/api/internal/service/identity_test.go` (inject a fake `mailer.Sender`): `TestForgotPasswordSendsEmailForRealActiveAccount`, `TestForgotPasswordSilentForUnknownEmail`, `TestForgotPasswordSilentForDeactivatedAccount`, `TestForgotPasswordSilentWhenSMTPNotConfigured`, `TestResetPasswordUpdatesPasswordAndRevokesSessions` (log in first, reset, assert the prior session 401s — same shape as `TestSetUserPasswordRevokesSessions`), `TestResetPasswordRejectsExpiredToken`, `TestResetPasswordRejectsUsedToken`, `TestResetPasswordRejectsWeakPassword`
- [x] 4.2 Add `Service.ForgotPassword(ctx, email string) error` and `Service.ResetPassword(ctx, token, newPassword string) error` in `apps/api/internal/service/identity.go`, reusing `randomSecret()`/`hashToken()` for the token and `SessionRepo.DeleteByUser` on success; `Service` gains a `mailer mailer.Sender` + `publicURL`/`passwordResetEnabled` field via a `WithMailer(sender, publicURL, enabled) *Service` builder method (zero-value default keeps every other call site's behavior unchanged — `passwordResetEnabled` false, `ForgotPassword` a no-op) and a `PasswordResetEnabled()` getter for task 5's meta flag
- [x] 4.3 Verify tests pass

## 5. HTTP: public routes + meta flag

- [x] 5.1 Write failing tests in `apps/api/internal/server/identity_api_test.go`: `TestScenario_ForgotPasswordAlwaysReturns200`, `TestScenario_ForgotPasswordRateLimited` (mirrors the existing login rate-limit test), `TestScenario_ResetPasswordWithValidTokenSucceeds`, `TestScenario_ResetPasswordRejectsInvalidToken`, `TestScenario_MetaReportsPasswordResetEnabled`
- [x] 5.2 Add `POST /api/v1/auth/forgot-password` and `POST /api/v1/auth/reset-password` to `mountAuth` in `apps/api/internal/server/identity_handlers.go` (public, forgot-password behind its own rate limiter instance at the same shape as login's), add `passwordResetEnabled` to the `/api/v1/meta` response
- [x] 5.3 Verify tests pass

## 6. API contract

- [x] 6.1 Add both endpoints and request/response schemas to `packages/shared/openapi.yaml`; add `passwordResetEnabled` to the meta response schema
- [x] 6.2 Run `make generate`; confirm no drift

## 7. Web: forgot/reset pages

- [ ] 7.1 Dispatch Pepe (Fable 5, ultrathink) for the forgot-password and reset-password pages' visual design, grounded in the real current `LoginPage.tsx` — get explicit user validation before writing any component code
- [ ] 7.2 Write failing tests for `ForgotPasswordPage.test.tsx` (submits email, shows a generic confirmation regardless of what the API implies) and `ResetPasswordPage.test.tsx` (reads `token` from the URL, submits new password, redirects to login on success, shows an error on an invalid/expired token) and `LoginPage.test.tsx` (the "Forgot password?" link only renders when `/api/v1/meta`'s `passwordResetEnabled` is true)
- [ ] 7.3 Implement `apps/web/src/pages/ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`, wire routes, add the conditional link to `LoginPage.tsx`, per the validated Pepe design
- [ ] 7.4 Verify tests pass

## 8. E2E

- [ ] 8.1 Add a `mailpit` service to `deploy/compose/docker-compose.yml` (`axllent/mailpit`, MIT-licensed) with SMTP on `1025`, web UI/REST API on `8025`; point the `app` service's `TESTPULSE_SMTP_*`/`TESTPULSE_PUBLIC_URL` env vars at it by default (unauthenticated relay — no username/password needed for Mailpit)
- [ ] 8.2 Add an E2E spec covering the `password-recovery` capability's core scenario end-to-end: request a reset, fetch the sent email via Mailpit's REST API (`GET http://mailpit:8025/api/v1/messages` from the test runner) and extract the reset link/token, submit a new password, confirm login with the new password succeeds and the prior session no longer authenticates
- [ ] 8.3 Add an E2E spec (or extend the above) covering the "no SMTP configured" case: temporarily unset the SMTP env vars is not practical mid-suite, so instead assert directly against the compose-stack's `/api/v1/meta` that `passwordResetEnabled` is `true` and the login page's link renders — the negative case (`false` when unconfigured) is already covered by the `config` package's unit tests (task 1.1), not re-proven at the E2E layer

## 9. Docs

- [ ] 9.1 Document the two new endpoints and the `passwordResetEnabled` meta field in `docs/api.md`
- [ ] 9.2 Document the new `TESTPULSE_SMTP_*`/`TESTPULSE_PUBLIC_URL` env vars in `docs/deployment.md`
- [ ] 9.3 Document the bundled Mailpit service (compose-only, for local dev/eval/E2E — not part of the production `fly.toml` deployment) in `docs/development.md` or `docs/testing.md`, whichever already documents `make e2e`'s compose stack

## 10. Sample Project showcase

- [ ] 10.1 With Mailpit wired into `docker-compose.yml` by default, the demo/evaluation stack now has `passwordResetEnabled: true` out of the box — the "Forgot password?" link on the login page is real and demoable without any extra setup. No seeded *data* change is needed (this is an auth capability, not project content), but confirm live that the full flow — request, receive in Mailpit, reset, log in — works against the seeded admin/demo users

## 11. Spec sync

- [ ] 11.1 Sync `specs/password-recovery/spec.md`'s new capability into `openspec/specs/` at archive time
