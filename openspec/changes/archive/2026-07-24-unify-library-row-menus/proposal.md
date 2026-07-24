## Why

A live UX review of `redesign-delete-mode-menu` (shipped, archived) found the Library view has
two independently-built row menus that don't agree: the section tree's "New section" is
right-click-only with no visible affordance at all, while the content list's new "⋯" menu is
left-click-only with no right-click handling — so right-clicking a content-list row falls
through to the browser's own native context menu, which reads as broken. Neither surface alone
is wrong, but together they're inconsistent, and the tree's right-click-only trigger has a real,
independent discoverability gap (nothing hints the action exists without already knowing to
right-click).

## What Changes

- `RowActionMenu` (`apps/web/src/components/RowActionMenu.tsx`) gains an imperative `openAt(x, y)`
  handle (via `forwardRef`) so it can be opened at an explicit cursor position, in addition to its
  existing left-click trigger button — one component, two entry points to the same menu.
- `FolderExplorerPage.tsx`'s folder and case rows get a right-click (`contextmenu`) handler that
  opens their existing `RowActionMenu` at the cursor, alongside the already-shipped "⋯" button.
- `FolderTree.tsx`'s folder nodes gain a visible "⋯" trigger (reusing `RowActionMenu`, one item:
  "New section") — fixing the tree's pre-existing lack of any visible affordance — plus the same
  right-click-at-cursor behavior, replacing the tree's bespoke local `ContextMenu` component.
- No permission model, API, or confirmation-dialog changes — this is purely about how the
  existing actions ("New section", "Move to…", "Delete") are discovered and triggered.

## Capabilities

### Modified Capabilities
- `test-authoring`: extends the per-row-menu requirement (from `redesign-delete-mode-menu`) with
  a right-click-at-cursor entry point, and adds tree-row menu visibility to the same pattern.

## Impact

- `apps/web/src/components/RowActionMenu.tsx` (+ test) — add the `openAt` imperative handle.
- `apps/web/src/pages/FolderExplorerPage.tsx` (+ test) — wire `onContextMenu` on both row types.
- `apps/web/src/components/FolderTree.tsx` (+ test) — add a visible "⋯" trigger, replace the
  bespoke `ContextMenu` with `RowActionMenu`, wire `onContextMenu`.
- `openspec/specs/test-authoring/spec.md` — sync.
- No docs changes beyond a small clarifying line in `docs/test-management.md` (right-click is a
  shortcut, not a new capability worth its own paragraph).
