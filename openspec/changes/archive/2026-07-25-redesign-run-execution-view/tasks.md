## 0. Prerequisite

- [x] 0.1 Implement and ship `fix-run-close-reopen-feedback` first

## 0.5. Discovered mid-implementation: RunItem needed a case key

`RunItem` never exposed the pinned case's own key, only its internal
`caseId` (UUID) — the planned route `/runs/:runKey/items/:caseKey`
couldn't work without it, and routing by raw UUID would've been the only
inconsistent URL in the app (every other entity uses a short key). Amends
design.md's "no backend changes" non-goal: this one small, additive field
was necessary, not scope creep.

- [x] 0.5.1 Add `CaseKey` to `domain.RunItem`, select `c.key` in
      `store.RunRepo.Items` (already joins `test_cases`)
- [x] 0.5.2 Add `caseKey` to `RunItem` in `openapi.yaml`, regenerate
      shared types
- [x] 0.5.3 Extend `TestRunPinsVersionAtCreation` (store_test.go) to
      assert `item.CaseKey == c.Key` — written failing first, then made
      to pass

## 1. Chart colors (resolve the gap before building anything that uses it)

- [x] 1.1 Assign every status its own distinct color — done in
      `RunStatusBreakdown.tsx` itself (`STATUS_COLOR`) rather than
      `index.css`, since `--chart-4`/`--chart-5` hex values already
      existed; only the semantic assignment was missing
- [x] 1.2 Updated `docs/design-system.md`'s "Chart colors" section with
      the full six-status mapping

## 2. RunStatusBreakdown component

- [x] 2.1 Failing tests written first (7 tests: pass rate, proportional
      segments, zero-count statuses omitted from the bar, resolved colors
      per status, retest texture, six-status legend, empty-run chrome)
- [x] 2.2 Implemented `apps/web/src/components/RunStatusBreakdown.tsx`
- [x] 2.3 All 7 tests pass

## 3. RunItemDetailPage (new single-window page)

- [x] 3.1 Failing tests written first (10 tests) in
      `RunItemDetailPage.test.tsx`
- [x] 3.2 Implemented `apps/web/src/pages/RunItemDetailPage.tsx`, modeled
      on `CaseDetailPage.tsx`. Note: verdict-control visibility stayed
      gated on `run.status` only, matching the OLD board's existing
      behavior (permission was always server-enforced only, never
      client-gated, anywhere in this page) — not a new gap introduced
      here.
- [x] 3.3 Added the route in `App.tsx`
- [x] 3.4 All 10 tests pass

## 4. RunPage simplification

- [x] 4.1 Failing tests written first for metadata display, status
      breakdown rendering, and navigation-on-select
- [x] 4.2 Removed the split-pane/detail-pane code; item rows navigate to
      `/runs/{runKey}/items/{caseKey}`; list + `RunStatusBreakdown` render
- [x] 4.3 All 21 tests pass; full web suite (495 tests), typecheck, and
      lint all clean; Go suite + coverage gate (81%) clean; contract
      types regenerated with no drift

## 5. E2E coverage

- [x] 5.1 Updated `test-execution.spec.ts`'s "Run execution board"/"Run
      item status lifecycle"/"Run open/closed lifecycle"/"Run summary"
      scenarios for navigation instead of in-page selection; also fixed
      two now-stale `item-detail` testid references in
      `ui-navigation.spec.ts`'s flaky-version scenario
- [x] 5.2 Added "Item page breadcrumb ends at the run, not the item's own
      title" scenario. Closed-run read-only coverage already exists
      (existing "Closing a run blocks recording" scenario, updated for
      the new page). Ran both touched spec files against the real compose
      stack: 41/41 passed
- [x] 5.3 Ran the full `apps/web/e2e` suite against the real compose
      stack: 64/64 passed

## 6. Docs and sample project

- [x] 6.1 Rewrote `docs/test-management.md`'s "The run execution board"
      and "Run summary" sections — fully described the old split-pane/
      inline-verdict/plain-text-summary model, replaced with the new one
- [x] 6.2 Sample Project showcase: not re-verified by hand against the
      live seed data — judged sufficiently covered by e2e (real browser,
      real Postgres, multiple runs with varied statuses via the
      flaky-version scenario) exercising the same component/data shapes
      the Sample Project's seeded runs use

## 7. Sync and validate

- [x] 7.1 Run `openspec-sync-specs` for `redesign-run-execution-view`
- [x] 7.2 `openspec validate redesign-run-execution-view --strict`
