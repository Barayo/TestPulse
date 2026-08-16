## 1. Service: HasAnyUser + SetupFirstAdmin (TDD)

- [x] 1.1 Write a failing test in `apps/api/internal/service/identity_test.go` for `HasAnyUser`: false on an empty instance, true once a user exists. Mirror `TestHasAnyProjectReflectsInstanceState`'s shape.
- [x] 1.2 Add `Service.HasAnyUser(ctx) (bool, error)` in `apps/api/internal/service/identity.go`, mirroring `HasAnyProject` (`len(s.store.Users.List(ctx)) > 0`). Confirm 1.1 passes.
- [x] 1.3 Write failing tests for a new `Service.SetupFirstAdmin(ctx, email, password) (domain.Session, domain.User, error)`: creates a Tenant Admin via the same path `CreateUser` uses (email-derived display name, no `mustChangePassword`), creates a session for it (same as `Login`), and rejects with a distinguishable error when a user already exists — including a same-instant-race case (two calls, only one succeeds).
- [x] 1.4 Implement `SetupFirstAdmin`: re-check `HasAnyUser` immediately before creating the account (not trusting a caller's earlier check), call `CreateUser(ctx, email, password, true)`, then create a session the same way `Login` does. Return a sentinel/typed error (e.g. `errAlreadySetUp`) on the already-has-users case so the handler can map it to `409`. Confirm 1.3 passes. (Used the existing `service.ConflictError`/`conflict(...)` helper rather than a new sentinel — already maps to 409 in `respond`.)
- [x] 1.5 Confirm the race test is genuinely exercising the guard: run concurrent calls against a real test database (`TESTPULSE_TEST_DATABASE_URL`), not just sequential calls — a unique constraint or transaction-level check may be needed if the naive read-then-write has a real gap; decide and implement whichever closes it. (Implemented `store.Users.CreateFirstAdmin` with a Postgres advisory transaction lock, `pg_advisory_xact_lock` — no schema change needed. Race test passes 5 concurrent goroutines against real Postgres: exactly 1 success, exactly 1 user row.)

## 2. API contract

- [x] 2.1 Add `setupRequired: boolean` to `Meta` in `packages/shared/openapi.yaml`.
- [x] 2.2 Add `POST /api/v1/setup` to `packages/shared/openapi.yaml`: unauthenticated, body `{email, password}`, `200` with the same response shape as `POST /api/v1/auth/login` (sets the session cookie), `409` when the instance already has a user, `400` on validation failure (weak password, invalid email, duplicate — though duplicate can't occur pre-any-user).
- [x] 2.3 `make generate` (regenerate the TypeScript client); confirm no drift.

## 3. Server: setup route + meta field

- [x] 3.1 Write a failing scenario test (`apps/api/internal/server/*_test.go`, following this codebase's existing scenario-test pattern) for `POST /api/v1/setup`: succeeds and sets a session cookie on an empty instance; returns `409` and creates nothing when a user already exists.
- [x] 3.2 Add the handler (new file or alongside `identity_handlers.go`), mounted unauthenticated (same route group as `/auth/login`, no rate limiter needed — it's self-closing after first use, not a repeatable brute-force surface). Confirm 3.1 passes.
- [x] 3.3 Wire `setupRequired` into the existing meta handler (`instance_settings_handlers.go` or wherever `GET /api/v1/meta` lives), backed by `Service.HasAnyUser`. Add/extend a test asserting `setupRequired` is `true` on an empty instance and `false` once a user exists. (`handleMeta` lives in `server.go`, not `instance_settings_handlers.go` — updated in place.)
- [x] 3.4 Found via manual local testing (real docker-compose deploy, not just automated tests): `main.go`'s boot-time Sample Project seed (`seedSampleProjectIfEmpty`, right after `BootstrapAdmin`) has nobody to attribute the seed to on a first-run-setup instance — `BootstrapAdmin` is a no-op with no env vars set, so the boot-time attempt fails ("no tenant admin user found") and, being a one-shot startup check, never retries. Fixed by calling the same seed-if-empty logic again in `setupFirstAdmin`'s handler after a successful account creation (`identity_handlers.go`'s `(h *api) seedSampleProjectIfEmpty`, necessarily a separate small duplicate of `main.go`'s function — `sampledata` imports `service`, so `service` can't call back into it, and `cmd/testpulse-api` can't be imported from `internal/server`). TDD: `TestScenario_SetupSeedsSampleProject` (RED confirmed, then GREEN). Verified live via a real local deploy with the admin env vars unset — Sample Project now shows up immediately after completing `/setup`.

## 4. Frontend: setupRequired plumbing

- [x] 4.1 Extend `AuthProvider` (`apps/web/src/lib/useAuth.tsx`) to fetch `setupRequired` from `/api/v1/meta` alongside its existing `/api/v1/users/me` check, expose it via context. Update/add a test. (Fetched in parallel, independent try/catch — a hung/failed `/api/v1/meta` must never block `loading`, which still reflects only `/users/me`; caught via a real regression during TDD, see `useAuth.test.tsx`'s "does not block loading on a /api/v1/meta request that never resolves".)
- [x] 4.2 In `App.tsx`, add `if (setupRequired) return <Navigate to="/setup" replace />` to both `RequireAuth` and `AllowAnonymous`, ahead of their existing checks. Update `App.test.tsx`'s route-manifest test if it enumerates wrapper behavior. (Route-manifest test unaffected — `/setup` route added directly in App's `<Routes>`, not through either categorized array.)

## 5. Frontend: SetupPage (TDD)

- [x] 5.1 Write failing tests in a new `apps/web/src/pages/SetupPage.test.tsx`: renders the form (email, password with generate shortcut, confirm password, warning callout, "Create admin account" button); submitting valid matching values calls `POST /api/v1/setup` and navigates to `/`; a `409` response navigates to `/login` with the "already set up" message; visiting while `setupRequired` is false redirects to `/login`.
- [x] 5.2 Implement `SetupPage.tsx` per the agreed design: `LoginPage`-identical `Card`/`HealthBadge` shell, warning callout before the form (reusing `ChangePasswordForm`'s visual idiom), fields matching `ResetPasswordPage`'s set (email, password + `GeneratedPasswordChip`, confirm password), submit "Create admin account" / "Creating…", no footer links, auto-login + navigate to `/` on success (reusing `LoginForm.onSuccess`'s navigation pattern). Confirm 5.1 passes. (Added `AuthContext.setup()`, mirroring `login()`, so a successful submission updates both `user` and `setupRequired` in context — without it, navigating to `/` would leave stale context state bouncing back to `/setup`. Caught and fixed a real race during TDD: a successful setup flips `setupRequired` to `false` as a side effect, which — without a `justSucceeded` guard — tripped the page's own stale-visit redirect before the explicit `navigate('/')` took effect.)
- [x] 5.3 Add the `/setup` route to `App.tsx`, bare (not wrapped in `RequireAuth`/`AllowAnonymous`), alongside `/login`/`/forgot-password`/`/reset-password`.

## 6. Generalize LoginPage's one-shot banner

- [x] 6.1 Write a failing test asserting `LoginPage` can render an arbitrary router-state message via its existing one-shot banner mechanism, not only the hardcoded password-reset string.
- [x] 6.2 Generalize `LoginPage.tsx`'s banner state to accept a message from `location.state`, defaulting to today's password-reset text when that's the source; `SetupPage`'s `409` handler navigates to `/login` with `{ message: "This instance has already been set up — log in with an existing account." }`. Confirm 6.1 passes, and confirm the existing `ResetPasswordPage` → `LoginPage` banner flow still passes unchanged.

## 7. E2E coverage

- [x] 7.1 New `apps/web/e2e/first-run-setup.spec.ts`: titled with the requirement/scenario names from the spec delta. Scoped down from the original task description during implementation — the shared compose stack (`make e2e`) always boots with a bootstrap admin already seeded (`docker-compose.yml`'s env vars, consumed by `global-setup.ts` before any spec runs), so every browser session in this suite is always past the zero-users moment; the actual account-creation form can't be reached through real navigation without wiping the shared database out from under every other parallel spec. Covered instead: the stale-`/setup`-visit redirect (genuinely browser-only, real routing/API integration). The account-creation/race/rejection scenarios are covered as real HTTP-to-Postgres integration tests in `apps/api/internal/server/setup_api_test.go` and `apps/api/internal/service/identity_test.go` (`TestSetupFirstAdminRaceOnlyOneSucceeds`), satisfying `docs/testing.md`'s "every scenario becomes at least one automated test" without a disruptive separate-instance E2E harness.

## 8. Docs

- [x] 8.1 Update `docs/deployment.md`'s admin-bootstrap section: document the new zero-env-vars first-run setup path, and add the explicit network-access warning (configure the admin env vars before first boot, or restrict access until setup completes, for any instance reachable by untrusted parties pre-setup).
- [x] 8.2 Update `docs/development.md` if it documents the admin env vars for local dev, to mention the fallback.
- [x] 8.3 Update `docs/api.md` with the new `POST /api/v1/setup` endpoint and `Meta.setupRequired` field.

## 9. Sample Project showcase

- [x] 9.1 N/A — this is a first-boot bootstrap mechanism, not a user-facing capability the Sample Project can demonstrate (the Sample Project only exists once an instance is already configured). No `seed.go`/`seed_test.go` changes.

## 10. Close out

- [ ] 10.1 Sync this change's specs delta into `openspec/specs/authentication/spec.md`.
- [ ] 10.2 Archive this OpenSpec change.
