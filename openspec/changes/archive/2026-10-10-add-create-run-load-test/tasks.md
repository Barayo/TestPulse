## 1. seed-perf: CreateRun scratch project

- [x] 1.1 Write a failing test in `apps/api/cmd/seed-perf/main_test.go`
  (`TestSeedPerfFixtureCreatesWriteLoadProject`) asserting that after
  `seedPerfFixture` runs, a project named "Perf Write Load" exists with
  exactly 500 cases and zero runs. Run `go test ./apps/api/cmd/seed-perf/...`
  and confirm it fails (project not found).
- [x] 1.2 In `apps/api/cmd/seed-perf/main.go`, add a step after the
  existing `ProjectCount` loop in `seedPerfFixture`: skip-if-exists
  (mirroring the existing `existingNames` check) create project "Perf
  Write Load", its root folder, and 500 filler cases via
  `sampledata.Filler`. No run is created for this project.
- [x] 1.3 Run `go test ./apps/api/cmd/seed-perf/...` and confirm
  `TestSeedPerfFixtureCreatesWriteLoadProject` now passes, and the
  existing `TestSeedPerfFixtureCreatesSixtyProjects` /
  `TestSeedPerfFixtureIsIdempotent` still pass unchanged (confirming
  "Perf Write Load" doesn't match their `Perf Load ` prefix filter).
- [x] 1.4 Write a failing test asserting idempotency specifically for
  the new project: running `seedPerfFixture` twice yields exactly one
  "Perf Write Load" project, not two. Confirm it fails first if the
  skip-if-exists check from 1.2 were absent (temporarily verify by
  inspection/comment, not by reverting code), then confirm it passes
  with 1.2's implementation in place.
- [x] 1.5 Commit: `feat(seed-perf): add Perf Write Load scratch project for CreateRun load test`.

## 2. k6: CreateRun write scenario

- [x] 2.1 In `apps/api/perf/summaries-and-run-items.js`, add a
  `create_run_write` entry to `options.scenarios` (`constant-vus`, 5
  VUs, 30s duration, matching the existing scenario's structure).
- [x] 2.2 In `setup()`, look up the "Perf Write Load" project by exact
  name from the already-fetched `allProjects` list; `fail()` with a
  "run `make seed-perf`" hint if missing, mirroring the existing
  `perfProjects.length` check's error style.
- [x] 2.3 In `setup()`, walk `GET
  /api/v1/projects/{perfWriteLoad.key}/cases?limit=200` following
  `nextCursor` until null, collecting all case keys (expect ~500);
  `fail()` if the count comes back as 0. Add the resulting array and
  the project's key to the returned `setup()` data.
- [x] 2.4 Add new tagged threshold entries
  (`http_req_duration{endpoint:create_run}` and
  `{endpoint:create_run_delete}`) to `options.thresholds`, mirroring the
  existing informational-only, never-realistically-fails pattern.
- [x] 2.5 Add a new exported scenario function (referenced by the
  `create_run_write` scenario's `exec` field) that: builds a per-
  iteration-unique run name (`__VU`/`__ITER` suffix), `POST`s
  `/api/v1/projects/{perfWriteLoad.key}/runs` with the full case-key
  array tagged `endpoint: create_run`, `check()`s for 201, then — if
  successful — extracts the created run's key from the response body
  and `DELETE`s `/api/v1/runs/{runKey}` tagged `endpoint:
  create_run_delete`, `check()`ing for 204.
- [x] 2.6 Run `make seed-perf` then `make perf-api` against a local
  compose stack (see `apps/api/perf/README.md` prerequisites) and
  manually verify: the terminal summary shows `create_run` and
  `create_run_delete` tagged entries with 0% check failures, and that
  "Perf Write Load" has 0 runs in the UI after the suite completes
  (confirming no run accumulation).
- [x] 2.7 Commit: `feat(perf): add CreateRun write-path load scenario`.

## 3. Docs

- [x] 3.1 Update `apps/api/perf/README.md`: mention the new "Perf Write
  Load" scratch project under Prerequisites, and the new scenario under
  Running.
- [x] 3.2 Capture a fresh baseline: run `make perf-api` at least 3 times
  against a local compose stack, record the `create_run`/
  `create_run_delete` p95/p99 latency range (and throughput/failure rate)
  alongside the existing two endpoints' numbers.
- [x] 3.3 Update `docs/testing.md`'s API Performance section: add a
  `create_run` column (or a new small table, matching the existing
  per-endpoint table style) with the captured baseline range, same
  "range across N runs, not a single sample, not an SLA" framing as the
  existing rows.
- [x] 3.4 Commit: `docs(testing): record CreateRun load-test baseline`.

## 4. Spec sync & archive

- [x] 4.1 Verify `openspec validate --change add-create-run-load-test
  --strict` passes.
- [ ] 4.2 Run `/opsx:archive add-create-run-load-test`, syncing the
  `api-performance-testing` delta spec into
  `openspec/specs/api-performance-testing/spec.md`.
