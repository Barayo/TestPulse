# API performance tests

A k6 load test suite covering the two API endpoints with real
aggregation/pagination cost: `GET /api/v1/projects/summaries` and
`GET /api/v1/runs/{runKey}/items`. See `openspec/changes/archive/` (once
archived) for the full design rationale.

This is a local/manual tool, not wired into CI (see design.md's
Non-Goals) — no pass/fail gate, just a documented baseline. The script
itself isn't Go or TypeScript, so it isn't covered by `make lint` or
`make test` — a k6 script's own syntax errors surface when you run it.

## Prerequisites

- **k6**: a standalone binary, not an npm/Go dependency — install per
  https://k6.io/docs/get-started/installation/ (`brew install k6` on
  macOS).
- A running compose stack (`make compose-up`) with demo data seeded
  (`make seed-demo` — creates the "Banca Móvil" project this suite
  targets).
- A scoped API token: log in as the Tenant Admin, go to
  `/settings/tokens`, create a token, and export it:

  ```bash
  export TESTPULSE_PERF_TOKEN=tp_...
  ```

## Running

```bash
make perf-api
```

Reports k6's summary (requests, p95/p99 latency, throughput) to the
terminal. Exits 0 regardless of latency — see `summaries-and-run-items.js`'s
`thresholds` config, which is informational-only.

## Baseline

See `docs/testing.md`'s "Performance" section for the last captured
baseline numbers and when/where they were captured.
