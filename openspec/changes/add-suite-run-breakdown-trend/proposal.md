## Why

As a user, when I look at a suite's Stability card, I want to see each run's
full status breakdown (pass/failed/skipped/blocked/retest), not just a
collapsed pass-rate line, so I can tell at a glance whether a dip was mostly
failures, mostly blocked/skipped items, or something else — without opening
each run individually (GH issue #137). The "Closed runs" tab's backend
already carries this data (`SuiteTrendPoint.Counts`); the "Open + closed" tab
does not yet, and both need the same treatment so neither tab is left
behind with the old single-line chart.

## What Changes

- **New `SuiteRunBreakdownTrend` component** replaces `SuitePassRateTrend` on
  both of `SuiteDetailPage.tsx`'s Stability tabs: a 100%-stacked vertical bar
  chart, one bar per run ordered oldest-to-newest, using the existing
  `STATUS_COLOR`/`STATUS_ORDER`/`STATUS_LABEL`/`RETEST_TEXTURE` tokens from
  `RunStatusBreakdown.tsx` verbatim — no new colors. `SuitePassRateTrend.tsx`
  is retired once both tabs are migrated, not left as orphaned/fallback code.
- **"Closed runs" tab**: no new backend work — `GET /suites/{key}/trend`
  already returns full per-run counts.
- **"Open + closed" tab gains backend support**: its data source
  (`GET /projects/{projectKey}/runs`) currently returns only `Run.passRate`,
  with no per-status counts, for either open or closed runs. This change
  adds status counts to that list response (exact shape decided in
  design.md) so the same stacked-bar chart can render this tab too,
  including a trailing open run rendered with the existing
  dashed/hollow-marker-equivalent treatment adapted to a bar (open runs'
  counts are still live/changing, unlike a closed run's settled counts).
- **Bar count is capped** to the most recent N runs (N decided in design.md,
  matching the existing Breadcrumbs-collapse precedent for handling
  unbounded-width lists) rather than rendering unboundedly many bars —
  `SuiteRepo.Trend` currently has no `LIMIT`.
- Richer per-bar tooltip than the old flat pass-rate string: every non-zero
  status with its swatch, count, and percentage. Each bar is a real
  focusable `<button>` with an `aria-label` extending the existing
  detail-string template with an appended non-pass-status clause (e.g.
  "— 11 failed, 1 blocked, 2 skipped").
- `pending` stays in the stack/legend for exact parity with
  `RunStatusBreakdown`, even though a closed run should rarely carry one.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `test-execution`: the "Suite pass-rate trend" requirement is extended to
  also support the "Open + closed" view — the trend (or an equivalent query)
  needs to expose per-status counts for open runs too, not just closed ones,
  while the existing closed-only trend's own behavior (ordering, empty case)
  stays as specified today.
- `ui-navigation`: a new requirement describing the Stability card's
  breakdown-chart UI behavior (both tabs, the recent-N cap, the trailing
  open-run treatment) — nothing currently specifies this at the UI-behavior
  level; today's `SuitePassRateTrend` behavior was never itself spec'd as a
  named requirement.

## Impact

- **Backend**: `apps/api/internal/store/suites.go`'s `SuiteRepo.Trend`
  (closed-only, already correct) plus new work to expose counts for the
  "Open + closed" view — either extending `domain.Run`/its list query with a
  `Counts` field, or giving `SuiteTrend`-equivalent a mode that includes the
  trailing open run. `packages/shared/openapi.yaml` changes either way;
  `make generate` required; CI fails on drift if skipped.
- **Frontend**: `apps/web/src/components/SuiteRunBreakdownTrend.tsx` (new,
  replacing `SuitePassRateTrend.tsx`), `apps/web/src/pages/SuiteDetailPage.tsx`
  (both tab call sites reworked).
- **Docs**: wherever the Stability card / suite trend is documented (grep
  `docs/` during design) needs a sentence on the new breakdown chart and the
  recent-N cap.
- **Sample Project**: confirm during design whether the existing seeded
  suite-run history (per `seed.go`) already has enough closed runs, and a
  trailing open run on a suite, to meaningfully demonstrate the new chart —
  including the N-cap boundary — or whether seed.go needs more runs added.
