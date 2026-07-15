## Why

A design review of the project detail page (`ProjectPage.tsx`) against two
real scenarios — a mature project (5 sections, 7 suites, several runs) and a
brand-new one (2 sections, no suites, no runs) — found the same failure at
both ends of the density spectrum: the page is three small, hard-capped
panels that never adapt to how much (or how little) is in the project, carry
none of the health/status information the project list already shows for
the same project, and leave most of the viewport blank either way.
Navigating from the list (status pill, pass-rate bar, card treatment) into
a project's own detail page currently feels like a visual regression.

## What Changes

- Add a project summary strip above the three panels — status pill,
  pass-rate bar, suite/case totals, last-run time — reusing the same
  `StatusPill`/`ProgressBar` components and the same server-aggregated data
  (`ProjectSummary`) the project list already uses. No new backend work.
- Color-code each Recent runs row by its pass-rate band (reusing
  `statusBorderClass`/dot), not just a plain bar and percentage, so an
  at-risk run is scannable without reading the number.
- Replace the three independent "nothing here yet" panels with a single
  getting-started checklist when the *entire* project is empty (no
  sections with cases, no suites, no runs) — the per-panel empty state
  stays for the common case where only *some* panels are empty.
- Bring the panel shells' typography/card treatment in line with the
  polish pass `ProjectsPage` already got (weight, borders, spacing).
- Revisit the fixed 4-row-per-panel cap now that a summary strip exists
  above it (task-level decision, not a headline behavior change).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ui-navigation`: the "Project landing shows top-level structure only"
  requirement gains a project summary strip, color-coded run rows, and a
  distinct all-empty state — delta scenarios cover each.

## Impact

- `apps/web/src/pages/ProjectPage.tsx` — adds the summary strip and the
  all-empty checklist branch.
- `apps/web/src/components/ProjectLandingPanels.tsx` — `RunsPanel` row
  gains color-coding; panel shell typography updated.
- Reuses `useProjectSummaries()` (already fetches every project's
  suite/case/pass-rate/last-run data) filtered to the active project —
  deliberately not `useProjectLanding()`'s per-item client-side
  aggregation, which fetches every case/suite/run in the project just to
  count them (pre-existing, out of scope here, but the wrong pattern to
  extend for a project-level total).
- No API, domain, or database changes.
