## 1. Extract `SuiteActionsMenu` from `SuiteDetailPage` — TDD

- [x] 1.1 Write failing tests for a new `SuiteActionsMenu` component covering
  the three actions and their dialogs (moved/adapted from
  `SuiteDetailPage.test.tsx`): Run suite (confirm dialog shows case count +
  editable name, fires on confirm, "Customize selection" navigates with
  route state), Rename (dialog, PUT, name updates), Delete (dialog, DELETE,
  `onChanged` called) — for both `variant="buttons"` and `variant="menu"`.
- [x] 1.2 Implement `SuiteActionsMenu.tsx`: lift the `runningQuick`/
  `quickRunName`/`renaming`/`renameValue`/`deleting` state and
  `openRunSuite`/`handleQuickRun`/`handleCustomizeSelection`/`handleRename`/
  `handleDelete` handlers out of `SuiteDetailPage.tsx` unchanged in
  behavior; render the three `<Dialog>`s once, and either three full-width
  `Button`s (`variant="buttons"`) or a `RowActionMenu` with three items
  (`variant="menu"`) around them.
- [x] 1.3 Rewrite `SuiteDetailPage.tsx`'s Actions sidebar as
  `<SuiteActionsMenu variant="buttons" ... />`. Re-run its original tests
  (adjusted only where they moved to `SuiteActionsMenu.test.tsx`) — green
  before continuing, no consumer-visible regression.

## 2. Wire into the Suites index — TDD

- [x] 2.1 Write failing tests (`SuitesPage.test.tsx`): each card renders a
  `SuiteActionsMenu variant="menu"`; right-clicking a card opens the menu
  without navigating; the visible "⋯" trigger opens the same menu; menu
  actions (rename/delete/run) call the same API endpoints and refresh the
  index afterward.
- [x] 2.2 Implement: give each suite card a `RowActionMenu`-owning
  `SuiteActionsMenu variant="menu"` instance (one per card, per the
  `FolderRow`/`CaseRow` per-row-owns-its-menu pattern — a ref can't live
  inside a bare `.map()` callback), with `onContextMenu` opening it at the
  cursor and `onChanged` triggering the index's own `load()`.

## 3. Verification

- [x] 3.1 Full unit suite green, coverage gate maintained (≥80% all metrics).
- [x] 3.2 `tsc -b` / `oxlint` clean.
- [x] 3.3 New e2e scenario(s) in `apps/web/e2e/ui-navigation.spec.ts`
  ("Suites index and detail page"): right-click a suite card, run/rename/
  delete it from the index menu, confirm the same effect as the detail-page
  precedent scenarios.
- [x] 3.4 Manual visual verification via browser automation: the "⋯"
  trigger sits cleanly in each card's top-right corner, the click-to-open
  and right-click-at-cursor menus both render correctly with icons, and the
  card gets a hover ring while its menu is open. Dark mode not re-checked
  separately — this change reuses `RowActionMenu` and the existing dialogs
  verbatim (no new visual design per design.md), and both are already
  dark-mode-verified elsewhere in the app.

## 4. Docs and Sample Project

- [x] 4.1 Update `docs/test-management.md` to mention the index-level
  context menu alongside the existing detail-page Actions description.
- [x] 4.2 No Sample-Project-showcase task beyond what already exists — this
  is a new entry point onto already-seeded suites, not new content.

## 5. Ship

- [x] 5.1 Sync into `openspec/specs/ui-navigation/spec.md` — extend
  "Suites index and detail page" with the context-menu scenarios.
- [x] 5.2 Archive the change.
- [x] 5.3 GitHub issue #93 already existed for this change and was already
  on the project board — no duplicate filed. Board status moved to
  In Progress at the start of this session; move to To Review once
  committed, pushed, and CI is green.
- [x] 5.4 Commit + push per the "1 change = 1 commit = 1 push" cadence;
  wait for CI green.
