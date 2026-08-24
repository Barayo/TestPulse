## 1. Domain and store

- [x] 1.1 Write a failing `store` test for a new `RunRepo` method (e.g.
      `TotalDuration(ctx, runID)`) that sums `end_time - start_time` across
      each run item's *latest* result, using `DISTINCT ON (run_item_id) ...
      ORDER BY run_item_id, created_at DESC` (same idiom as
      `SuiteRepo.latestRunStats`), only counting rows where both timestamps
      are non-null; returns `nil`/no rows when zero results qualify.
- [x] 1.2 Implement `RunRepo.TotalDuration` to pass the test.
- [x] 1.3 Add `domain.RunComparisonSummary` (design.md D1): `SuiteTrendPoint`
      fields plus `TotalDurationMs *int64 \`json:"totalDurationMs,omitempty"\``.
- [x] 1.4 Change `domain.RunComparison.OlderRun`/`NewerRun` from
      `SuiteTrendPoint` to `RunComparisonSummary`. Leave `SuiteTrendPoint`
      itself and its Stability-trend usage untouched (design.md D1).

## 2. Service

- [x] 2.1 Write a failing `service` test: `CompareRuns` on a run with at
      least one fully-timed result returns a non-nil `TotalDurationMs`.
- [x] 2.2 Write a failing `service` test: `CompareRuns` on a run with zero
      fully-timed results returns a `nil` `TotalDurationMs` (not `0`).
- [x] 2.3 Update `Service.CompareRuns` (and `summaryPoint`'s call sites, or a
      new equivalent) to call `RunRepo.TotalDuration` once per compared run
      and populate `RunComparisonSummary.TotalDurationMs`.

## 3. API contract

- [x] 3.1 Add `totalDurationMs` (nullable/optional int64) to
      `RunComparison`'s per-run summary schema in `packages/shared/openapi.yaml`.
- [x] 3.2 Run `make generate`; commit the regenerated
      `packages/shared/src/api.ts` (CI fails on drift if skipped).
- [x] 3.3 Update/extend the existing `CompareRuns` HTTP handler test
      (`apps/api/internal/server`) to assert `totalDurationMs` round-trips
      for a timed run and is absent/null for an untimed one.

## 4. Web: duration formatting

- [x] 4.1 Write a failing unit test for a new small formatting helper (e.g.
      `apps/web/src/lib/formatDuration.ts`) covering seconds-only, minutes+seconds,
      and hours+minutes cases (design.md D4: `52s`, `4m 12s`, `1h 03m`).
- [x] 4.2 Implement the helper to pass the test.

## 5. Web: run comparison page

- [x] 5.1 Write a failing `RunComparePage.test.tsx` case: a run with
      `totalDurationMs` set renders its formatted duration in that run's
      status card.
- [x] 5.2 Write a failing `RunComparePage.test.tsx` case: a run with no
      `totalDurationMs` renders "No timing data" in that stat's place.
- [x] 5.3 Write a failing `RunComparePage.test.tsx` case: a mixed pair (one
      timed, one not) renders each card's own state independently.
- [x] 5.4 Update `RunComparePage.tsx` to render the duration stat (or "No
      timing data") inside each existing status card, using the new
      formatting helper.

## 6. Docs and Sample Project

- [x] 6.1 Update `docs/test-management.md`'s "Comparing runs" section with a
      sentence describing the duration stat and its "No timing data" state.
- [x] 6.2 Update `apps/api/internal/sampledata/seed.go` so at least one seeded
      closed-run pair used for comparison includes JUnit-imported timing
      data, demonstrating the new stat rather than only its absent state.
- [x] 6.3 Update `apps/api/internal/sampledata/seed_test.go` to assert the
      showcased comparison pair actually carries timing data.

## 7. Full verification

- [x] 7.1 Run `make test` (Go + web) and `make coverage-api`/`coverage-web`;
      confirm both stay at/above threshold.
- [x] 7.2 Run `make lint`.
- [x] 7.3 Manually deploy locally (`docker compose up --build`) and view a
      real run comparison in the browser for both a timed and an untimed
      pair before calling this done. **Skipped per explicit user decision**
      — the local dev DB had since accumulated the user's own manual-testing
      data (a different admin account), so wiping it for this check wasn't
      safe; automated store/service/HTTP/component coverage was judged
      sufficient instead.
