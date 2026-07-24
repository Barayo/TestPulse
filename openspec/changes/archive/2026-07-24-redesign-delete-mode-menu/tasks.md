## 1. RowActionMenu component (TDD)

- [x] 1.1 Write `RowActionMenu.test.tsx`: closed by default (no `role="menu"` in the DOM);
      clicking the trigger opens it; clicking outside closes it; Escape closes it; clicking an
      item calls its `onSelect` and closes the menu; an item with `danger` renders
      `text-destructive`; an item with `dividerBefore` renders a divider above it. Watch each
      assertion fail first.
- [x] 1.2 Implement `apps/web/src/components/RowActionMenu.tsx` — copy `AdminMenu.tsx`'s
      open-state/click-outside/Escape logic; accept `label` (for `aria-label`) and
      `items: { label, icon, onSelect, danger?, dividerBefore? }[]`; trigger uses the
      `size-7 rounded-md` hit-target recipe with a visible `hover:bg-accent` state.
- [x] 1.3 Verify green; check pristine output.

## 2. Wire FolderExplorerPage to the new menu (TDD)

- [x] 2.1 Write/replace tests in `FolderExplorerPage.test.tsx`: no "Delete mode" toggle exists;
      a case row's `⋯` menu lists "Move to…" always and "Delete" only with `caseDelete`; a
      folder row's `⋯` trigger is absent without `sectionDelete` and lists "Delete" with it;
      selecting "Delete" from either row type opens the existing confirmation dialog unchanged;
      selecting "Move to…" opens the existing FolderPicker dialog unchanged. Watch fail first.
- [x] 2.2 Remove `deleteMode` state and the "Delete mode" toolbar `Button`.
- [x] 2.3 Replace the case row's standalone "Move to…" and delete icon buttons with one
      `RowActionMenu`; replace the folder row's conditional delete icon with a
      permission-gated `RowActionMenu`.
- [x] 2.4 Verify green; check pristine output; run `make coverage-web` and confirm the ≥80%
      gate still holds (add targeted tests for any uncovered branch, same as
      `add-delete-mode`'s coverage fix).

## 3. E2E

- [x] 3.1 Update `apps/web/e2e/delete-mode.spec.ts`: replace "toggle delete mode, then click
      the delete icon" steps with "open the row's `⋯` menu, then click Delete" / "click Move
      to…"; keep the same assertions on outcome (cascading delete, confirmation copy, cancel
      leaves state unchanged).
- [x] 3.2 Run `make e2e` (fresh `docker compose down -v` first only if the DB schema changed —
      it hasn't in this change, so a plain run should suffice) and confirm the full suite,
      including this file, passes.

## 4. Docs and spec sync

- [x] 4.1 Sync `openspec/specs/test-authoring/spec.md` from this change's delta (rename +
      modify the destructive-actions requirement).
- [x] 4.2 Update the one cross-reference in `openspec/specs/authorization/spec.md` (currently
      says "`add-delete-mode`'s delete mode toggle") to describe the per-row menu instead.
- [x] 4.3 Update `docs/test-management.md`'s "Deleting a case or section" paragraph to describe
      the `⋯` row menu instead of the toolbar toggle.

## 5. Sample Project showcase

- [x] 5.1 Confirmed: the Sample Project's existing seeded content — the nested "Two-Factor"
      folder and its cases, added by `add-delete-mode` — already exercises both "Move to…" and
      "Delete" through the new per-row menu. No `seed.go` changes needed; this change alters
      *how* the actions are triggered, not what data exists to trigger them on.

## 6. Archive

- [x] 6.1 Archive this change once all tasks above are complete and verified.
