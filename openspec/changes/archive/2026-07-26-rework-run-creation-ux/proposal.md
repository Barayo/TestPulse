## Why

`RunsPage.tsx`'s "New run" form has only a name field — `handleCreateRun` always
submits every case in the project (`caseKeys: cases.map((c) => c.key)`), with no
way to scope a run to a suite or a hand-picked set of cases, even though the
backend has supported exactly that (`RunInput{SuiteID, CaseIDs}`) since
`link-runs-to-suite`. Separately, a suite's detail page has no way to launch a run
from its own case set at all — "Rename" and "Delete" are the only actions. A
Pepe/Fable-5 design pass, validated via an interactive mockup approved by the
user, is the basis for this change: rework run creation around a real case
picker (generalizing the section-tree/search/virtualized `SuiteCaseGrid` shipped
in `rework-suite-case-picker-scale`), and add a one-confirm-step "Run suite"
action that deep-links into that same picker pre-scoped — one implementation,
two entry points, so the quick action never hides what it's about to create.

## What Changes

- `RunsPage.tsx`'s "New run" form gains a case picker reusing the
  `SuiteCaseGrid` pattern (section-tree scope, search, priority/platform/
  test-type filters, virtualized rows, selection persists across all of
  those) instead of silently including every project case.
- The form gains an optional "Suite" selector. Choosing a suite seeds the
  picker's selection with that suite's current member cases (editable
  afterward) and records the run's `suiteKey`; leaving it on "No suite" is an
  explicit ad hoc run — no separate ad hoc code path needed, it's just the
  form's default state.
- `SuiteDetailPage.tsx`'s Actions sidebar gains a "Run suite" button. It opens
  a compact confirm dialog ("N cases from {Suite}", an editable name, and a
  primary "Create run") that fires immediately on confirm. A "Customize
  selection" link hands off to the reworked Runs-page form, pre-seeded from
  the same suite — the same component and form, not a second implementation.
- No change to run *execution* (status filtering, item triage) — that is
  `rework-run-detail-ux`, a separate change touching `RunPage.tsx`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: adds a "Run creation" requirement (the picker-based "New
  run" form) and extends "Suites index and detail page" with the "Run suite"
  quick action.

## Impact

- `apps/web/src/pages/RunsPage.tsx` — replace the name-only form with the
  picker; add the suite selector and prefill logic.
- `apps/web/src/pages/SuiteDetailPage.tsx` — add the "Run suite" button and
  confirm dialog; deep-link (with prefilled state) into `RunsPage.tsx`.
- Likely extraction: the picker internals of `SuiteCaseGrid.tsx` (section
  tree, search, virtualization, `computeVisibleRange`) become a shared,
  suite-membership-agnostic component reused by both the suite-membership
  editor and the run-creation form, rather than duplicated. Exact shape
  (shared hook vs. shared component with a mode prop) is a design.md decision.
- No backend change — `RunInput{SuiteID, CaseIDs}` already exists end-to-end.
- `docs/test-management.md` — update the "Creating a run" description.
- `apps/web/e2e/` — new/extended scenarios for picker-based run creation and
  the suite quick-run action.
