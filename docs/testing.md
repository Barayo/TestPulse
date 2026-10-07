# Testing

TestPulse is developed **TDD-first** with a **BDD layer** on top: OpenSpec
scenarios (`WHEN/THEN` in `openspec/specs/`) are the behavior contract, and
the E2E suite maps to them one-to-one. No production code without a failing
test first.

## The test pyramid

```
        E2E (Playwright)          apps/web/e2e/  — BDD-named, mapped 1:1 to
       ▲  real browser,           openspec scenarios; runs against the real
      ▲▲  real compose stack      compose stack (make e2e)
     ▲▲▲
    ▲▲▲▲  Integration (Go)        apps/api/internal/db  — real PostgreSQL,
   ▲▲▲▲▲  gated on env var        migrations/readiness (make test-db-up)
  ▲▲▲▲▲▲
 ▲▲▲▲▲▲▲  Unit                    Go: config, server handlers, web embed
▲▲▲▲▲▲▲▲  fast, no I/O            TS: Vitest + Testing Library components
```

## Running tests

| Command | Layer |
|---|---|
| `make test` | Go unit (+ db integration if `TESTPULSE_TEST_DATABASE_URL` set) + web typecheck |
| `make test-db-up` / `test-db-down` | Throwaway Postgres on :5433 for the integration layer |
| `make coverage-api` | Go coverage over `internal/...`, **fails under 80%** |
| `make coverage-web` | Vitest coverage, **fails under 80%** (statements/branches/functions/lines) |
| `make e2e` | Compose stack up + full Playwright suite |
| `npm -w web run test:watch` | Vitest watch mode while developing UI |

## Conventions

- **TDD (red-green-refactor)**: write the failing test, watch it fail for the
  right reason, write minimal code to pass, refactor. Applies to features,
  bug fixes, and behavior changes. A bug fix always starts with a failing
  test reproducing the bug.
- **BDD mapping**: every scenario in a change's delta specs becomes at least
  one automated test; E2E tests carry the requirement/scenario names in their
  `describe`/`test` titles so spec coverage is greppable.
- **Coverage gates are enforced in CI** (not aspirational): Go `internal/...`
  ≥ 80%, web ≥ 80% on all four metrics. `cmd/` (composition root) is
  exercised by the E2E layer instead of unit mocks.
- **Integration tests skip, never fail, without a database** — they gate on
  `TESTPULSE_TEST_DATABASE_URL` so `go test ./...` stays runnable anywhere;
  CI always provides the database, so skips can't hide there.
- **Mock at the API-client seam in UI tests** (`vi.mock('@/lib/api')`), not
  at `fetch` — tests stay typed against the OpenAPI contract.
- Shadcn-generated `src/components/ui/**` is excluded from web coverage;
  don't hand-edit those files.

## CI layout

The `CI` workflow runs several jobs in parallel: **API** (build, vet, lint,
`govulncheck` vulnerability scan, unit + integration tests with the coverage
gate, against a Postgres service container), **import-connector** and
**jira-connector** (build, vet, lint, `govulncheck`, unit tests — the same
coverage as API, for the two standalone connector tools under `tools/`),
**Web** (lint, typecheck, unit tests with coverage thresholds, build),
**E2E** (compose stack + Playwright, traces uploaded on failure), and
**Helm/DCO** checks.

A separate `CodeQL` workflow analyzes Go (across all three modules) and
JavaScript/TypeScript (`apps/web`) for code-level vulnerability patterns —
on every pull request, plus a weekly schedule so a newly-disclosed pattern
is still caught against code that hasn't otherwise changed. `govulncheck`
and CodeQL are complementary, not redundant: `govulncheck` flags known
vulnerabilities in the Go stdlib/dependencies that are actually reachable
from called code; CodeQL flags vulnerability-*shaped* code (SQL injection,
XSS, insecure crypto, path traversal) regardless of whether a CVE has ever
been filed against it.

The E2E job raises `TESTPULSE_LOGIN_RATE_LIMIT_PER_MINUTE`/`_BURST`
(see [Deployment](deployment.md#configuration-reference)) when starting the
compose stack — the suite runs single-worker and logs in as a fresh user in
most RBAC/teams/permission scenarios, well past the production login rate
limit (5/min, burst 5, backlog #113) in a normal run. Local dev and any
other use of `deploy/compose/docker-compose.yml` keep the strict default.

## Dogfooding

On every push to `main`, the E2E job also reports its own results into a
live TestPulse instance (ROADMAP.md v0.1's dogfooding validation loop):
each `apps/web/e2e/*.spec.ts` scenario is tagged with
`test.info().annotations.push({ type: 'testpulse_case_key', ... })`, the
`junit` reporter embeds those as report `<properties>`
(`embedAnnotationsAsProperties`, `playwright.config.ts`), and CI `POST`s
the resulting JUnit XML to the importer
([Importing results](importing-results.md)). Cases were populated once via
`scripts/dogfood/populate-and-tag.mjs`; that script isn't idempotent and
isn't meant to be re-run.

## Performance

A local/manual k6 load test suite (`apps/api/perf/`, `add-api-performance-
tests`, methodology refined by `improve-api-perf-test-methodology`) covers
the two API endpoints with real aggregation/pagination cost:
`GET /api/v1/projects/summaries` (flat request count regardless of project
count, `add-project-stats-endpoint`'s whole reason for existing) and
`GET /api/v1/runs/{runKey}/items` (cursor-paginated, the run execution
board's main data source — the suite walks the full cursor chain, not just
page 1). Not wired into CI — no pass/fail gate, just a documented baseline
(see `apps/api/perf/README.md`'s rationale).

Run it with the compose stack up, `make seed-perf` populated (a
purpose-built, 60-project/10-run fixture large enough to actually exercise
both endpoints' cost-defining path — not `make seed-demo`, which exists for
a different, much smaller UI/design-review purpose), and a scoped API
token exported:

```bash
export TESTPULSE_PERF_TOKEN=tp_...
make perf-api
```

**Baseline** (captured 2026-10-07, 10 VUs for 30s, 4 runs, Apple M-series
dev laptop against a local compose stack — reported as a range across
those runs, not a single sample; not a certified SLA, a before/after
comparison aid). The throughput figure reflects latency at a fixed 10-VU
concurrency, not a measured breaking point — it is not a capacity number.

| Metric | `summaries` | `run_items` |
|---|---|---|
| p95 latency | 3.54–3.88ms | 3.39–3.67ms |
| p99 latency | 4.10–5.31ms | 3.99–4.84ms |

| Metric | Value |
|---|---|
| Throughput | ~3,585–3,767 req/s |
| Failure rate | 0% (all runs) |
