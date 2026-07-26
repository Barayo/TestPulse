## Why

The suite detail page's case-selection grid (`SuiteCaseGrid`) has four flat filter
dropdowns and renders every matching case as an unvirtualized DOM row — it doesn't
scale. Direct user feedback: "I'm missing folder tree. If we have 500 cases, filters
are not enough." A Pepe/Fable-5 design pass validated via an interactive mockup
(seeded with 449 synthetic cases across 42 nested sections, approved by the user) is
the basis for this change.

## What Changes

- A read-only section tree (reusing the same folder data `FolderTree`/the Library
  browser already consume) scopes the case list to a section and its descendants,
  composable with the existing tag/priority/platform/test-type filters — not a
  replacement for them.
- A title search box, new, filtering by substring match, also composable with scope
  and the dropdown filters.
- The case list is virtualized (fixed 60px row height, tags capped at 2 + an
  overflow badge to preserve that fixed height) so the default "no scope, no
  search" state — the state a picker opens into — never mounts more than a small,
  bounded number of DOM rows regardless of how many cases match.
- Selection state is unaffected in shape (`Set<string>` of case keys, owned by the
  parent page) — this change only has to prove it still survives scope changes,
  same guarantee already established for filters.
- A "Selected only" toggle, new, to review the current selection independent of
  scope/filter/search — earns its place both as a persistence check and a real
  "review before saving" affordance at scale.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: "Suites index and detail page" — the "filterable case list"
  language gains section-scoping, search, and the at-scale rendering guarantee.

## Impact

- `apps/web/src/components/SuiteCaseGrid.tsx` — folder-tree rail, search box,
  virtualized row rendering.
- `apps/web/src/pages/SuiteDetailPage.tsx` — fetches folders alongside cases/suite,
  passes them through; `toGridCase` gains `folderId`.
- No backend change — folders are already fetched elsewhere via the existing
  `GET /projects/{projectKey}/folders`.
- `docs/test-management.md` — update the Suites section's case-grid description.
