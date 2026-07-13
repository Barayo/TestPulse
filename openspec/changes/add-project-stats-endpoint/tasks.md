# Tasks: Add project stats endpoint

TDD throughout: write the failing test first, then the minimal change to pass
(CLAUDE.md standing rule). Contract-first: `openapi.yaml` changes land in the
same commit as the Go handler they describe, then `make generate`.

## 1. Contract

- [ ] 1.1 Add `GET /api/v1/projects/summaries` to `packages/shared/openapi.yaml`:
      response is an array of `{ projectId, suiteCount, caseCount, passRate }`
      (`passRate` nullable). `make generate` to regenerate Go server interface
      and web `openapi-fetch` types; commit the generated diff.

## 2. Store layer (test-first)

- [ ] 2.1 Store method(s) computing, per non-archived project: suite count,
      case count, and the most-recently-created run's pass rate (or `null` if
      no runs) — as 2-3 grouped SQL queries (design.md), not one query per
      project. Integration test against `TESTPULSE_TEST_DATABASE_URL`
      (`make test-db-up`) covering: a project with suites/cases/runs, a
      project with zero runs (`passRate` null), and a project with multiple
      runs (pass rate reflects only the latest one).

## 3. Service + handler layer (test-first)

- [ ] 3.1 Service method wrapping the store aggregation; chi handler wiring
      `GET /api/v1/projects/summaries`, excluding archived projects. Handler
      test covering the response shape and archived-project exclusion.

## 4. Web client migration (test-first)

- [ ] 4.1 `useProjectSummaries`: replace the per-project fetch-and-compute
      loop (and its concurrency pool / abort wiring from `redesign-ui`) with
      one call to the new endpoint, merged with `GET /api/v1/projects` for
      names/ids. Existing consumer tests (`ProjectsPage.test.tsx`,
      `App.test.tsx`'s switcher tests) continue to assert the same rendered
      stats — update their mocks to the new endpoint shape, not the
      assertions themselves.
- [ ] 4.2 Confirm request count no longer scales with project count: a
      hook-level test asserting exactly one `/projects/summaries` call
      regardless of how many projects are mocked (replaces the
      `useProjectSummaries.test.tsx` concurrency-cap test, which is no
      longer the relevant guarantee once there's a single endpoint call).

## 5. Docs and verification

- [ ] 5.1 Update `docs/api.md` (or wherever the endpoint surface is
      documented) and `docs/architecture.md` if it references the
      client-side per-project aggregation pattern being replaced.
- [ ] 5.2 Full verification sweep: `make coverage-api` (≥80%, with
      `TESTPULSE_TEST_DATABASE_URL` set), `make coverage-web` (≥80% all
      metrics), `make lint`, `make generate` (no contract drift), `make e2e`.
      Manually confirm against `make seed-demo` data plus a handful of
      extra throwaway projects that the project list and switcher still show
      correct stats with one network request instead of many.
