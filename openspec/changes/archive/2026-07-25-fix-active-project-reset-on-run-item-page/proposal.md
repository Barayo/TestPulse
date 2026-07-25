## Why

Reported live: opening a run item's page shows "Select project" in the
header instead of the active project. `useActiveProjectId()` resolves the
project on run pages via `useMatch('/runs/:runKey')` — an exact match
that doesn't extend to `redesign-run-execution-view`'s new
`/runs/:runKey/items/:caseKey` route, so the hook resets to `undefined`
there even though the page's own breadcrumb (a separate code path)
correctly shows the project.

## What Changes

- `useActiveProjectId()`'s run-match pattern becomes `/runs/:runKey/*`
  (matching `projectMatch`'s existing `/*`-suffixed pattern), so it
  resolves on the run page and any of its sub-routes, not just the exact
  run URL.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ui-navigation`: "Project switcher" gains a scenario covering the run
  item page specifically.

## Impact

- `apps/web/src/lib/useActiveProject.ts` — one-line pattern fix.
- New `apps/web/src/lib/useActiveProject.test.tsx` (didn't exist before).
