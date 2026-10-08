## 1. Discovery script (TDD — plain Node/TS logic, D3)

- [x] 1.1 Write a failing Vitest test for `discoverUrls()`: given a mocked
      `fetch` returning a project list (including one `isSample: true`
      project) and that project's runs list, it resolves `{ projectsUrl,
      projectUrl, libraryUrl, runUrl }` against a given base URL.
- [x] 1.2 Write a failing test for the no-sample-project-found case: throws
      a clear error naming the missing precondition (compose stack not
      seeded/up), rather than resolving `undefined` URLs.
- [x] 1.3 Write a failing test for the sample-project-has-no-runs case:
      throws a clear error rather than resolving an invalid run URL.
- [x] 1.4 Implement `apps/web/perf/discover-urls.mjs` (or `.ts`, matching
      whatever the script runner needs) to pass all three tests — queries
      `GET /api/v1/projects`, filters `isSample`, then
      `GET /api/v1/projects/{key}/runs`, picks the first run.
- [x] 1.5 Run the test suite, confirm all three pass and no other tests
      regressed.

## 2. Lighthouse runner and `make perf-web`

- [x] 2.1 Add `lighthouse` + `chrome-launcher` as devDependencies in
      `apps/web/package.json` (not `@lhci/cli` — design.md D1, ~17 new
      `npm audit` findings with no functional benefit for this scope).
- [x] 2.2 Write `apps/web/perf/run.mjs`: launches Chrome via
      `chrome-launcher`, calls `discoverUrls()`, then for each of the four
      resolved URLs runs `lighthouse()` `numberOfRuns` times (D2), takes
      the median performance/accessibility/best-practices score and
      LCP/TBT/CLS, writes the full JSON result for each run to
      `apps/web/perf/.results/` (git-ignored, D4), and prints a per-page
      summary block to the terminal (D5) — exits 0 regardless of score
      (no threshold/gate, per Goals/Non-Goals).
- [x] 2.3 Add a `.gitignore` entry for `apps/web/perf/.results/`.
- [x] 2.4 Add a `perf-web` target to the root `Makefile`, following the
      exact `perf-api` pattern (tool-presence check if any, one-line
      invocation, help text naming its precondition).
- [x] 2.5 Write `apps/web/perf/README.md` following
      `apps/api/perf/README.md`'s structure: prerequisites (npm
      devDependencies already installed via root `npm install`, a running
      compose stack — no seed step, no token, per D2), running
      instructions, and a pointer to the baseline in `docs/testing.md`.

## 3. Verification and baseline capture

- [x] 3.1 Start the compose stack (`make compose-up`) and run
      `make perf-web` against it; confirm all four pages resolve and
      Lighthouse completes without the command exiting non-zero.
- [x] 3.2 Run the suite at least 3 times; record the resulting
      performance/accessibility/best-practices scores and LCP/TBT/CLS
      per page as a min-max range.
- [x] 3.3 Confirm `make lint`/`make test`/`make coverage-web` all stay
      green (the discovery script's Vitest tests are the only net-new
      coverage surface; `run.mjs` is orchestration-only, not covered by
      lint or coverage gates, same as the k6 script's documented
      exemption). Along the way, adding `discover-urls.test.mjs` shifted
      vitest's worker scheduling enough to expose a genuine pre-existing
      race in `InstanceSettingsPage.test.tsx` (asserted on "Single
      sign-on" synchronously right after an unrelated `findByLabelText`
      resolved, before the state update that mounts `SSOSettingsCard`
      necessarily committed) — fixed by awaiting `findByText('Single
      sign-on')` before the synchronous within-section assertions;
      confirmed green across 3 repeated `coverage-web` runs.

## 4. Documentation

- [x] 4.1 Extend `docs/testing.md`'s Performance section to cover the web
      suite alongside the existing API suite — add a per-page baseline
      table following the existing per-endpoint table's format.
- [x] 4.2 Add a `perf-web` row to `docs/development.md`'s Makefile command
      table, alongside the existing `perf-api`/`seed-perf` rows.

## 5. Sample Project showcase

- [x] 5.1 Confirm (per design.md's Goals/Non-Goals) that no `seed.go`
      change is needed — this is dev/test tooling, not a new user-facing
      product capability. No action beyond this confirmation.
