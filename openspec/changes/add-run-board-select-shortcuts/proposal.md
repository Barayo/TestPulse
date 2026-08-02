## Why

As a tester triaging a run's items, when I look at the run board I want the
row-selection checkboxes to stay out of my way while I'm scanning — right now
every row shows a full-opacity checkbox at all times, even though most of the
time nobody is selecting anything, and the multi-select workflow it enables
(bulk assign, bulk verdict) is the point of a board scanned repeatedly during
triage, not an edge case. Settled through several rounds of design review
(see design.md for the two rejected alternatives — invisible-at-rest
checkboxes, and removing checkboxes entirely in favor of a "Select all" link):
checkboxes recede visually at rest instead of disappearing, and the selection
model gets two power-user shortcuts (Space, Shift+click) that mirror
conventions from Gmail/Finder-style list selection.

## What Changes

- Row checkboxes on the run board render at ~0.4 opacity at rest (same size
  and position — no layout shift), snapping to full opacity on row hover, on
  the row carrying the existing `j`/`k` keyboard focus cursor, or once any
  item in the list is selected. The header "Select all" checkbox is
  unaffected — it stays permanently full-opacity.
- Spacebar toggles the currently `j`/`k`-focused row's selection state,
  guarded by the same "ignore while typing" rule that already protects
  `j`/`k`/`Enter`. `Enter` keeps its existing meaning (open the focused item).
- Shift+click on a row unions a contiguous range (from the last
  clicked/toggled row to the newly-clicked one) into the existing selection,
  never replacing or clearing it. The first-ever Shift+click, with no prior
  anchor, selects just that one row and becomes the new anchor.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `test-execution`: the "Run execution board" requirement's multi-select
  description changes — the per-row checkbox's visual state is no longer
  constant, and two new selection gestures (Space, Shift+click) are added
  alongside the existing checkbox and "select all" affordances.

## Impact

- `apps/web/src/pages/RunPage.tsx`: `RunItemRow`'s checkbox gains
  opacity-state classes driven by hover/`focused`/`selected via any
  selection active`; new `lastToggledId` state for the Shift+click anchor;
  `handleKeyDown` gains a `Space` case; row click handling gains a
  `shiftKey`-aware path.
- No backend/API changes — pure frontend interaction and visual work,
  reusing the existing `selectedIds`, `displayOrder`, and `focusedIndex`
  state introduced by `#100`/`#82`.
- `docs/test-management.md` and `openspec/specs/test-execution/spec.md`:
  updated to describe the full selection-gesture set.
