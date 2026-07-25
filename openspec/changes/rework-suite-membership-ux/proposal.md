## Why

Creating a suite and populating it with test cases is currently a confusing, broken-feeling flow: suite creation is a bare name field with no way to add cases, and the only way to add cases afterward is a modal (`CasePicker.tsx`) that adds exactly one case per open — no checkboxes, no multi-select, no visual distinction between "addable" and "already a member." A real user misread the plain list of addable cases as "already selected," and reported the flow as not understandable. Two independent research passes (a creative UX-sketch pass and a competitive-pattern survey across TestRail/Qase/Xray/PractiTest/TestLink/PatternFly/MUI) converged on the same fix. Prioritized ahead of `add-suite-pass-rate-trend` (#77) — a trend chart is not worth much on a suite nobody can populate comfortably.

## What Changes

- Suite **creation** becomes one screen: name field + a filterable checkbox-grid of the project's test cases + a persistent "N selected" bar + "Create suite (N)" — no more blind name-only creation followed by a separate populate step.
- Suite **membership editing** (today's `SuiteDrawer.tsx`) is replaced by the *same* checkbox-grid component, pre-checked with current members — one shared component, one mental model, instead of three different UIs (bare create form, one-at-a-time add modal, member-list-with-remove-buttons).
- Selection state is tracked by case ID, independent of the currently applied filter — checking a case and then changing a filter must not lose that selection.
- Filter row above the grid: Tag, Priority (the existing 4-value enum), Platform, Test Type (both free text — filtered by distinct values present among the project's cases, not a fixed enum, per `add-case-classification-fields` design.md).
- **Removed**: `CasePicker.tsx` (the one-at-a-time add modal) is retired entirely, replaced by the shared grid.
- **Deliberately out of scope**: a "select all matching this filter" bulk-add power feature — scoped as a later fast-follow once classification tagging is mature enough to trust; this change ships checkbox-by-checkbox selection only.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `test-authoring`: "Test suite grouping" requirement gains scenarios for the unified checkbox-grid selection UI (creation and editing), filter-safe selection state, and the empty/no-match states.

## Impact

- `apps/web/src/components/CasePicker.tsx` — removed.
- `apps/web/src/components/SuiteDrawer.tsx` — removed (its "remove a member" list UI is absorbed into the new shared grid).
- `apps/web/src/components/SuiteCaseGrid.tsx` (new) — the shared checkbox-grid component, used by both creation and editing.
- `apps/web/src/pages/SuitesPage.tsx` — creation form rebuilt around the new grid; "open a suite" now opens an edit view using the same grid instead of `SuiteDrawer`.
- No API/schema changes — suite membership is already an n:m relationship (`PUT`/`DELETE /suites/{suiteKey}/cases/{caseKey}`); this change is UI-only, computing a diff of checked-vs-original case IDs and issuing the existing add/remove calls.
- `docs/test-management.md` — update the suite-creation/membership description.
- Sample Project (`seed.go`) — already has 4 suites with varied membership; no seed change needed, but worth verifying the new UI reads well against that existing data during manual verification.
