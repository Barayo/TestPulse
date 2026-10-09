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

Two local/manual performance suites exist — neither wired into CI, both
documented-baseline-not-a-gate (`add-web-performance-lighthouse`'s
Non-Goals/`api-performance-testing`'s D4 both call this out explicitly).

### API

A k6 load test suite (`apps/api/perf/`, `add-api-performance-tests`,
methodology refined by `improve-api-perf-test-methodology`) covers the two
API endpoints with real aggregation/pagination cost:
`GET /api/v1/projects/summaries` (flat request count regardless of project
count, `add-project-stats-endpoint`'s whole reason for existing) and
`GET /api/v1/runs/{runKey}/items` (cursor-paginated, the run execution
board's main data source — the suite walks the full cursor chain, not just
page 1). See `apps/api/perf/README.md`'s rationale.

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

### Web

A Lighthouse suite (`apps/web/perf/`, `add-web-performance-lighthouse`,
methodology corrected by `fix-web-perf-lighthouse-methodology`) covers the
web app's four heaviest/most representative pages: the project list (`/`),
a project landing page, the Library two-pane browser, and a run execution
board. Runs `lighthouse` + `chrome-launcher` directly rather than
`@lhci/cli` — the latter's own wrapper tooling (interactive wizard,
server-upload support, neither needed here) pulls in a large unrelated
`npm audit` surface with no functional benefit for this suite's scope. See
`apps/web/perf/README.md`'s rationale.

The suite logs in as the compose stack's fixed admin before measuring any
page — not just to reach authenticated-only content (none of the four
target pages require it), but because `/` silently redirects an anonymous
visitor straight to the project landing page when exactly one public
project exists, which otherwise collapses two of the four "distinct" pages
into one identical measurement. Logging in also means Lighthouse scores
desktop, not its default mobile profile — TestPulse is used on laptops,
not phones. No seed step is needed: Lighthouse scores page-load/
interactivity cost rather than a throughput-scaling aggregation query, so
the always-on Sample Project's existing density is representative. Run it
with the compose stack up:

```bash
make perf-web
```

**Baseline** (captured 2026-10-08, 3 Lighthouse runs per page — median
reported — across 3 suite invocations, Apple M-series dev laptop against a
local compose stack; desktop profile, authenticated — reported as a range,
not a single sample; not a certified score, a before/after comparison
aid).

| Metric | `/` | project | Library | run board |
|---|---|---|---|---|
| Performance score | 79 | 55–60 | 79–82 | 57–61 |
| Accessibility score | 96 | 92 | 96 | 92 |
| Best Practices score | 100 | 100 | 100 | 100 |
| LCP | 2.10–2.14s | 1.83–2.27s | 2.14–2.18s | 2.14–2.17s |
| TBT | 0ms | 0ms | 0ms | 0ms |
| CLS | 0.000–0.061 | 0.873–0.902 | 0.000 | 0.529–0.693 |

The project landing/run board pages' high CLS is a real signal this
baseline surfaces, not a tooling artifact — exactly what this suite exists
to make visible (issue #217 tracks surfacing the suite's own root-cause
detail for findings like this one directly in its output). Investigating/
fixing the CLS itself is out of scope for this tooling change; a future
change can use this baseline as its starting point.
