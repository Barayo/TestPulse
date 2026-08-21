## Why

As a project stakeholder, when I want to know "how is this project doing"
right now, I want one dedicated place that shows the project's overall pass
rate, its currently-flaky cases, and a way to compare two runs — instead of
piecing that picture together from scattered widgets on individual run,
suite, and case pages with no single home. This closes out the v0.3
"Insight" epic (#11): #76-#80 already shipped the individual signals: this
issue (#81) is the capstone that assembles them into one navigable
destination.

## What Changes

- Add a "Reports" panel to the project landing page (`ProjectPage.tsx`), a
  fourth full-width row below Folders/Suites/Runs, showing the project's
  overall status breakdown bar + pass rate and a flaky-case-count teaser,
  linking to the new Reports page.
- Add a new page at `/projects/{projectKey}/reports` with three sections:
  project-wide status breakdown, a flaky cases list (sorted by flakiness
  rate, linking to each case), and an entry point into the existing run
  comparison picker.
- Add `GET /api/v1/projects/{projectKey}/runs/status-summary` (+ public
  variant), returning `{total, counts}` aggregated across every run (open
  and closed) in the project — the existing runs-list endpoint only
  returns `passRate`, not per-status counts, so `RunStatusBreakdown` has
  nothing to render project-wide without this.
- Add an `emptyMessage` prop to `RunStatusBreakdown` (its current
  empty-state copy is hardcoded run-scoped text), matching the pattern
  `SuitePassRateTrend` already uses.

## Capabilities

### New Capabilities
- `project-reports`: the project-wide status-summary endpoint and the
  Reports page that assembles it with the existing flaky-cases endpoint
  and the existing run-comparison picker.

### Modified Capabilities
- `ui-navigation`: the project landing page's "three independent panels"
  requirement becomes four, adding the Reports panel and its own empty/
  populated states.

## Impact

- `apps/api/internal/store` — new aggregate query (`GROUP BY status`) for
  a project's runs.
- `apps/api/internal/service`, `apps/api/internal/server/handlers.go`,
  `public_handlers.go` — new authenticated + public endpoint pair, same
  dual-route pattern `flaky-cases` already uses.
- `packages/shared/openapi.yaml` — new endpoint pair + response schema.
- `apps/web/src/pages/ProjectPage.tsx`,
  `apps/web/src/components/ProjectLandingPanels.tsx` — new Reports panel.
- New `apps/web/src/pages/ProjectReportsPage.tsx` (or similar) + route.
- `apps/web/src/components/RunStatusBreakdown.tsx` — `emptyMessage` prop.
- Out of scope (explicitly, per Pepe's design review): suite pass-rate
  trend does not appear on this page (stays on `SuiteDetailPage` only —
  avoids either a second new endpoint or duplicating each suite's own
  chart); the per-case stability strip (#80) does not appear on this page
  either (already lives on the case's own page; the Flaky cases list
  already answers "what's unreliable" at project scope).
- `docs/` — new route + endpoint documented.
- `apps/api/internal/sampledata/seed.go` — enough flaky cases and
  run-status variety for the Reports page to be non-trivial in the Sample
  Project.
