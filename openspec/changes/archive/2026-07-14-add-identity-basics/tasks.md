# Tasks: Add identity basics

TDD throughout: write the failing test first, then the minimal change to pass
(CLAUDE.md standing rule). Contract-first: `openapi.yaml` changes land in the
same commit as the Go handlers they describe, then `make generate`. Order
below matters — routes are protected last (task 6) so the API stays testable
via `curl`/integration tests the whole way through, per design.md's Migration
Plan.

## 1. Migration and domain types

- [x] 1.1 New migration `00003_identity.sql`: `users` (id, email, password_hash,
      role, created_at), `sessions` (id, user_id, created_at, expires_at),
      `api_tokens` (id, created_by, name, token_hash, token_prefix,
      revoked_at, created_at), `audit_log` (id, actor_kind, actor_id,
      actor_name, action, entity_type, entity_id, occurred_at). Migration
      test asserting the tables and constraints exist (mirrors existing
      migration tests in `apps/api/internal/db`).
- [x] 1.2 Domain types in `apps/api/internal/domain`: `User`, `Role`
      (`admin`/`member`), `Session`, `ApiToken`, `AuditEntry`, and an `Actor`
      type/interface carrying `{ID, Kind, DisplayName}` (design.md D1).

## 2. Store layer (test-first)

- [x] 2.1 `UserRepo`: create, get by email/ID, list, update role, deactivate.
      Password hashing (bcrypt) happens in the service layer, not here —
      store only persists the hash. Integration tests against
      `TESTPULSE_TEST_DATABASE_URL`.
- [x] 2.2 `SessionRepo`: create, get by ID (only if not expired), extend
      expiry (sliding window), delete (logout), delete-all-expired (startup
      cleanup per design.md's session-growth mitigation). Integration tests
      covering expiry and the sliding extension.
- [x] 2.3 `ApiTokenRepo`: create (stores hash + prefix, returns nothing
      secret), get by token hash (for auth), list by creator, list all (admin),
      revoke. Integration tests including "revoked token no longer resolves."
- [x] 2.4 `AuditRepo`: append entry (called within the same transaction as a
      domain write — design.md D5), list by entity ordered oldest-first.
      Integration test asserting an entry survives its actor user being
      deleted (`actor_name` denormalized, per design.md).

## 3. Service layer (test-first)

- [x] 3.1 `AuthService`: `Login(email, password) (*Session, error)` (bcrypt
      compare, session creation), `Logout(sessionID)`, `Authenticate(token
      string) (Actor, error)` for bearer tokens, `AuthenticateSession(id)
      (Actor, error)` for cookies. Unit/service tests for correct-password
      success, wrong-password rejection, expired-session rejection.
- [x] 3.2 `UserService`: create user (admin-only, enforced here or at
      handler layer per design.md D4), list, change role, deactivate.
      Service test for duplicate-email rejection and weak-password
      rejection.
- [x] 3.3 `TokenService`: create (any authenticated user, returns full token
      once), list-own, list-for-user (admin), revoke (creator or admin
      only — design.md D3.1). Service test for the ownership check on
      revoke.
- [x] 3.4 Wire every existing mutating service method (projects, cases,
      suites, runs, folders, users, tokens) to write an `AuditEntry` in the
      same transaction as its domain write. Service tests confirming an
      audit entry is recorded for a representative write in each domain
      area (at least one, not exhaustive per-entity coverage).
- [x] 3.5 Bootstrap-admin-on-first-startup: if the `users` table is empty at
      startup, create one admin from `TESTPULSE_ADMIN_EMAIL` /
      `TESTPULSE_ADMIN_PASSWORD` if both are set (skip silently if unset, so
      existing instances with users are never re-seeded). Test covering
      empty-table-seeds and non-empty-table-skips.

## 4. Contract and handlers (test-first)

- [x] 4.1 Add to `packages/shared/openapi.yaml`: `POST /api/v1/auth/login`,
      `POST /api/v1/auth/logout`, `GET /api/v1/users`, `POST /api/v1/users`,
      `PATCH /api/v1/users/{userId}` (role/deactivate), `GET/POST
      /api/v1/tokens`, `DELETE /api/v1/tokens/{tokenId}`, `GET
      /api/v1/audit?entityType=&entityId=`. `make generate` and commit the
      generated diff.
- [x] 4.2 Handlers for the routes above, each with a handler-level test
      (success + the relevant 401/403 case from the specs' scenarios).
- [x] 4.3 `Authenticate` chi middleware (design.md D6): tries bearer token,
      then session cookie; sets `Actor` on request context; returns `401
      {"error":"unauthorized"}` on failure. `RequireRole(admin)` middleware
      for user-management routes. Middleware tests for both auth paths and
      the role gate.

## 5. Protect existing domain routes and update test infrastructure

- [x] 5.1 Add a test-user/test-session helper to `apps/api/internal/testutil`
      so existing store/service/handler tests can authenticate with minimal
      changes.
- [x] 5.2 Apply `Authenticate` middleware to all existing domain routes
      (projects, cases, suites, runs, folders and sub-resources) except
      `/healthz`, `/readyz`, `/api/v1/meta`, `/api/v1/auth/login`. Update
      every existing handler test to authenticate via the new testutil
      helper. Add the "anonymous request rejected with 401" scenario test
      per route group (representative, not per-endpoint).

## 6. Web UI

- [x] 6.1 `useAuth` hook / auth context: current user (or null), login,
      logout, backed by a `GET /api/v1/users/me`-style check on load (or
      reuse login response) — component test covering authenticated and
      unauthenticated states.
- [x] 6.2 Login page: email/password form, calls login, redirects to the
      previously requested route on success, shows an error on failure.
      Ensure all `api.GET/POST/PUT/DELETE` calls send `credentials:
      'include'` so the session cookie is attached.
- [x] 6.3 App shell: redirect to `/login` when unauthenticated; show the
      current user's name and a logout control when authenticated.
- [x] 6.4 Admin-facing user management screen: list users, create a user,
      change role, deactivate — visible/usable only for `admin` (hide or
      disable for `member`, backed by the real 403 from the API either way).
- [x] 6.5 Token management screen (available to any authenticated user):
      list own tokens (name + prefix, never the full value), create (show
      full value once, with a copy affordance and an explicit "won't be
      shown again" notice), revoke.
- [x] 6.6 Add a Playwright global-setup project that logs in once via the
      real `POST /api/v1/auth/login` (bootstrap admin credentials) and
      saves the resulting cookies as `storageState`; configure
      `playwright.config.ts` so every spec reuses that state instead of
      re-running the login UI flow per test. This exercises the real login
      path once, not a testing-only bypass — no special flag or build mode.
      Update existing E2E specs (`apps/web/e2e/*.spec.ts`) to rely on the
      shared authenticated state so they keep passing under the new auth
      requirement.

## 7. Docs and verification

- [x] 7.1 Update `docs/api.md` (replace the "endpoints are open" warning
      with the real auth section: login/logout, token creation, the 401/403
      contract), `docs/architecture.md` (Actor concept), `docs/development.md`
      (how to log in locally / the bootstrap-admin env vars), and
      `docs/deployment.md` (narrow the untrusted-network warning to reflect
      that auth now exists, pending HTTPS per backlog issue #18).
- [x] 7.2 Full verification sweep: `make coverage-api` (≥80%, with
      `TESTPULSE_TEST_DATABASE_URL` set), `make coverage-web` (≥80% all
      metrics), `make lint`, `make generate` (no contract drift), `make e2e`.
      Manually verify via the running dev stack: login, logout, wrong
      password, create a user as admin, create a token as a member, use the
      token to call a domain route, revoke it and confirm it stops working.
