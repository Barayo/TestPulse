## Why

The Library page (`FolderExplorerPage.tsx` — the test-case repository browser) is the
most-used screen in the app but the least visually developed: plain text rows with no
case counts, no metadata (priority/tags/platform/automated) visible without opening a
case, and no search or filtering at all. Sibling pages just got this exact treatment
(suite list/detail via `rework-suite-membership-ux`, and the pending project-landing
enrichment) — Library is the visible gap left over. A Pepe/Fable-5 design pass validated
via an interactive mockup (approved by the user) is the basis for this change.

## What Changes

- Every folder row (in the tree and in the content list) shows its direct case count,
  a critical-priority indicator when any case in it is `critical`, and an
  automation-coverage meter (automated/total, single-tone — not a pass/fail band).
- Every case row shows compact badges for priority, platform, test type, and
  automated/manual, reusing `SuiteCaseGrid`'s existing pill vocabulary, plus a
  "Stale" badge for cases untouched 90+ days.
- A toolbar above the content list adds title search, and filter dropdowns for
  tag/priority/platform/test type/automated — same filter semantics as
  `SuiteCaseGrid` (filter-safe, never loses navigation state).
- A "Search entire Library" toggle flattens results across every folder in the
  project, each result row labeled with its folder path, so a case can be found
  without manually walking the tree.
- Empty states differentiate a genuinely empty folder (inline "+ New section"/
  "+ New test case" CTAs) from a filtered-to-zero result ("clear filters," no
  case-creation CTA).
- The mobile `FolderPicker` fallback shows folder hierarchy (indentation by depth)
  and a per-row case count instead of a flat unordered list.
- No change to folder/case CRUD behavior (create/move/delete) — visual and
  filtering/search additions only.
- No pass-rate or run-health signal is added to this page — Library is the
  authoring repository, not an execution view; that distinction is deliberate
  (see design.md).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: "Library with two-pane navigation" gains case counts, metadata
  badges, filtering, cross-section search, and empty-state handling.

## Impact

- `apps/web/src/pages/FolderExplorerPage.tsx`, `apps/web/src/components/FolderTree.tsx`,
  `apps/web/src/components/FolderPicker.tsx` — rewritten row/tree rendering and a new
  toolbar.
- New shared filter-bar/badge logic, likely factored out of or alongside
  `SuiteCaseGrid.tsx` rather than duplicated.
- `docs/test-management.md` — update the "Library" section.
- `apps/api/internal/sampledata/seed.go` — sample project data already has folders/cases
  with varied priority/platform/tags; verify it still demonstrates the new richness
  (double-digit section, an empty section, a stale case) or extend it if not.
- `apps/web/e2e/test-authoring.spec.ts` — new/updated scenarios for search, filter, and
  cross-folder search.
