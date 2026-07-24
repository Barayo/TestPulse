## 1. RowActionMenu: cursor-positioned open (TDD)

- [x] 1.1 Write tests in `RowActionMenu.test.tsx`: an imperative `openAt(x, y)` handle (via a
      test harness component holding a ref) opens the menu fixed at that position; the
      ref-opened menu still closes on Escape and outside-click, same as the button-opened one.
      Watch fail first.
- [x] 1.2 Implement: wrap `RowActionMenu` in `forwardRef`, add `useImperativeHandle` exposing
      `openAt`; render the menu `fixed` at the given coordinates when opened that way, `absolute
      right-0` (unchanged) when opened via the button; a left-click on the button always resets
      to the anchored position.
- [x] 1.3 Verify green; check pristine output.

## 2. FolderExplorerPage: right-click on rows (TDD)

- [x] 2.1 Write/extend tests in `FolderExplorerPage.test.tsx`: right-clicking a case or folder
      row opens that row's menu (same items as the left-click trigger); right-clicking a folder
      row without `sectionDelete` does nothing (no menu, no crash). Watch fail first.
- [x] 2.2 Extract `FolderRow` and `CaseRow` as local subcomponents (each needs its own
      `useRef<RowActionMenuHandle>`, which a `.map()` callback body cannot hold directly).
      Attach `onContextMenu={(e) => { e.preventDefault(); menuRef.current?.openAt(e.clientX,
      e.clientY) }}` to each row.
- [x] 2.3 Verify green; check pristine output; re-run `make coverage-web`.

## 3. FolderTree: visible trigger + right-click, replacing the bespoke menu (TDD)

- [x] 3.1 Update `FolderTree.test.tsx`: replace the `context-menu-backdrop`-based outside-click
      test with `RowActionMenu`'s own outside-click mechanism; keep the right-click-opens-menu
      test working through the new implementation; add a test asserting a visible "⋯" trigger
      exists on every folder node and opens the same "New section" item on click. Watch fail
      first.
- [x] 3.2 Give `TreeNode`'s row a trailing `RowActionMenu` (`flex-1` on the name button to make
      room), wired to the existing `onNewSubfolder(folder.id)`; wire the row's `onContextMenu`
      to the same ref's `openAt`; delete the now-unused local `ContextMenu` component and
      `menu` state. Labeled `New section in {folder.name}` rather than a generic "Actions for…"
      to avoid an accessible-name collision with the content list's identically-named folder
      row trigger.
- [x] 3.3 Verify green; check pristine output. Also found and fixed a real cross-cutting bug via
      real-browser (Playwright) e2e failures that jsdom unit tests couldn't catch: each menu
      item was wrapped in a `<span>` that visually intercepted pointer events on its own child
      button in real Chromium rendering — replaced with a `Fragment` (no real DOM node).
      Separately, right-click-opened (cursor-positioned) menus are now portaled to
      `document.body` via `createPortal`, since a plain `position: fixed` div nested deep in the
      Library's layout could still end up visually covered by unrelated ancestors.

## 4. E2E and docs

- [x] 4.1 Add a right-click scenario to `apps/web/e2e/delete-mode.spec.ts` (plus a tree-visible-
      trigger scenario), matching the new spec scenarios.
- [x] 4.2 Run `make e2e`; confirm the full suite passes, including the existing tree-based
      "creating a subfolder from the tree" scenario still works unchanged.
- [x] 4.3 Sync `openspec/specs/test-authoring/spec.md` from this change's delta.
- [x] 4.4 Add clarifying sentences to `docs/test-management.md` noting right-click and the
      tree's visible trigger.

## 5. Sample Project showcase

- [x] 5.1 Confirmed: the existing Sample Project content (sections and cases already seeded by
      prior changes) is sufficient to exercise both trigger paths (visible "⋯" and right-click)
      on both the tree and the content list — no `seed.go` changes needed, since this is purely
      an interaction-discovery change, not new data.

## 6. Archive

- [x] 6.1 Archive this change once all tasks above are complete and verified.
