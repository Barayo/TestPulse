## Why

As a user editing a suite's membership or picking cases for a new run, when I need to select many cases quickly, I want a picker that reads as considered and lets me select fast with a mouse or keyboard, instead of a plain checkbox list — the one place in the app that still uses a bare `<input type="checkbox">` per row after the Library's own bulk-select redesign moved away from checkboxes entirely.

Grounded in Pepe/Fable-5 review, following the user's explicit "Checkboxes are ugly, but this selection mode might be too light" — a stronger visual answer than a plain background tint, plus the range-select and keyboard mechanics `add-library-bulk-select` just established.

## What Changes

**`CasePicker.tsx`** (used by both `SuiteCaseGrid.tsx` — suite membership editing — and `NewRunPage.tsx` — run creation, so both consumers get this in one change):
- The native checkbox is replaced with a circular checkmark indicator (empty outline unselected, filled with a checkmark when selected) plus a `bg-primary/10` row tint — visually distinct from the row's own `hover:bg-accent`, a real collision Pepe's mock caught (a naive `bg-primary/5` was indistinguishable from hover in this palette).
- **Shift+Click is bidirectional, unlike the Library's additive-only range-select**: clicking a row's *resulting* checked state (the state it's about to become) is applied to every row between it and the last individually-toggled row. This is the correct semantic for membership (a toggle, not a one-way "gather targets for a bulk action" list) — the Library's shift-click never removes from selection because it's staging a bulk action, but suite/run membership needs to let a range-select also *un*-check a previously-checked range.
- **Keyboard**: arrow keys (or j/k) move a focus indicator through the rows with real virtualized-scroll math — `viewportRef.current.scrollTop` computed and set directly from the target index (mirroring the picker's own existing `resetScroll()` pattern), since a naive `scrollIntoView()` cannot work here: unlike the Library's plain list, `CasePicker` only mounts the rows inside its current windowed slice. Space toggles the focused row (first-toggle semantics, mirroring a first Shift+Click); Shift+Space extends the bidirectional range to the focused row; Enter has no action here (there's no "open" destination for a row in a picker — toggling *is* the action).
- Every row stays keyboard-focusable and screen-reader-navigable as a checkbox (`role="checkbox"`, `aria-checked`, `aria-label` — preserved exactly, so existing `getByRole('checkbox', …)`/`toBeChecked()`/`toBeDisabled()` test assertions across `SuiteCaseGrid.test.tsx`, `NewRunPage.test.tsx`, and `SuiteDetailPage.test.tsx` continue to hold without modification).

**API addition, not a breaking change**: `CasePicker`'s existing `onToggle: (caseId: string) => void` prop is unchanged (plain click / Space still call it for a single row). A new required `onToggleRange: (caseIds: string[], checked: boolean) => void` prop is added for the bidirectional range case; `SuiteCaseGrid.tsx` passes it through, and `SuiteDetailPage.tsx`/`NewRunPage.tsx` each implement it as a small "set all these ids to this checked state" reducer over their own `selected` state — the same shape as their existing single-id `toggle`/`toggleCase` functions, not a new state-management pattern.

**`apps/web/src/components/ui/checkbox.tsx`** (an unused, real shadcn/Radix component created during this session's earlier mockup iteration, before the checkbox-removal direction was settled): removed as dead code — nothing in the shipped design uses it, and no other legitimate use for it exists in the codebase today.

## Capabilities

### Modified Capabilities

- `ui-navigation`: the "Suites index and detail page" requirement's case-membership scenario and the "Run creation" requirement's case-picker scenarios are updated to describe the circular-indicator/tint selection and the bidirectional Shift+Click/keyboard range-toggle, replacing their "checkbox list" wording. A new requirement is added for the shared range-toggle behavior itself (owned by `CasePicker`, so it's specified once rather than duplicated under both call sites).

## Impact

- **Frontend only.** No API/schema changes — membership commits still go through the exact same `SuiteCaseGrid`/`NewRunPage` commit handlers as today; this change only touches how a case gets into or out of the `selected` set before that commit.
- Files: `apps/web/src/components/CasePicker.tsx`, `apps/web/src/components/SuiteCaseGrid.tsx`, `apps/web/src/pages/NewRunPage.tsx`, `apps/web/src/pages/SuiteDetailPage.tsx`. Deleted: `apps/web/src/components/ui/checkbox.tsx`.
- **Docs**: `docs/test-management.md`'s Suites section (case-membership picker) and Runs section ("New run" form) get updated wording; `docs/design-system.md` if it names the checkbox pattern for this picker.
- **Sample Project**: existing seed data already has enough cases per section across multiple suites to demonstrate range-select and keyboard nav in both the suite-editing and run-creation pickers; no seed changes needed.
- No GitHub issue existed for this work (unlike the other two changes in this batch, which came from existing backlog issues) — filed as part of this change's kickoff, board status "In progress."
