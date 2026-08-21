## Context

Five v0.3 "Insight" sub-issues shipped independently as inline widgets on
existing pages: run status chart (#76, on a run's own page), suite
pass-rate trend (#77, on a suite's own page), flaky-test detection (#78, an
endpoint plus inline Library pills), run comparison (#79, reachable only
from inside a run's page), and the per-case stability strip (#80, on a
case's own page). #81 is the capstone: bring the *project-scoped* pieces
(status, flaky cases, run comparison) together on one page, rather than
requiring a stakeholder to already know which run/suite/case to open first.
Pepe's approved design
(`https://claude.ai/code/artifact/b3ce9122-8ee8-4982-9708-559d8ca5abe5`)
settled the concrete shape; this doc covers the technical how.

## Goals / Non-Goals

**Goals:**
- One project-scoped destination (`/projects/{projectKey}/reports`)
  assembling: project-wide status breakdown, a flaky-cases list, and an
  entry point into run comparison.
- A landing-page teaser panel that makes the new page discoverable without
  requiring a full click-through to see whether it's worth visiting.
- Reuse existing presentational components and the existing flaky-cases
  endpoint unchanged; add only the one backend piece that's genuinely
  missing (project-wide status counts).

**Non-Goals:**
- No suite pass-rate trend on this page (stays on `SuiteDetailPage` only —
  seem Decisions D5).
- No per-case stability strip on this page (stays on the case's own page).
- No new run-comparison UI — reuses `RunComparePickerPage` as-is, just adds
  a new link to it.
- No changes to how flakiness itself is computed.

## Decisions

**D1 — New endpoint `GET /api/v1/projects/{projectKey}/runs/status-summary`
(+ public variant), mirroring `RunRepo.Summary`'s exact query shape scoped
up one level.** `RunRepo.Summary(ctx, runID)` already does `SELECT
current_status, count(*) FROM test_run_items WHERE run_id = $1 GROUP BY
current_status`. The project-scoped version joins `test_run_items` through
`test_runs` and filters by `project_id` instead:
```sql
SELECT i.current_status, count(*)
FROM test_run_items i
JOIN test_runs r ON r.id = i.run_id
WHERE r.project_id = $1
GROUP BY i.current_status
```
Scoped to every run regardless of open/closed status — matches a single
run's own summary, which doesn't exclude closed runs either, and keeps
`pending`/`retest` meaningful project-wide rather than disappearing the
moment every run in the project happens to be closed.

**D2 — Response schema `ProjectStatusSummary { total, counts }`**, a new
minimal schema rather than reusing `RunSummary` (which requires `runId`,
not meaningful at project scope). `counts` is the same
`additionalProperties: integer` map shape `RunSummary`/`SuiteTrendPoint`
already use.

**D3 — Handler/routing follows `flaky-cases`'s exact dual-route
pattern**: `store.RunRepo.ProjectStatusSummary(ctx, projectID)` →
`service.Service.ProjectStatusSummary` → `GET
/projects/{projectKey}/runs/status-summary` (authenticated, `requirePermission(PermRead, ...)`)
and `GET /public/projects/{projectKey}/runs/status-summary` (`requirePublicProject`).

**D4 — `RunStatusBreakdown` gets an `emptyMessage?: string` prop**,
defaulting to its current run-scoped copy so every existing call site is
unaffected; the Reports page passes a project-scoped message (e.g. "add
runs to this project to see its status breakdown here"). Matches
`SuitePassRateTrend`'s existing `emptyMessage` prop precedent exactly —
same shape, same reasoning.

**D5 — Suite pass-rate trend stays off this page (Pepe's call, recorded
here for implementers who might otherwise "helpfully" add it back).**
Rejected: a second new project-wide trend endpoint (proposal explicitly
scopes this change to one new endpoint, the status-summary gap) and N
suite-scoped small multiples (duplicates each suite's own
`SuitePassRateTrend`, already shown on `SuiteDetailPage`, and
`SuitePassRateTrend`'s own code comments record a real prior confusion
about a single number reading as an aggregate when it wasn't — multiplying
the chart without a project-level anchor number repeats that risk).

**D6 — Flaky cases list is new UI over the existing endpoint, no backend
change.** Row shape: title (truncated) + case key + `v{n}` badge (same
idiom as `FolderExplorerPage.tsx`'s version badge) + `FlakyPill` + a rate
track/number, sorted descending by `FlakyCase.rate`, each row linking to
`/projects/{projectKey}/cases/{caseKey}`.

**D7 — Landing panel is a fourth full-width row, not a fourth column.**
`ProjectLandingPanels.tsx`'s existing `PanelShell` (icon + bold title +
`border-b` header, action link top-right) is reused verbatim; the panel
body shows the project-wide status bar + pass-rate headline plus a flaky
count badge (reusing `FlakyPill`'s exact tint), with a single "Open
Reports ›" action link — not "see all N ›", since Reports isn't a list.

## Risks / Trade-offs

- [The new `status-summary` query scans every run item in a project,
  unbounded] → Mitigation: same `GROUP BY` aggregate shape already proven
  at run scope (`RunRepo.Summary`) and used by `FlakyCases` at project
  scope already; no new index needed beyond what `test_run_items(run_id)`
  /`test_runs(project_id)` already provide via existing foreign keys.
- [A project with zero runs hits the same "empty run-scoped copy" problem
  `RunStatusBreakdown` has today] → Mitigation: D4's `emptyMessage` prop
  fixes this at the source rather than special-casing the Reports page.

## Migration Plan

Purely additive: new endpoint pair, new page, new landing panel, one new
optional component prop (backward compatible — existing callers keep
their current empty-state copy by omitting the prop). No schema/migration
changes, no flag — ships in one PR.

## Open Questions

None — Pepe's design review resolved the open UI/scope questions from the
proposal discussion.
