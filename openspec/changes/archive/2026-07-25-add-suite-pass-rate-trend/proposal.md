## Why

A project's only reporting signal today is a single run's snapshot
(`RunStatusBreakdown`) or a project's most-recently-created run (the
HealthBar). Nothing shows how a suite's pass rate has moved across its
history of runs — the "Insight" story's headline capability (ROADMAP.md
v0.3, GitHub issue #11/#77), and the single biggest gap identified against
every competitor tool surveyed in the 2026-07-25 competitive research (Kiwi
TCMS's Telemetry, Qase's dashboard widgets, TestRail/Testmo's Plan reports,
Tuskr's zero-config burndown). `link-runs-to-suite` (shipped) unblocks this
by recording which suite each run came from.

## What Changes

- New query: a suite's **closed** runs, ordered by creation time, each with
  its full status breakdown (same shape as `RunSummary`) — computed
  server-side in one query, not a client-side loop per run.
- New reusable chart component rendering that trend (line/sparkline),
  following the `dataviz` skill and the color/mark conventions already
  established by `RunStatusBreakdown.tsx`.
- **Not in this change**: wiring the chart into a live page. No suite detail
  route exists today (only a list view and a membership-editing drawer); #81
  (Reports/Insights page) is where this component gets an actual home. This
  change ships the query, the API surface, and a standalone, independently
  tested component — matching the precedent of `RunStatusBreakdown`, which
  has its own test file decoupled from `RunPage`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `test-execution`: new requirement — a suite's pass-rate trend across its
  closed runs is queryable via the API.

## Impact

- `apps/api/internal/domain/domain.go` — new `SuiteTrend` /
  `SuiteTrendPoint` types.
- `apps/api/internal/store/suites.go` (or `runs.go`) — new aggregation
  query.
- `apps/api/internal/service/service.go` — new `Service.SuiteTrend` method.
- `apps/api/internal/server/handlers.go` — new
  `GET /api/v1/suites/{suiteKey}/trend` route.
- `packages/shared/openapi.yaml` — new `SuiteTrend` schema + path;
  regenerate shared types via `make generate`.
- `apps/web/src/components/SuitePassRateTrend.tsx` (new) — chart component,
  own test file, not yet mounted on any page.
- No docs update — no user-visible surface yet (the component has no host
  page in this change). No Sample-Project-showcase task for the same reason
  — #81 gets that task, once the data is actually visible.
