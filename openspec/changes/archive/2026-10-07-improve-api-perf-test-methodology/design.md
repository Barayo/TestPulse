## Context

`add-api-performance-tests` (#22, archived 2026-10-07) shipped a k6
suite and a single captured baseline. A performance-testing-methodology
review (issue #216) found the suite, as shipped, structurally cannot
detect the regressions it exists to catch:

- `GET /api/v1/projects/summaries` has no project-key input — it
  aggregates every non-archived project in one query
  (`store/projects.go`'s `Summaries()`, 5 grouped queries). Its whole
  design claim is staying flat as project count grows. `make seed-demo`
  only ever has ~3 non-archived projects (Banca Móvil, Desktop App, the
  always-on Sample Project) — too few for an accidental per-project
  round trip to show up in wall-clock terms.
- `GET /api/v1/runs/{runKey}/items` is cursor-paginated,
  `DefaultPageLimit = 50` / `MaxPageLimit = 200`
  (`store/pagination.go:14-15`). `make seed-demo`'s biggest run has 19
  items — under the default limit, so the suite's single `GET` per
  iteration never triggers a second page. The cursor-seek path this
  endpoint exists to validate is never exercised.
- Every VU/iteration in the shipped script hits the exact same
  project/run pair for the full 30s — Postgres's plan/buffer cache and
  the OS page cache are warmed after the first few iterations, so the
  reported numbers reflect a best-case, not realistic mixed traffic.
- The captured baseline is a single 30s sample with no replication — a
  future differing number is uninterpretable without knowing this
  sample's natural variance.

## Goals / Non-Goals

**Goals:**
- A fixture large enough that the summaries endpoint's "flat regardless
  of project count" claim and the run-items endpoint's multi-page
  cursor-seek path are both actually exercised by a suite run.
- Query targets vary per iteration instead of hitting one hot row/query
  plan for the whole run.
- A brief warm-up excluded from the reported baseline numbers.
- Per-endpoint (not blended) p95/p99 in the recorded baseline.
- A documented baseline captured as a range across several runs, not a
  single sample.

**Non-Goals:**
- Server-side telemetry correlation (query plans, connection-pool
  saturation, Go process CPU/GC) — #216 itself flags this as a bigger
  lift to fold in later only if cheap; out of scope here.
- CI wiring — still backlog #24, still blocked on #23 (web/Lighthouse),
  unrelated to this change.
- Growing `make seed-demo` itself — it serves a different audience
  (UI/design review) at a deliberately small, illustrative scale
  documented elsewhere; distorting it for load-test purposes would be
  scope creep onto a tool other work depends on.

## Decisions

### D1: A new, separate `cmd/seed-perf` tool, not a bigger `seed-demo`
`make seed-demo` exists for UI/design review at two illustrative
projects — growing it to 60+ projects for an unrelated purpose would
break that tool's own documented scope for everyone who uses it that
way. `apps/api/cmd/seed-perf/` is new, purpose-built, and reuses
`sampledata.Filler`/`RunWithVerdicts`/`RootFolder`
(`internal/sampledata/helpers.go`) and the same tenant-admin-actor
pattern `cmd/seed-demo` was just fixed to use — same shape, different
scale, separate tool.

### D2: Fixture shape — 60 projects named `Perf Load 01`-`60`, 10 of them with a run each
60 total projects (named with a distinct, grep-able `Perf Load NN`
prefix so k6's `setup()` can discover exactly this fixture's projects
via `GET /api/v1/projects`, not accidentally pick up Sample
Project/seed-demo/dogfood projects coexisting on the same instance) —
large enough that an accidental per-project round trip in the summaries
query becomes visible in wall-clock terms. Of those, `Perf Load 01`
through `Perf Load 10` each also get one case-filled run, with item
counts deliberately varied (20, 30, ..., up to `Perf Load 10` carrying
120 items — past `MaxPageLimit` isn't necessary, but past
`DefaultPageLimit=50` guarantees real multi-page cursor traversal on at
least one, while the varied smaller runs give the rotation in D3
something realistic to vary across instead of one hot row).

### D3: k6 setup() discovers all 10 runs; default() rotates randomly per iteration
`setup()` calls `GET /api/v1/projects`, filters to the `Perf Load `
prefix, and for each of the 10 that have runs, calls
`GET /api/v1/projects/{key}/runs` to collect `{projectKey, runKey}`
pairs — returned as an array. `default()` picks one pair at random each
iteration (`pairs[Math.floor(Math.random() * pairs.length)]`) for the
run-items call. The summaries call has no per-project input (it's
instance-wide), so D2's 60-project count — not per-iteration
rotation — is what addresses its cache-warming/flatness concern.

### D4: Pagination is walked, not single-fetched
The run-items call becomes a loop: fetch a page, follow `nextCursor`
until `null`, tagged `{ endpoint: 'run_items' }` on every request in the
chain. Against `Perf Load 10`'s 120 items at the 50-item default limit,
this is 3 requests per iteration instead of 1 — the actual cursor-seek
path the endpoint exists to validate.

### D5: Warm-up via tagged, untracked setup()-time requests
Before `setup()` returns, it makes a handful of real requests (a
summaries call, a couple of run-items pages) tagged
`{ endpoint: 'warmup' }`. k6's summary/threshold stats are read per-tag
(`http_req_duration{endpoint:summaries}` /
`{endpoint:run_items}` / `{endpoint:warmup}`) — the baseline capture in
docs/testing.md reports only the `summaries`/`run_items`-tagged
percentiles, so warm-up traffic is excluded from the numbers that
matter without needing k6 scenario/stage surgery to formally discard a
ramp window. Simpler, matches this tool's existing low-complexity style
(design.md of the original change explicitly chose k6 over heavier
tools partly for this reason).

### D6: Baseline is a range across 3-5 runs, not a single sample
No new engineering — a documentation/practice change.
`docs/testing.md`'s Performance section instructs: run `make perf-api`
3-5 times, record the min-max range per endpoint (not a single number).
The existing single-sample baseline from the original change is
replaced, not appended to, once the new fixture's numbers are captured.

## Risks / Trade-offs

- **60 projects is still an arbitrary number, not derived from a
  specific "this many would have caught incident X" case** → accepted;
  it's a meaningful order-of-magnitude jump from 3, calibrated to make
  an O(n) regression visible in wall-clock terms on a dev laptop without
  needing an unreasonably large fixture. Revisit if a future real
  regression at this scale still doesn't show up.
- **Running `seed-perf` 3-5 times per baseline capture is slower than
  the original single-run flow** → accepted; this is a one-time-per-
  baseline-capture cost (documented, not automated), consistent with
  D6's deliberately low-engineering approach to the replication problem.

## Migration Plan

No migration — pure test-tooling change, no schema/API/runtime changes.
`make seed-perf` and the updated k6 script are opt-in and local-only;
nothing changes for anyone who doesn't run them. The old single-sample
baseline numbers in `docs/testing.md` are replaced by the new range once
captured.
