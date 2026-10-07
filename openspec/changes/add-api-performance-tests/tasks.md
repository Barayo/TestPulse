## 1. Suite scaffolding

- [x] 1.1 Create `apps/api/perf/` directory. Add `apps/api/perf/README.md`
  documenting: k6 is a standalone binary (not an npm/Go dependency —
  install via https://k6.io/docs/get-started/installation/, matching how
  `golangci-lint`/`helm`/`kind` are already documented as external
  prerequisites in `docs/development.md`), the compose stack + `make
  seed-demo` precondition, and how to create/export a scoped API token
  for `TESTPULSE_PERF_TOKEN`.
- [x] 1.2 Add `apps/api/perf/summaries-and-run-items.js`: a k6 script with
  a `setup()` function that (a) fails fast with a clear message if
  `__ENV.TESTPULSE_PERF_TOKEN` is unset, (b) calls `GET /api/v1/projects`
  once to find the "Banca Móvil" project by name and get its `key`
  (`ProjectSummary` only has `projectId`, the internal UUID — no name or
  `key` — so it can't be used for discovery; see design.md's Context),
  (c) calls `GET /api/v1/projects/{projectKey}/runs` to find a run, and
  returns `{ projectKey, runKey }` for use by the default function.
- [x] 1.3 Implement the default (per-iteration) function: using the
  `Authorization: Bearer` header from `TESTPULSE_PERF_TOKEN`, call
  `GET /api/v1/projects/summaries` and
  `GET /api/v1/runs/{runKey}/items` each iteration (weighted scenario:
  summaries is the cheaper/more frequent call in real usage — the
  project list page loads it on every visit — so give it roughly 2x the
  weight of the run-items call). Add `check()` assertions that each
  response is status 200, matching k6's idiomatic pattern.
- [x] 1.4 Set `options.thresholds` to an informational-only config (e.g.
  `http_req_duration` with no `abortOnFail`) — per design.md D4, this
  suite does not gate the command's exit code on latency.

## 2. Makefile target

- [x] 2.1 Add a `perf-api` target to the root `Makefile`: runs
  `k6 run apps/api/perf/summaries-and-run-items.js` with a clear error
  if the `k6` binary isn't on `PATH` (check via `command -v k6` with a
  helpful install-link message, matching the style of existing
  precondition checks in the Makefile).
- [x] 2.2 Manually verify: with the compose stack up, `make seed-demo`
  run, and a real scoped token exported as `TESTPULSE_PERF_TOKEN`, run
  `make perf-api` and confirm it completes, printing k6's summary
  (requests, p95/p99 latency, throughput) with exit code 0. Verified:
  exit 0, 100% checks passed, 0 failed requests across two consecutive
  runs.
- [x] 2.3 Manually verify the fail-fast path: run `make perf-api` with
  `TESTPULSE_PERF_TOKEN` unset and confirm it exits immediately with the
  clear error from task 1.2, not a wall of 401s. Verified: exits 2 with
  "TESTPULSE_PERF_TOKEN is not set..." — no requests attempted.

## 3. Baseline capture and docs

- [x] 3.1 With the compose stack up and `make seed-demo` run, execute
  `make perf-api` and capture the real p95/p99 latency and req/s numbers
  k6 reports for each endpoint. Captured: p95=2.38ms, p99=2.79ms,
  ~5,599 req/s, 0% failures (10 VUs, 30s, Apple M-series dev laptop).
- [x] 3.2 Add a new "Performance" section to `docs/testing.md` (after
  the existing "Dogfooding" section): what the suite covers, how to run
  `make perf-api` (prerequisites: compose stack, `make seed-demo`, a
  scoped token), and the captured baseline numbers from 3.1 with the
  date they were captured and the machine/environment they ran on (so
  future readers know these aren't a certified SLA — see design.md's
  Risks).
- [x] 3.3 Add the `perf-api` target to `docs/development.md`'s Makefile
  command table.

## 4. Final verification

- [x] 4.1 Run `make lint` and `make build` to confirm the new Makefile
  target and perf script don't break anything in the existing build
  (the k6 script itself isn't Go/TS, so it's not linted/typechecked by
  existing tooling — confirm this is stated, not silently assumed, in
  the perf/README.md from task 1.1). Both exit 0; README.md states the
  lint-exemption explicitly.
- [x] 4.2 Confirm `git diff --stat` matches design.md's Impact section
  (`apps/api/perf/`, `Makefile`, `docs/testing.md`,
  `docs/development.md` — no production code touched). Confirmed exact
  match.
