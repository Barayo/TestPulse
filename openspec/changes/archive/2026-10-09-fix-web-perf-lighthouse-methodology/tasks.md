## 1. Desktop Lighthouse profile (Bug 1)

- [x] 1.1 In `apps/web/perf/run.mjs`, import
      `lighthouse/core/config/desktop-config.js`'s default export and
      pass it as `lighthouse()`'s third argument (replacing `undefined`)
      in `runOnce()`.
- [x] 1.2 Run `make perf-web` once against a running compose stack;
      confirm the saved `.results/*.json`'s `configSettings.formFactor`
      is `"desktop"`, not `"mobile"`.

## 2. Authenticate the suite, drop the public-route dependency (Bug 2)

- [x] 2.1 Update `discover-urls.test.mjs`'s existing assertions to expect
      `/api/v1/projects` and `/api/v1/projects/{key}/runs` instead of
      `/api/v1/public/projects`/`/api/v1/public/projects/{key}/runs`; run
      it and confirm it now fails for the right reason (old code still
      calls the public routes).
- [x] 2.2 Update `discover-urls.mjs` to call the authenticated routes
      instead of the public ones; run the test again and confirm it
      passes.
- [x] 2.3 Add a `login()` helper to `run.mjs`: POSTs
      `{ email: process.env.TESTPULSE_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.TESTPULSE_ADMIN_PASSWORD ||
      'correcthorsebatterystaple' }` to `/api/v1/auth/login`, reads the
      `Set-Cookie` response header, returns the cookie value.
- [x] 2.4 Thread the session cookie through `discoverUrls()`'s fetch
      calls and every `lighthouse()` call in `run.mjs` (via
      `flags.extraHeaders: { Cookie: cookie }`).
- [x] 2.5 Run `make perf-web` against a running compose stack; confirm in
      the saved `.results/projects-*.json` that `requestedUrl` and
      `finalUrl` are now both `http://localhost:8080/` (no redirect) —
      and that `project-*.json`'s page is visibly distinct (different
      `requestedUrl`).
- [x] 2.6 Update `apps/web/perf/README.md`'s prerequisites: no longer "no
      token" — note the compose stack's fixed admin credentials are used
      automatically, nothing for a maintainer to set up by hand.

## 3. `seed-perf` idempotency (Bug 3)

- [x] 3.1 Write a failing Go test `TestSeedPerfFixtureIsIdempotent` in
      `apps/api/cmd/seed-perf/main_test.go`: calls `seedPerfFixture`
      twice against the same service/pool, then asserts exactly 60
      `Perf Load `-prefixed projects exist (not 120).
- [x] 3.2 Run it, confirm it fails (120 projects found).
- [x] 3.3 Implement the fix in `seedPerfFixture`
      (`apps/api/cmd/seed-perf/main.go`): before the main loop, list
      existing projects once; for each `i`, skip `CreateProject` (and the
      folder/filler/run calls) if a project named `Perf Load %02d` already
      exists. (Also had to enrich the actor's `EffectiveUserID`/
      `IsTenantAdmin` fields — `ListProjects` needs them for its
      RBAC-aware query path, which this command's lighter-weight actor
      never previously exercised.)
- [x] 3.4 Run the test again, confirm it passes.
- [x] 3.5 Run the full `cmd/seed-perf` test suite, confirm
      `TestSeedPerfFixtureCreatesSixtyProjects` and
      `TestSeedPerfFixtureLastRunProjectHas120Items` still pass unchanged.
- [x] 3.6 Tighten `apps/api/perf/summaries-and-run-items.js`'s setup
      check from `perfProjects.length < EXPECTED_PROJECT_COUNT` to
      `!== EXPECTED_PROJECT_COUNT`, with a message distinguishing "too
      few" (run `make seed-perf`) from "too many" (wipe the DB and
      reseed).

## 4. Recapture the baseline and verify

- [x] 4.1 Start a fresh compose stack (`docker compose down -v` first if
      one is already running, so `seed-perf`'s idempotency fix is tested
      against a clean DB too), run `make seed-perf`, then run
      `make perf-web` 3 times. (Also ran `make seed-perf` twice in a row
      against the live compose DB — confirmed via the authenticated API
      that exactly 60 `Perf Load` projects exist afterward, not 120 —
      verifying the idempotency fix end-to-end, not just in the Go unit
      test.)
- [x] 4.2 Replace `docs/testing.md`'s entire Web baseline table and
      caption with the newly captured desktop/authenticated numbers —
      do not keep the old mobile/anonymous numbers alongside them.
- [x] 4.3 Confirm `make lint`, `make test` (web + api), and
      `make coverage-web` all stay green. (Two earlier `coverage-web`
      attempts hit vitest worker-pool timeouts with wildly inflated
      durations — consistent with the machine sleeping mid-run, not a
      real regression; a clean retry passed with all four metrics ≥80%.)

## 5. Sample Project showcase

- [x] 5.1 Confirm (per design.md's Non-Goals) that no `seed.go` change is
      needed — this change deliberately does not touch Sample Project
      content. No action beyond this confirmation.
