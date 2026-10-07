## Why

As a maintainer, when I change a hot-path query (project summaries,
run-item listing) or add a new aggregation, I want a real load number to
check it against, so I don't discover a regression only after it ships to
`testpulse.fly.dev`. No performance test suite exists today — only
functional coverage (unit, db-integration, handler, E2E) — so there is no
way to answer "did this change make the API slower under load" without
hand-rolling a one-off script each time.

## What Changes

- Add a k6-based load test suite (`apps/api/perf/`) targeting
  `GET /api/v1/projects/summaries` and `GET /api/v1/runs/{runKey}/items` —
  the two endpoints called out in backlog #22 as having real aggregation/
  pagination cost worth a baseline number.
- Add a `make perf-api` Makefile target to run the suite locally/manually
  against a running compose stack, authenticated via a scoped API token
  (`TESTPULSE_PERF_TOKEN` env var) — no new CI gate yet.
- Record a real baseline (p95/p99 latency at a defined req/s) in a new
  "Performance" section of `docs/testing.md`, against `make seed-demo`'s
  denser "Banca Móvil" project rather than the minimal always-on Sample
  Project.
- Document the new target in `docs/development.md`'s Makefile command
  table.

## Capabilities

### New Capabilities
- `api-performance-testing`: a local/manual k6 load test suite for the Go
  API's two highest-aggregation-cost read endpoints, producing a
  documented latency/throughput baseline (not a CI pass/fail gate).

### Modified Capabilities
(none — no existing requirement's behavior changes; this only adds new
test tooling)

## Impact

- `apps/api/perf/` (new) — k6 test scripts, scenario config, a setup
  helper for the auth token.
- `Makefile` — new `perf-api` target.
- `docs/testing.md` — new "Performance" section (tool, how to run it,
  baseline numbers once captured).
- `docs/development.md` — Makefile command table gets the new target.
- No production code changes, no new runtime dependency, no CI changes.
  Explicitly out of scope: wiring this into any CI workflow (backlog #24
  depends on this AND #23 — web/Lighthouse — existing first; #23 isn't
  part of this change).
