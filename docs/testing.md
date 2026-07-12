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

The `CI` workflow runs four jobs in parallel: **API** (build, vet, lint,
unit + integration tests with the coverage gate, against a Postgres service
container), **Web** (lint, typecheck, unit tests with coverage thresholds,
build), **E2E** (compose stack + Playwright, traces uploaded on failure), and
**Helm/DCO** checks.
