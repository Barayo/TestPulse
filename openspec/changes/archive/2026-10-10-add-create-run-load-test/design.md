## Context

`apps/api/perf/summaries-and-run-items.js` (k6) currently covers two
read-only endpoints: `GET /api/v1/projects/summaries` and
`GET /api/v1/runs/{runKey}/items`. `CreateRun` — the write path that
actually regressed once (#180: unbounded, sequential per-case-key DB
round trips in case-key resolution) — has zero load-test coverage. The
fix for #180 is already live and confirmed in the current code:

- `apps/api/internal/server/handlers.go`'s `createRun` calls
  `h.svc.CaseIDsByKeys` (batched), not a per-key loop.
- `apps/api/internal/service/service.go`'s `CreateRun` resolves every
  case ID's project ownership via one `s.store.Cases.ProjectIDs(ctx,
  unique)` call, with a comment citing #180 directly.

So this change is not a bug fix — it's a regression guard: a baseline
that would visibly degrade if the batched call were ever replaced with
a per-key loop again.

`DeleteRun` (`service.go`) is a real, already-implemented, synchronous
endpoint (`DELETE /api/v1/runs/{runKey}`, `PermRunDelete`) — "a thin
passthrough, the FK cascade does the real work." Unlike `DeleteProject`
(archive-first precondition + async background reaper), it needs no
special handling, which is what makes a create-then-delete load cycle
tractable without new backend work.

`make seed-perf` (`apps/api/cmd/seed-perf/main.go`) today creates
exactly 60 "Perf Load NN" projects (`ProjectCount = 60`). That exact
count is load-bearing: the existing k6 script's `setup()` hard-fails
unless `perfProjects.length === EXPECTED_PROJECT_COUNT` (60), filtering
on `name.startsWith('Perf Load ')`, and `seed-perf`'s own tests hardcode
`wantProjects = 60`. Any new fixture project must not collide with that
filter.

## Goals / Non-Goals

**Goals:**
- Give `CreateRun` a load-test baseline, reported separately from the
  two existing read endpoints, exercising the actual regressed path
  (case-key resolution) at a scale where a reintroduced per-key loop
  would be visible in wall-clock terms.
- Keep the suite's write activity self-cleaning — no run accumulation
  across repeated invocations.
- Reuse the existing single k6 script/command (`make perf-api`) rather
  than introducing a second suite to run and document separately.

**Non-Goals:**
- Fixing `expandCaseIntoSpecs`'s own un-batched per-case
  `s.store.Cases.Get` call (`service.go`, inside `CreateRun`'s spec-
  expansion loop) — a separate, smaller N+1 than #180's. This load test
  will incidentally measure its cost too (it's on the same request
  path), but that's a known baseline characteristic to note, not a bug
  this change fixes.
- Wiring either suite into CI (still local/manual, per
  `api-performance-testing`'s existing Non-Goals).
- Any change to `CreateRun`/`DeleteRun` production code — this change is
  test-suite/fixture only.

## Decisions

**D1 — New scratch project, not a bigger existing one.** Add one new
`seed-perf` project named `"Perf Write Load"` with 500 bare filler cases
and no pre-made run. Deliberately *not* prefixed `"Perf Load "` — the
existing read-suite's `EXPECTED_PROJECT_COUNT` check and `seed-perf`'s
own `wantProjects = 60` tests both filter/count on that exact prefix;
a same-prefixed addition would silently break both. 500 cases is large
enough that a reintroduced per-key round trip (even at ~1-2ms each)
adds hundreds of milliseconds of clearly-visible latency against a
batched call's expected single-digit-millisecond cost, without
materially slowing `seed-perf`'s own runtime. Created idempotently
(skip-if-exists by name), as its own step after the existing
`ProjectCount` loop in `seedPerfFixture` — not folded into the numbered
`Perf Load NN` loop, since it isn't part of that counted/paired family.

**D2 — One scenario added to the existing script, not a new file.** Add
a third entry to `summaries-and-run-items.js`'s `options.scenarios`
(`create_run_write`: `constant-vus`, 5 VUs, 30s — fewer VUs than the
read scenario's 10, since each iteration here is strictly heavier: a
500-case-key batched resolution plus a full run-creation write,
followed by a delete). k6 runs all top-level scenarios concurrently by
default — no `startTime` stagger needed. That's a feature here, not a
complication: the suite's one 30s run becomes a realistic mixed
read+write load, and tag-based reporting already keeps the three
endpoints' numbers unblended.

**D3 — Create-then-delete every iteration, same tag.** Each
`create_run_write` iteration does `POST
/api/v1/projects/{perfWriteLoad.key}/runs` with all ~500 case keys
(fetched once in `setup()`) and a per-iteration-unique name (`__VU`/
`__ITER` suffix), tagged `endpoint: create_run`, then immediately
`DELETE /api/v1/runs/{runKey}`, tagged `endpoint: create_run_delete` (a
distinct tag, not reused) — the two operations have very different
expected costs (a multi-row write + spec expansion vs. an FK-cascade
delete), and blending them under one tag would make neither baseline
number meaningful. Both responses are `check()`ed (201, then 204); no
error aborts the scenario (informational baseline, not a gate, per the
capability's existing D4-equivalent rule) — a failed delete just means
that one run is left behind, logged via the check failure count, not a
suite-aborting condition.

**D4 — `setup()` fetches the case list once, not per iteration.** The
~500 case keys are fetched once via the existing cursor-paginated `GET
.../cases` envelope (`limit=200`, 2-3 requests, same shape the suite
already walks for run-items), cached in `setup()`'s returned data
alongside the existing `pairs`. Fetching it fresh every iteration would
time an unrelated read endpoint inside what's supposed to be a pure
write-path measurement.

**D5 — Reporting reuses the existing informational-threshold pattern.**
New `http_req_duration{endpoint:create_run}` /
`{endpoint:create_run_delete}` threshold entries, set high enough to
never realistically fail, mirroring the existing `summaries`/`run_items`
entries. `summary.json` (via `handleSummary`) needs no script change —
it already serializes k6's full tag-keyed `data` object, so the new
tags appear automatically.

## Risks / Trade-offs

- **Risk:** Concurrent `create_run_write` VUs all write to the same
  "Perf Write Load" project simultaneously — if one iteration's delete
  is slow/fails, a later iteration still creates its own independent
  run (unique name), so there's no cross-iteration contention beyond
  ordinary DB-row-level concurrency already present in real usage. →
  Mitigation: none needed; this is realistic concurrent-create behavior,
  not a test artifact to suppress.
- **Risk:** A failed `DELETE` (e.g. a flaky request) leaves one orphan
  run in "Perf Write Load" after a suite run. → Mitigation: harmless —
  future runs still create their own uniquely-named runs; an operator
  can manually clean up via `docker compose down -v` + re-seed if the
  project ever needs a reset, same recovery path as any other fixture
  drift.
- **Trade-off:** Running `create_run_write` concurrently with the read
  scenarios (D2) means the three endpoints' numbers reflect a mixed-load
  system state, not isolated single-endpoint conditions. Accepted: this
  is more representative of real traffic than three serial, isolated
  runs, and avoids tripling the suite's total wall-clock runtime.

## Migration Plan

No migration — dev/test tooling only. Rollout is: merge, re-run `make
seed-perf` locally (idempotent — safe to re-run against an
already-seeded database), capture a fresh baseline for
`docs/testing.md`. No rollback concerns; reverting the commit removes
the new scenario and fixture project with no residual state beyond the
scratch project itself (harmless to leave in place or wipe via `docker
compose down -v`).

## Open Questions

None — all prior open questions from #218's issue body (fixture/cleanup
strategy, realistic exercise of the regressed path, separate reporting)
are resolved by D1-D5 above.
