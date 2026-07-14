## Why

The project list's order today is an accident of implementation: the API
returns projects `ORDER BY created_at` and nothing downstream ever changes
that. As project counts grow this stops being usable — there's no way to
find the biggest project, the newest one, or a project by name without
scanning the whole grid. All the data needed to sort meaningfully (name,
suite count, case count, creation date) is already fetched by
`useProjectSummaries()`; this is a pure display-layer control, not a new
data source.

## What Changes

- Add a "Sort by" control (key select: Name / Suites / Cases / Created,
  plus an ascending/descending toggle) to the project list toolbar,
  visible in both view modes and on mobile.
- Sorting is applied client-side over the already-fetched project array,
  before the Favorites/rest split — the same sort order applies within
  the pinned Favorites strip and the main list.
- Default: Name, ascending. Each key has its own sensible default
  direction (Name → A–Z, Suites/Cases → most-first, Created →
  newest-first) applied the first time that key is selected.
- The chosen sort persists per-browser via `localStorage`
  (`testpulse.projectListSort`), mirroring the existing view-mode
  override (`useViewModeOverride`) — no backend or per-user persistence.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ui-navigation`: the "Project list with permission-ready create action"
  requirement gains sortable ordering — a new scenario set for choosing a
  sort key/direction, the default order, and persistence across reloads.

## Impact

- `apps/web/src/pages/ProjectsPage.tsx` — toolbar gains the sort control;
  `visible` array is sorted before the favorites/rest split.
- New `apps/web/src/lib/sortProjects.ts` (pure function, mirrors
  `viewMode.ts`) and `apps/web/src/lib/useSortOverride.ts` (mirrors
  `useViewModeOverride.ts`).
- No API, domain, or database changes — `ProjectSummary` already carries
  every field being sorted on.
