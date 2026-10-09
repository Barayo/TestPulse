## Why

As a maintainer about to wire these suites into CI (#24), when I inspect
the baseline `add-web-performance-lighthouse` (#23) actually captured, I
want its numbers to measure what they claim to measure — today three
methodology bugs, found via a same-day post-ship review (a direct review
plus an independent Pepe/Fable5 dispatch, both converging on the same
findings), mean they don't: fixing them now avoids baking bad data into
#24's first CI-captured report.

## What Changes

- **Lighthouse now scores desktop, not mobile.** `apps/web/perf/run.mjs`
  passed no config, so every run inherited Lighthouse's default mobile
  profile (412px viewport, 4x CPU slowdown) — the wrong profile for a
  desktop test-management tool. Switches to `lighthouse`'s own
  `desktop-config.js` preset.
- **The suite now authenticates**, fixing a silent measurement bug: the
  `/` (project list) page redirects anonymous visitors straight to the
  project landing page when exactly one public project exists
  (`ProjectsPage.tsx:284`) — so the suite's "projects" and "project"
  baseline rows were measuring the identical rendered page. Logs in once
  via the compose stack's fixed admin credentials and carries the session
  cookie into every Lighthouse run. `discover-urls.mjs` switches from the
  unauthenticated `/api/v1/public/*` routes to the authenticated
  `/api/v1/projects`/`/api/v1/projects/{key}/runs` routes, now that auth
  exists anyway (matching the k6 suite's own discovery pattern).
- **`make seed-perf` is now safely re-runnable.** It previously created a
  fresh set of 60 "Perf Load NN" projects on every invocation with no
  existence check, silently duplicating the fixture (120, 180, ...) on a
  second run against a non-wiped DB — and the k6 suite's own guard
  (`< EXPECTED_PROJECT_COUNT`) is a floor that passes at any multiple of
  60, masking the drift. `seedPerfFixture` now skips any `Perf Load NN`
  project that already exists; the k6 check becomes an exact match.
- The entire 3-run web baseline in `docs/testing.md` is recaptured under
  the corrected desktop+authenticated methodology — the previous numbers
  were measuring the wrong thing and are fully replaced, not kept
  alongside the new ones.

## Capabilities

### Modified Capabilities
- `web-performance-testing`: the "no authentication setup is required"
  scenario is removed (the suite now authenticates); a new requirement
  covers the desktop-profile and distinct-page guarantees.
- `api-performance-testing`: `make seed-perf` gains an idempotent-rerun
  requirement.

## Impact

- `apps/web/perf/run.mjs`, `apps/web/perf/discover-urls.mjs` (+ its
  existing Vitest tests), `apps/web/perf/README.md`.
- `apps/api/cmd/seed-perf/main.go` (+ its existing Go tests),
  `apps/api/perf/summaries-and-run-items.js` (one-line check tightened).
- `docs/testing.md`: web Performance baseline fully recaptured and
  rewritten.
- No API, schema, or production web code changes — dev/test tooling only,
  same category as the changes this corrects.
