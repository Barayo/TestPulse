## 1. `cmd/seed-perf` fixture tool

- [x] 1.1 Create `apps/api/cmd/seed-perf/main.go`: connects via
  `TESTPULSE_DATABASE_URL` (same pattern as `cmd/seed-demo`), looks up
  the tenant admin via `sampledata.TenantAdmin` + `domain.WithActor`
  (same pattern `cmd/seed-demo` was just fixed to use), then creates 60
  projects named `Perf Load 01` through `Perf Load 60` via
  `svc.CreateProject`. For `Perf Load 01` through `Perf Load 10`: one
  root folder (`sampledata.RootFolder`), case-fill it via
  `sampledata.Filler` with item counts 20, 30, 40, 50, 60, 70, 80, 90,
  100, 120 respectively (01→20 ... 10→120), then one run via
  `sampledata.RunWithVerdicts` over all the created cases with a mixed
  verdict pattern (reuse the same pass/fail/skip cycling pattern
  `cmd/seed-demo`'s `seedBancaMovil` already uses for its runs).
- [x] 1.2 Write a failing db-integration test
  `apps/api/cmd/seed-perf/main_test.go` (mirrors
  `apps/api/cmd/seed-demo/main_test.go`'s `seededService` helper,
  `testutil.Pool(t, "seedperf")`): confirms `seedPerfFixture(ctx, svc)`
  (the function task 1.1 implements) creates exactly 60 projects named
  with the `Perf Load ` prefix, and that `Perf Load 10`'s run has
  exactly 120 items. Confirmed RED for the right reason (initially
  passed vacuously since the assertion shared the `ProjectCount`
  constant with the implementation — fixed to hardcode the expected
  value, confirmed genuine RED by temporarily breaking the constant,
  then restored).
- [x] 1.3 Implement `seedPerfFixture` per task 1.1's description. Confirm
  GREEN: `TESTPULSE_TEST_DATABASE_URL=... go test ./cmd/seed-perf/...`
  passes.
- [x] 1.4 Add a `seed-perf` target to the root `Makefile`, following
  `seed-demo`'s existing pattern (`cd apps/api && go run
  ./cmd/seed-perf`).

## 2. k6 script: multi-target discovery and rotation

- [x] 2.1 Rewrite `setup()` in
  `apps/api/perf/summaries-and-run-items.js`: call `GET /api/v1/projects`,
  filter to names starting with `Perf Load `, fail fast with a clear
  message if fewer than 60 are found (pointing at `make seed-perf`, not
  `make seed-demo`); for each of the 10 that have runs
  (`Perf Load 01`-`10`), call `GET /api/v1/projects/{key}/runs` and
  collect `{ projectKey, runKey }` into an array; return that array from
  `setup()`.
- [x] 2.2 Update the default (per-iteration) function to pick one
  `{projectKey, runKey}` pair at random from the array each iteration
  (`pairs[Math.floor(Math.random() * pairs.length)]`) for the run-items
  call. The summaries call is unaffected (no per-project input).

## 3. k6 script: pagination walk, warm-up, per-endpoint tagging

- [x] 3.1 Replace the single run-items `http.get` with a loop: fetch a
  page, read `nextCursor` from the response body, pass it as the
  `cursor` query param on the next request, stop when `nextCursor` is
  null. Tag every request in the loop `{ endpoint: 'run_items' }`. Tag
  every summaries call `{ endpoint: 'summaries' }`.
- [x] 3.2 In `setup()`, after discovering targets, issue a small warm-up
  burst (e.g. 3 summaries calls, 2 run-items page-1 fetches against one
  discovered pair) tagged `{ endpoint: 'warmup' }`, before `setup()`
  returns.
- [x] 3.3 Update `options.summaryTrendStats` / the printed summary
  expectations: confirm k6's end-of-run output breaks out
  `http_req_duration{endpoint:summaries}` and
  `{endpoint:run_items}` separately from the blended total. Tagging
  alone wasn't enough — k6 only prints a tag breakdown for metrics
  referenced by a threshold, so added two non-gating
  `http_req_duration{endpoint:...}` threshold entries (p(95)&lt;5000,
  never realistically failing) specifically to surface the breakdown.
  Verified: a real run now prints both tagged sub-metrics separately
  from the blended line.

## 4. Baseline re-capture and docs

- [x] 4.1 Bring up the compose stack, run `make seed-perf`, export a
  scoped `TESTPULSE_PERF_TOKEN`, and run `make perf-api` 3-5 times.
  Record each run's per-endpoint (`summaries`, `run_items`) p95/p99 and
  throughput. Captured 4 runs: summaries p95 3.54-3.88ms/p99
  4.10-5.31ms, run_items p95 3.39-3.67ms/p99 3.99-4.84ms, throughput
  ~3,585-3,767 req/s, 0% failures across all runs.
- [x] 4.2 Update `docs/testing.md`'s Performance section: replace the
  single-sample baseline table with a per-endpoint min-max range from
  task 4.1's runs, document the `make seed-perf` prerequisite (replacing
  the `make seed-demo` reference), and add the one-sentence caveat that
  the throughput number reflects latency at fixed 10-VU concurrency, not
  measured capacity.
- [x] 4.3 Update `apps/api/perf/README.md`'s Prerequisites to reference
  `make seed-perf` instead of `make seed-demo` (keep the existing
  db-port-exposure note from the prior fix — `seed-perf` has the same
  host-reachability requirement).
- [x] 4.4 Add the `seed-perf` target to `docs/development.md`'s Makefile
  command table.

## 5. Final verification

- [x] 5.1 Run `make lint` and `make build`; run
  `TESTPULSE_TEST_DATABASE_URL=... go test ./cmd/seed-perf/...` and
  confirm green. Both exit 0; seed-perf tests pass (fresh, uncached).
- [x] 5.2 Confirm `git diff --stat` matches design.md's Impact section
  (`apps/api/cmd/seed-perf/`, `Makefile`,
  `apps/api/perf/summaries-and-run-items.js`, `apps/api/perf/README.md`,
  `docs/testing.md`, `docs/development.md` — no production code
  touched). Confirmed exact match (also found and removed a stray
  `apps/api/seed-perf` build artifact from an earlier `go build`).
