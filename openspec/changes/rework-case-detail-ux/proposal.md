## Why

The case detail page's properties sidebar renders priority as a bare badge and
everything else (tags, suites) as comma-joined plain text, while sibling pages
(Suites, Library) now use a shared pill vocabulary for the same data — this page has
fallen visually behind. It's also the only full entity page in the app with no
page-level actions (delete/move only exist via the Library row menu), and its version
history shows a version number and a date with no signal of what actually changed. A
Pepe/Fable-5 design pass validated via an interactive mockup (approved by the user) is
the basis for this change.

## What Changes

- Properties sidebar: priority, platform, test type, and automated/manual render
  as pills (reusing `SuiteCaseGrid`'s pill classes); tags and suite memberships
  render as individual pill chips instead of comma-joined text.
- A header "⋯" menu adds Move to… and Delete, mirroring exactly the actions
  already available on the Library row menu (`RowActionMenu`/`FolderExplorerPage`'s
  `CaseRow`) — no new capability, just a second, on-page entry point to the same
  existing actions. No "Duplicate" (doesn't exist anywhere in the app today;
  out of scope to invent here).
- Version history rows gain a terse change signal ("3 fields changed," "Steps
  changed," "Initial version"), computed client-side from version content
  already loaded — no new fetch. Clicking a row expands an inline field-level
  diff (reusing the same diff logic `VersionDetailDialog` already has).
- Edit mode keeps the sidebar shell visible instead of replacing the whole page:
  Properties morphs into an inline edit form; Results and Version History stay
  visible read-only for context. Save/Cancel move into a sticky bottom bar.
- The Results panel stays an honest "no data yet" placeholder (real result
  history is separately-scoped future work, `add-case-result-history`) with
  clearer copy on when it'll populate — no fabricated data.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: "Viewing an existing test case" — properties render as pills
  instead of `Label: value` text, gains a header actions menu, version-history
  change signal, and the edit-mode sidebar-preserving behavior.

## Impact

- `apps/web/src/pages/CaseDetailPage.tsx` — sidebar rendering, header actions
  menu, edit-mode layout.
- Reuses existing `RowActionMenu`, `PUT /cases/{caseKey}/folder` (move),
  `DELETE /cases/{caseKey}` (delete) — no backend change.
- Diff logic shared with or extracted alongside `VersionDetailDialog.tsx`'s
  existing `SCALAR_FIELDS`/step-comparison rather than duplicated.
- `docs/test-management.md` — update the case detail page description.
- `apps/web/e2e/test-authoring.spec.ts` — new scenarios for the header actions
  menu and version-history change signal.
