## Why

As a maintainer, when `make perf-api`'s baseline changes between runs, I
want to trust the number reflects a real regression — not noise, an
untested code path, or a fully-cached artifact — so I don't chase
phantom issues or miss real ones. An independent performance-testing-
methodology review of the just-shipped suite (`add-api-performance-
tests`, #22) found it cannot currently detect the regressions it exists
to catch: the fixture is too small to exercise either target endpoint's
documented scaling claim, every VU hits the same fully-cached
project/run for the whole run, pagination is never exercised, and a
single unreplicated sample is presented as "the baseline" (full findings
in issue #216).

## What Changes

- Add a new, purpose-built seeding tool (`apps/api/cmd/seed-perf/`) and
  `make seed-perf` target — 60 projects and a 120-item run, large enough
  to actually exercise the "flat regardless of project count" and
  multi-page cursor claims. Does not touch `make seed-demo`, which
  serves a different audience (UI/design review) at its own deliberate
  scale.
- `apps/api/perf/summaries-and-run-items.js`: setup() discovers all
  seed-perf projects/runs (not one); default() picks a random pair per
  iteration (not a fixed one); the run-items call walks the full cursor
  chain instead of fetching page 1 only; a brief warm-up burst runs in
  setup() before the measured scenario starts; each HTTP call is tagged
  per-endpoint so p95/p99 can be reported separately, not blended.
- `docs/testing.md`'s Performance section: documents the `seed-perf`
  prerequisite, records a re-captured baseline as a 3-5-run range (not a
  single sample), and adds a one-sentence caveat that the throughput
  number reflects fixed-concurrency latency, not measured capacity.
- `docs/development.md`'s Makefile table gets the new `seed-perf` entry.

## Capabilities

### New Capabilities
(none — this modifies the existing `api-performance-testing` capability's
requirements, not introduces a new one)

### Modified Capabilities
- `api-performance-testing`: the suite's requirements for what data
  density and query-path coverage are needed to produce a trustworthy
  baseline.

## Impact

- `apps/api/cmd/seed-perf/` (new) — purpose-built perf fixture seeding.
- `Makefile` — new `seed-perf` target.
- `apps/api/perf/summaries-and-run-items.js` — setup/default rewritten
  for multi-target discovery, pagination walk, warm-up, per-endpoint tags.
- `apps/api/perf/README.md` — updated prerequisites.
- `docs/testing.md`, `docs/development.md` — updated Performance section
  and Makefile table.
- Explicitly out of scope: server-side telemetry correlation (flagged in
  #216 as a bigger lift, deferred); CI wiring (backlog #24, still blocked
  on #23).
- No production API/schema changes, no breaking changes.
