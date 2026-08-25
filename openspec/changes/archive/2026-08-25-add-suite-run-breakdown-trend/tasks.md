## 1. Store: extend SuiteRepo.Trend

- [x] 1.1 Write a failing `store` test: `SuiteRepo.Trend` with 16+ closed runs
      returns only the most recent 15, still ordered oldest to newest within
      that window.
- [x] 1.2 Write a failing `store` test: `SuiteRepo.Trend(ctx, suiteID, includeOpen:
      true)` on a suite with closed runs plus one open run returns the open
      run as the trailing point, marked open; without `includeOpen`, the
      open run is excluded (existing behavior, add a regression test if none
      covers it explicitly today).
- [x] 1.3 Write a failing `store` test: `includeOpen: true` on a suite with
      no open run returns the same result as the default call.
- [x] 1.4 Add `IsOpen bool` to `domain.SuiteTrendPoint` (`omitempty`,
      defaults `false`).
- [x] 1.5 Change `SuiteRepo.Trend`'s signature to accept an `includeOpen
      bool` parameter; add the `LIMIT 15` (applied before re-sorting
      oldest-first) and the conditional trailing-open-run branch (design.md
      D1) to pass the new tests.

## 2. Service and handler

- [x] 2.1 Update `Service.SuiteTrend` to accept and pass through
      `includeOpen`.
- [x] 2.2 Update `api.suiteTrend` (`apps/api/internal/server/handlers.go`)
      to read an `includeOpen` query parameter (default `false`) and pass it
      through — this one handler backs both `/api/v1/suites/{key}/trend` and
      its public twin, so both routes pick this up for free.
- [x] 2.3 Extend the existing suite-trend HTTP handler test(s) to cover
      `?includeOpen=true` returning the trailing open point, and confirm the
      public route behaves identically for a public project.

## 3. API contract

- [x] 3.1 Add `isOpen` (boolean, optional) to `SuiteTrendPoint` in
      `packages/shared/openapi.yaml`.
- [x] 3.2 Add an `includeOpen` optional boolean query parameter to both
      `/api/v1/suites/{suiteKey}/trend` and
      `/api/v1/public/suites/{suiteKey}/trend`.
- [x] 3.3 Run `make generate`; commit the regenerated
      `packages/shared/src/api.ts` (CI fails on drift if skipped).

## 4. Web: SuiteRunBreakdownTrend component

- [x] 4.1 Write failing `SuiteRunBreakdownTrend.test.tsx` cases (mirroring
      `SuitePassRateTrend.test.tsx`'s existing coverage where applicable,
      replacing pass-rate-only assertions with full-breakdown ones):
      - Renders one stacked bar per point, segments proportional to each
        non-zero status's share of that run's total.
      - Empty state (no points) matches the existing placeholder pattern.
      - The latest bar carries an always-visible pass-rate label and a
        distinguishing visual emphasis.
      - A point's accessible name (button `aria-label`) includes its name,
        date, pass rate, and every non-zero non-pass status with its count.
      - Hover/focus reveals a tooltip listing every non-zero status with
        swatch, count, and percentage.
      - A point with `isOpen: true` renders at reduced visual weight and its
        accessible name states it's still open.
      - Keyboard tab order visits bars in chronological order.
- [x] 4.2 Implement `apps/web/src/components/SuiteRunBreakdownTrend.tsx` to
      pass the tests, reusing `STATUS_COLOR`/`STATUS_ORDER`/`STATUS_LABEL`/
      `RETEST_TEXTURE` from `RunStatusBreakdown.tsx` verbatim, and porting
      `SuitePassRateTrend.tsx`'s margin/axis/tooltip-clamping structure
      (design.md D2-D4).

## 5. Web: wire into SuiteDetailPage, retire the old component

- [x] 5.1 Update `SuiteDetailPage.tsx`'s "Closed runs" tab to render
      `SuiteRunBreakdownTrend` fed directly by `GET /suites/{key}/trend`'s
      existing `Counts`, dropping the `closedPoint()` pass-rate-only mapper.
- [x] 5.2 Update the "Open + closed" tab to call
      `GET /suites/{key}/trend?includeOpen=true` (replacing its current
      `GET /projects/{projectKey}/runs` + client-side suite filter +
      `runPoint()` mapper) and render the same `SuiteRunBreakdownTrend`.
- [x] 5.3 Update `SuiteDetailPage.test.tsx` for both tabs' new data source
      and rendering.
- [x] 5.4 Delete `SuitePassRateTrend.tsx` and `SuitePassRateTrend.test.tsx`
      (design.md D4 — no fallback period).

## 6. Docs and Sample Project

- [x] 6.1 Update the docs page describing the Stability card / suite trend
      (grep `docs/` for "Stability" or "SuitePassRateTrend" during
      implementation) to describe the new breakdown chart, the 15-run cap,
      and the open-run treatment.
- [x] 6.2 Check `apps/api/internal/sampledata/seed.go`: does an existing
      suite already have enough closed runs (and, ideally, a trailing open
      run on its "Regression" or "Nightly" suite) to meaningfully
      demonstrate the new chart? If not, add what's missing — a real mix of
      verdicts across several runs so the stacked bars show visible
      variation, not all-pass or all-fail. **Confirmed already sufficient**
      — the Regression suite's existing runs (from the run-comparison
      showcase) already provide real pass/failed variation plus a trailing
      open run; no seed.go content changes needed.
- [x] 6.3 Add/update a `seed_test.go` assertion confirming the showcased
      suite's trend has enough points (and, if applicable, an open trailing
      one) to demonstrate the feature.

## 7. Full verification

- [x] 7.1 Run `make test` (Go + web) and `make coverage-api`/`coverage-web`;
      confirm both stay at/above threshold.
- [x] 7.2 Run `make lint`.
- [x] 7.3 Run `make generate` a second time to confirm no drift.
- [x] 7.4 Manually verify in a real browser (deploy locally per the
      standing "always deploy locally to validate" rule): both Stability
      tabs on a suite with real run history, confirming full breakdown
      colors, the latest-bar emphasis, the open-run treatment, and the
      15-run cap boundary if reachable with seeded data. **Confirmed by
      user** against the rebuilt local stack.
