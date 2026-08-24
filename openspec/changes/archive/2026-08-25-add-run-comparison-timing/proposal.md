## Why

As a user, when I compare two runs, I want to see whether execution got faster or
slower, not just whether more or fewer cases passed — regressions in speed matter
as much as regressions in correctness, and today's comparison page has no timing
signal at all, even though the data already exists for CI-imported runs.

## What Changes

- **`GET /runs/{key}/compare/{otherKey}` gains a total-duration figure per run**:
  `domain.RunComparison`'s two run summaries add a duration computed by summing,
  across each run's items, the `EndTime - StartTime` of that item's latest recorded
  result — only for results that carry both timestamps. `StartTime`/`EndTime`
  (`domain.Result`) are populated exclusively by the JUnit XML importer today; a
  run built entirely from manually-recorded results (`RunPage.tsx`'s "Record
  Result" flow never sets either field) has no duration data for any item.
- **Comparison page shows duration inside each run's existing status card**, one
  more stat alongside the pass-rate/status-breakdown chart already there — no new
  page section. Shown whenever a run has any duration data (i.e. at least one item
  contributed a timed result); a run with none shows an explicit "no timing data"
  label in that stat's place rather than hiding the row, so partial CI-import
  adoption between two compared runs is visible, not silently absent.
- **openapi.yaml**: `RunComparison`'s per-run summary schema gains an optional
  `totalDurationMs` (or equivalent) field; `null`/absent means no timed data.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ui-navigation`: "Run comparison" gains a per-run duration figure in the
  comparison view, shown when timing data exists and explicitly labeled absent
  when it doesn't.

## Impact

- **Backend**: `domain.RunComparison`'s per-run summary type (currently
  `SuiteTrendPoint`, shared with the Stability trend — needs its own richer type
  or an additive duration field, decided in design.md since reusing
  `SuiteTrendPoint` as-is would leak a comparison-only field into the Stability
  trend's shape) and `Service.CompareRuns` (`apps/api/internal/service/service.go`)
  need duration aggregation, likely via a new store query joining `test_run_items`
  and each item's latest result's `start_time`/`end_time`.
  `packages/shared/openapi.yaml` changes; `make generate` required; CI fails on
  drift if skipped.
- **Frontend**: the run comparison page (`RunComparePage.tsx` or equivalent —
  confirm exact filename during design) renders the new stat inside each
  already-existing status card.
- **Docs**: `docs/test-management.md`'s "Comparing runs" section needs a sentence
  describing the duration stat and its "no timing data" state.
- **Sample Project**: at least one of the seeded closed-run pairs used for
  comparison should include JUnit-imported timing data (import already used
  elsewhere in `seed.go`) so the showcase actually demonstrates the new stat,
  not just its absent-state.
