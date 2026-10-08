## Why

As a TestPulse maintainer, when I ship a UI change to one of the app's heaviest
pages (the Library browser's section tree, the run execution board), I want
to know whether I've regressed its load/interactivity performance — today
there is no performance signal for the frontend at all, only functional
coverage (Vitest unit tests + Playwright E2E). `api-performance-testing`
(#22/#216) already closed this gap for the API's two highest-aggregation-cost
endpoints; the web UI has the same blind spot and the same fix shape applies.

## What Changes

- Add a local/manual Lighthouse suite (the `lighthouse` + `chrome-launcher`
  packages directly, not `@lhci/cli` — see design.md D1, chosen after
  `@lhci/cli` was found to add ~17 new high/moderate `npm audit` findings
  with zero functional benefit for this change's scope) covering the web
  app's four heaviest/most representative pages: the project list (`/`), a
  project landing page (`/projects/:projectKey`), the Library two-pane
  browser (`/projects/:projectKey/library`), and the run execution board
  (`/runs/:runKey`).
- A small Node discovery script resolves the always-on Sample Project's real
  key and a real run key from the running API at suite-start, rather than
  hardcoding keys that aren't guaranteed stable across reseeds.
- No authentication setup needed: all four target routes already support
  anonymous access for a publicly-accessible project
  (`unify-authenticated-and-public-views`), and the Sample Project is marked
  public specifically so it's reachable without a session
  (`apps/api/internal/sampledata/seed.go:63`).
- `make perf-web` runs the suite against a running compose stack and reports
  Lighthouse's performance/accessibility/best-practices scores plus key
  metrics (LCP, TBT, CLS) to the terminal — informational only, no pass/fail
  gate, mirroring `api-performance-testing`'s "baseline, not a gate" shape.
- `docs/testing.md`'s Performance section is extended to cover both the API
  and web suites; `docs/development.md`'s Makefile table gets a `perf-web`
  row.
- Out of scope: wiring this into any CI workflow (tracked separately as
  issue #24, currently blocked on this change existing first).

## Capabilities

### New Capabilities
- `web-performance-testing`: a local Lighthouse CI suite establishing a
  documented load-performance baseline for the web app's heaviest pages, not
  a CI pass/fail gate.

### Modified Capabilities
(none — `api-performance-testing`'s requirements are unaffected; this is a
new, parallel capability for the web app rather than a change to the API
suite's behavior)

## Impact

- New: `apps/web/perf/` (discovery script + runner script),
  `apps/web/perf/README.md`.
- `apps/web/package.json`: new `lighthouse` + `chrome-launcher`
  devDependencies, no change to production dependencies, no new
  `npm audit` findings (verified).
- `Makefile`: new `perf-web` target.
- `docs/testing.md`, `docs/development.md`: documentation updates.
- No API, schema, or production web code changes — this is dev/test
  tooling only, same category as `apps/api/perf/`.
