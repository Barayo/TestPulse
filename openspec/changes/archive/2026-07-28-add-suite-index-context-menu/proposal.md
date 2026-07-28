## Why

The suite detail page's Actions sidebar offers Run suite/Rename/Delete, but
the Suites index — where every suite in a project is visible at once as a
card — has no way to reach any of them without first navigating into a
suite. Every other dense list in the app (folder rows and case rows in the
Library, run item rows on the run execution board) already offers the same
actions via a right-click context menu (`RowActionMenu`) alongside a visible
"⋯" trigger; the Suites index is the one list that doesn't. The user flagged
this directly, pointing at the suite detail page's Actions panel and asking
for the same actions on the index via right-click.

## What Changes

- Each suite card on the Suites index gains a `RowActionMenu` (right-click
  at the cursor, or a visible "⋯" trigger) offering Run suite, Rename, and
  Delete — the exact same three actions, dialogs, and API calls already on
  the suite detail page, not a re-implementation.
- The Run suite dialog's "Customize selection" link works identically from
  the index as from the detail page: it navigates to the project's Runs
  page pre-seeded with that suite (reusing the existing route-state
  mechanism from `rework-run-creation-ux`).
- No new visual design — this reuses the already-approved dialogs and the
  already-established `RowActionMenu` interaction pattern verbatim; no new
  mockup is produced for this change.
- No backend change — reuses the existing suite `PUT`/`DELETE` and run
  `POST` endpoints already wired on the detail page.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: "Suites index and detail page" gains a context-menu path
  to Run suite/Rename/Delete directly from the index.

## Impact

- `apps/web/src/pages/SuitesPage.tsx` — each card gains a `RowActionMenu`.
- `apps/web/src/pages/SuiteDetailPage.tsx` — its Run suite/Rename/Delete
  state, handlers, and dialogs are extracted into a shared piece reused by
  both pages, rather than duplicated on the index.
- `docs/test-management.md` — note the index-level context menu.
- `apps/web/e2e/ui-navigation.spec.ts` — new scenario for the index
  context menu (both the visible trigger and right-click entry points).
