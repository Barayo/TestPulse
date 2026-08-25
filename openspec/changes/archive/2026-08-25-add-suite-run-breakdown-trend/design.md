## Context

`SuitePassRateTrend.tsx` renders a single-series pass-rate line for a
suite's runs, fed from two different backends depending on which
`SuiteDetailPage.tsx` tab is active:

- **"Closed runs"** ← `GET /suites/{key}/trend` → `SuiteRepo.Trend`
  (`apps/api/internal/store/suites.go:285-318`), which already computes each
  closed run's full status breakdown via `GROUP BY (run_id, current_status)`
  into `domain.SuiteTrendPoint.Counts` — closed-only, unbounded, oldest
  first.
- **"Open + closed"** ← `GET /projects/{projectKey}/runs` →
  `RunRepo.List` (`apps/api/internal/store/runs.go:380-410`), which
  aggregates only a `pass_count`/`total` pair per run (via
  `count(i.id) FILTER (WHERE current_status = 'pass')`) into
  `domain.Run.PassRate` — no other status is broken out. The page filters
  this project-wide list down to the current suite client-side.

Issue #137 wants the full breakdown visible on both tabs, not just pass
rate. `RunStatusBreakdown.tsx` already establishes the token set
(`STATUS_COLOR`/`STATUS_ORDER`/`STATUS_LABEL`/`RETEST_TEXTURE`) for
rendering a full breakdown as a segmented bar for one run; this change
extends that same token set across a suite's run history as a stacked bar
per run.

A visual design pass (Pepe) already validated the chart's interaction
model, margins, and tooltip shape for the closed-only case; this design
covers the backend extension needed for the open+closed case and the
concrete technical decisions the mock didn't need to make.

## Goals / Non-Goals

**Goals:**
- Both Stability tabs show a full per-status breakdown per run, not a
  collapsed pass-rate number.
- Reuse `SuiteTrendPoint`/`SuiteRepo.Trend` rather than inventing a parallel
  data path — the "Open + closed" tab becomes a mode of the existing
  suite-trend query, not a new independent aggregation.
- Bound the number of rendered bars so a long-lived suite's chart stays
  readable.

**Non-Goals:**
- Changing `RunRepo.List`/`domain.Run`'s general shape — the project-wide
  runs list (RunsPage, etc.) is unaffected; this change is scoped to the
  suite-trend query specifically.
- Per-item (per-case) breakdowns within a bar — this is still a per-run
  aggregate chart, same granularity as today.
- Real elapsed-time-proportional x-axis spacing — unchanged from
  `SuitePassRateTrend`'s existing even-by-index spacing.

## Decisions

### D1 — Extend `SuiteRepo.Trend` with an `includeOpen` mode, not a new endpoint or a `domain.Run.Counts` field

Two options considered:
- **(a) Add full status counts to `domain.Run`/`RunRepo.List`**, reusing the
  existing project-wide runs list the "Open + closed" tab already fetches.
  Rejected: widens a general-purpose, already-multi-consumer endpoint
  (RunsPage, project summaries) for a need specific to one suite-detail
  tab, and duplicates aggregation logic `SuiteRepo.Trend` already has.
- **(b) Extend `SuiteRepo.Trend`/`GET /suites/{key}/trend` with an
  `includeOpen=true` query param.** When set, the response's point list
  gains one trailing point for the suite's current open run (if any),
  using the same `SuiteTrendPoint` shape. Chosen: keeps the change scoped
  to the one capability (`test-execution`'s "Suite pass-rate trend")
  already governing this data, and the frontend already treats "closed
  trend" and "closed+open trend" as two views of one underlying concept.

`domain.SuiteTrendPoint` gains a new `IsOpen bool` field (`omitempty`,
defaults `false`) to distinguish the trailing open point from closed ones —
mirroring the old client-side `TrendPoint.isOpen` that `SuitePassRateTrend`
already had. This field is harmless on `RunComparison`'s reuse of
`RunComparisonSummary` (a different, unrelated type — not `SuiteTrendPoint`
itself, per add-run-comparison-timing's D1) — wait, `SuiteTrendPoint` itself
isn't used by `RunComparisonSummary` (that type was split off precisely to
avoid entangling the two); this field only ever reaches `SuiteTrend`
consumers, i.e. exactly the Stability card.

### D2 — Cap rendered bars to the most recent 15

`SuiteRepo.Trend` returns oldest-first with no `LIMIT`. Rather than
unbounded width or shrinking bars indefinitely, the query takes the most
recent 15 points (closed, plus the trailing open one when requested),
re-sorted oldest-first for display — the same "most recent N, then
oldest-first for reading" shape `RunComparePage`'s picker and other
recency-bounded lists in this app already use. 15 is picked as a plot
width comparable to a typical dashboard's month-of-nightly-runs view
without forcing individual stacked segments below a legible pixel height
at the card's fixed width; not derived from a hard technical constraint,
so easy to retune later if real usage says otherwise.

### D3 — Trailing open run rendered as a lower-opacity bar, not dashed

`SuitePassRateTrend`'s dashed-line-segment treatment for a trailing open
run doesn't translate directly to a stacked bar (a "dashed fill" reads as
a texture, which is already reserved for the `retest` status and would be
ambiguous). Instead the open run's entire bar renders at reduced opacity
(matching the existing hollow-marker's "this point isn't settled yet"
signal through a different, bar-appropriate visual channel) with its
tooltip/aria-label explicitly stating the run is still open and its counts
may still change.

### D4 — One shared `SuiteRunBreakdownTrend` component for both tabs

Both tabs pass the same `SuiteTrendPoint[]`-shaped data (the closed tab
simply never has an `isOpen: true` point) into one component, rather than
forking closed-only and open+closed variants. `SuitePassRateTrend.tsx` is
deleted once both `SuiteDetailPage.tsx` call sites migrate — no fallback
period, no feature flag.

## Risks / Trade-offs

- [Widening `SuiteRepo.Trend`'s query to conditionally include the open
  run adds a second code path inside one method] → keep it a single SQL
  query with a `UNION`/conditional branch guarded by the `includeOpen`
  param, mirroring how other store methods already branch on a boolean
  argument (e.g. `RunRepo.Items`' optional assignee filter), not two
  separate queries to maintain.
- [15 is a guess, not derived from a real usage ceiling] → cheap to change
  later; not a schema or API shape decision, just a query constant.
- [Reduced-opacity-bar for "open" is a new visual convention, not reused
  from elsewhere in the app] → scoped narrowly to this one chart; flag for
  design-system.md if a second chart ever needs an "in-progress" treatment.

## Migration Plan

No DB migration — this reuses existing `test_run_items`/`test_run_results`
data, no new columns. `packages/shared/openapi.yaml` gains the
`includeOpen` query param and `SuiteTrendPoint.isOpen` field; `make
generate` regenerates the TS client. Deploy is a normal API + web release,
no data backfill, no feature flag — `SuitePassRateTrend.tsx` and its tests
are deleted in the same change that ships the replacement.
