## Why

As an operator deploying TestPulse for the first time, when I forget to set (or deliberately omit) `TESTPULSE_ADMIN_EMAIL`/`TESTPULSE_ADMIN_PASSWORD`, I want to still be able to create the first admin account through the UI, instead of ending up with an instance that has zero users and no way in short of a restart with both env vars set. `BootstrapAdmin` (`apps/api/internal/service/identity.go`) today no-ops entirely if either var is blank — closing this gap is issue #67, the top card in the board's Planned column.

## What Changes

- If both `TESTPULSE_ADMIN_EMAIL` and `TESTPULSE_ADMIN_PASSWORD` are set, behavior is unchanged — bootstrap from env vars exactly as today.
- If either is blank, the app enforces an interactive first-run setup screen (`/setup`) instead: whoever loads the app while the instance has zero users creates the Tenant Admin account themselves (their own email and password, chosen directly — never a temporary/generated one). Once any user exists, `/setup` closes permanently and the env vars stop being consulted, mirroring `BootstrapAdmin`'s existing "only when the users table is empty" guard. This is bootstrap-only, not an ongoing settings flow.
- New unauthenticated `POST /api/v1/setup` endpoint (`{email, password}` → creates the Tenant Admin, logs in, returns the same shape `POST /api/v1/auth/login` does), re-checking "zero users" server-side at write time and returning `409` to the loser of a race (two people, or the interactive path racing the env-var bootstrap path).
- `GET /api/v1/meta` gains `setupRequired: boolean`.
- The existing `mustChangePassword` forced-change gate is deliberately **not** used here — it exists for admin-*generated* temporary passwords; a password the person just typed themselves has nothing temporary to force a change away from.
- `LoginPage`'s one-shot router-state confirmation banner is generalized to carry an arbitrary message (currently hardcoded to a password-reset-specific string), reused for the "this instance has already been set up" redirect.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `authentication`: adds a new "First-run instance setup" requirement (a narrow, explicit exception to "only a Tenant Admin can create a new account," scoped to the zero-users bootstrap moment only) and a small addition to "Domain routes require authentication" noting `POST /api/v1/setup` joins the existing unauthenticated system routes while setup is pending.

## Impact

- **Code**: `apps/api/internal/service/identity.go` (new setup path, reusing `CreateUser`), `apps/api/internal/server/` (new route + handler), `apps/api/internal/store` (a "user count" or "any user exists" query, if not already present), `packages/shared/openapi.yaml` (`Meta.setupRequired`, new `/api/v1/setup` path), `apps/web/src/pages/` (new `SetupPage.tsx`), `apps/web/src/App.tsx` (new route + `setupRequired` redirect in `RequireAuth`/`AllowAnonymous`), `apps/web/src/lib/useAuth.tsx` (expose `setupRequired`), `apps/web/src/pages/LoginPage.tsx` (generalize the one-shot banner).
- **Docs**: `docs/deployment.md` (admin-bootstrap section, plus a note on the first-loader-claims-admin race for network-reachable instances before setup completes), `docs/development.md` if it documents the admin env vars for local dev.
- **No database schema change** — reuses the existing `users` table and `CreateUser` path.
