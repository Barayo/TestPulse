## Why

ROADMAP.md's v0.3 "Insight" line names "run comparisons" alongside pass-rate trends and
flaky-test detection, but it's never had a concrete scope until now (issue #79, part of
the `add-reporting` epic #11 — #75-#78 already shipped suite linkage, the run status
chart, the suite pass-rate trend, and flaky detection). Named directly in the epic's own
competitive research as a recurring pattern (TestRail/Testmo/Qase all ship some form of
run/plan comparison).

## What Changes

- New backend endpoint `GET /api/v1/runs/{runKey}/compare/{otherRunKey}` (+ public
  variant, matching every other authenticated/public pair in this codebase) — both runs
  must be closed and in the same project. Returns each run's own status totals plus a
  categorized item diff (Regressed/Improved/Unchanged/Added/Removed), joined by
  `caseKey`, server-computed so the same data is usable by MCP agents, not just the UI
  (per the epic's own "exposed as a query API consumed equally by the UI and MCP agents"
  framing, and CLAUDE.md's "agents are first-class actors" architecture constraint).
- New route `/runs/compare/{runKeyA}/{runKeyB}` renders the comparison (addressed
  directly by run key, matching this app's existing run-routing convention — not nested
  under a project): two `RunStatusBreakdown` charts side by side (reusing the existing
  component from #76 verbatim), then the five diff buckets — Regressed and Improved
  lead with the most visual weight, Unchanged collapsed by default, Added/Removed as a
  quieter two-column secondary section. Full layout in design.md, per Pepe's visual
  design pass.
- A "Compare to previous run" quick action on `RunPage.tsx`, shown only when the run is
  suite-linked and the suite trend (#77) has a closed run immediately before it.
- An explicit two-run picker at `/projects/{projectKey}/runs/compare` (project-scoped,
  since it's reached from within a project's context; closed runs only) for any other
  pairing, submitting to the comparison route above.
- `apps/api/internal/sampledata/seed.go`: add a second run to an existing suite with a
  genuine regressed case (and ideally a recovered one) — none of the current seed runs
  has a real pass→fail transition between two runs of the same suite, so this feature
  would otherwise have nothing real to demonstrate (CLAUDE.md's standing Sample Project
  showcase rule).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: adds a new "Run comparison" requirement (the comparison page, the two
  entry points, closed-runs-only constraint) alongside the existing "Run creation" and
  suite/run requirements it composes with.
- `test-execution`: adds a new "Comparing two runs" requirement describing the
  server-computed diff (categorization rules, same-project/closed-only constraints).

## Impact

- `packages/shared/openapi.yaml` — new `RunComparison`/`RunComparisonItem` schemas, two
  new paths (authenticated + public).
- `apps/api/internal/service/` — comparison computation (join by `caseKey`, categorize).
- `apps/api/internal/server/` — two new handlers.
- `apps/web/src/pages/` — new `RunComparePage.tsx` (the comparison view) and a small
  picker (could be a mode on `RunsPage.tsx` or its own page — resolved in design.md).
- `apps/web/src/pages/RunPage.tsx` — "Compare to previous run" quick action.
- `apps/api/internal/sampledata/seed.go` (+ `seed_test.go`) — a second suite-linked run
  with a real regression, per the Sample Project showcase rule.
- `docs/test-management.md` — document the comparison view alongside the existing
  suite/run docs.
