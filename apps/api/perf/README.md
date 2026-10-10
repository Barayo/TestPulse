# API performance tests

A k6 load test suite covering three API endpoints: the two
highest-aggregation-cost reads, `GET /api/v1/projects/summaries` and
`GET /api/v1/runs/{runKey}/items`, and the one write path already
proven to regress, `POST /api/v1/projects/{projectKey}/runs`
(`CreateRun` — a regression guard for #180's N+1 case-key resolution
bug, since fixed). See `openspec/changes/archive/` (once archived) for
the full design rationale.

This is a local/manual tool, not wired into CI (see design.md's
Non-Goals) — no pass/fail gate, just a documented baseline. The script
itself isn't Go or TypeScript, so it isn't covered by `make lint` or
`make test` — a k6 script's own syntax errors surface when you run it.

## Prerequisites

- **k6**: a standalone binary, not an npm/Go dependency — install per
  https://k6.io/docs/get-started/installation/ (`brew install k6` on
  macOS).
- A running compose stack (`make compose-up`) with the perf fixture
  seeded (`make seed-perf` — creates 60 "Perf Load NN" projects, 10 of
  them with a run each, purpose-built to be large enough to actually
  exercise both read endpoints' cost-defining path, plus one further
  scratch project, "Perf Write Load" (500 cases, no run), used
  exclusively by the `CreateRun` write scenario — not one of the
  numbered "Perf Load NN" projects, so it's excluded from the read
  suite's own project-count check; **not** `make seed-demo`, which is a
  much smaller fixture for a different, UI/design-review purpose). The
  compose stack's `db` service does
  **not** publish its port to the host by default, so `make seed-perf`
  (which runs on the host and needs a host-reachable
  `TESTPULSE_DATABASE_URL`) fails with "missing required environment
  variable" unless you expose it first, e.g.:

  ```bash
  cat <<'EOF' > /tmp/db-port-override.yml
  services:
    db:
      ports:
        - "5432:5432"
  EOF
  docker compose -f deploy/compose/docker-compose.yml -f /tmp/db-port-override.yml up -d db
  TESTPULSE_DATABASE_URL='postgres://testpulse:testpulse@localhost:5432/testpulse?sslmode=disable' make seed-perf
  ```
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
terminal, broken out per endpoint via tags: `summaries`, `run_items`,
`create_run`, and `create_run_delete` (tagged separately from
`create_run` since a write and an FK-cascade delete have very different
expected costs — blending them would make neither number meaningful).
The `create_run_write` scenario runs concurrently with the read
scenario, creating a run from "Perf Write Load"'s full case list and
deleting it immediately after, every iteration — so repeated suite
invocations never leave runs behind. Exits 0 regardless of latency —
see `summaries-and-run-items.js`'s `thresholds` config, which is
informational-only. Also writes the same data as machine-readable JSON
to `apps/api/perf/.results/summary.json` (git-ignored) via k6's
`handleSummary()`, so results are consumable by a future script or CI
step without re-running the suite.

## Baseline

See `docs/testing.md`'s "Performance" section for the last captured
baseline numbers and when/where they were captured.
