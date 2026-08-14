## Why

As a user, when I forget my password and no admin is immediately available, I want a self-service way to recover my account, instead of being permanently locked out — today the only recovery path is a Tenant Admin manually resetting the password via the People page (`add-update-user`), and there is no way to reach anyone at all if the Tenant Admin's own account is the one that's locked out (#66).

## What Changes

- Add outbound email sending — a genuinely new capability this codebase doesn't have at all today — configured via optional `TESTPULSE_SMTP_*` env vars and `TESTPULSE_PUBLIC_URL` (needed to build an absolute reset link). Uses Go's stdlib `net/smtp` — no new dependency, keeping the "all stack additions open source" constraint trivially satisfied.
- **The feature is entirely unavailable when SMTP isn't configured** (the expected default for a fresh self-hosted install) — `GET /api/v1/meta` gains a `passwordResetEnabled` flag, and the login page's "Forgot password?" link only renders when it's true. A locked-out user on an instance without SMTP is told to contact their Tenant Admin, who already has a real reset path.
- `POST /api/v1/auth/forgot-password` (public, rate-limited like login): always returns `200` regardless of whether the email exists, is deactivated, or SMTP is even configured — never leaks account existence. When the account is real and active, generates a random opaque token (hashed at rest, same shape as sessions/API tokens), single-use, 30-minute expiry, and emails a reset link.
- `POST /api/v1/auth/reset-password` (public): validates the token, sets the new password, and revokes every existing session for that account — reusing `SessionRepo.DeleteByUser`, added in `add-update-user`.
- New web pages: `/forgot-password` (email entry, generic confirmation) and `/reset-password?token=...` (new password entry).

## Capabilities

### New Capabilities
- `password-recovery`: self-service forgot-password/reset-password flow, gated on instance-level SMTP configuration, including the `passwordResetEnabled` meta flag that gate is exposed through.

### Modified Capabilities
(none — `GET /api/v1/meta` already returns a flat object; adding a field to it isn't a requirement-level change to the existing "system routes stay open" requirement)

## Impact

- `apps/api/internal/config/config.go` — new `TESTPULSE_SMTP_HOST`/`_PORT`/`_USERNAME`/`_PASSWORD`/`_FROM_ADDRESS`, `TESTPULSE_PUBLIC_URL`
- `apps/api/internal/mailer/` (new package) — thin `net/smtp` wrapper, one plain-text reset email template
- `apps/api/internal/db/migrations/00015_add_password_reset_tokens.sql` — new table, hashed token at rest
- `apps/api/internal/store/password_reset_tokens.go` (new) — create/get-by-hash/mark-used
- `apps/api/internal/service/identity.go` — `ForgotPassword`, `ResetPassword`
- `apps/api/internal/server/identity_handlers.go` — two new public routes, `/api/v1/meta`'s response gains `passwordResetEnabled`
- `packages/shared/openapi.yaml` (+ regenerated `packages/shared/src/api.ts`)
- `apps/web/src/pages/ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx` (new), `LoginPage.tsx` (conditional link)
- `deploy/compose/docker-compose.yml` — a bundled `mailpit` service (MIT-licensed) as the default SMTP target, so the local/eval/E2E stack demos the feature out of the box; the real `testpulse.fly.dev` deployment (`fly.toml`) is untouched
- `docs/api.md`, `docs/deployment.md`, and whichever doc covers `make e2e`'s compose stack (new env vars + Mailpit)
