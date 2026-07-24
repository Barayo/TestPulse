## Context

`redesign-delete-mode-menu` gave the Library content list a closed-by-default "⋯" menu per row.
A live review afterward compared it against the section tree's pre-existing right-click-only
"New section" menu and found them inconsistent — and the tree's trigger has its own real gap
(zero visible affordance). This is a small follow-up unifying both onto one pattern.

## Goals / Non-Goals

**Goals:**
- One row-menu component, one interaction contract, used identically by the tree and the content
  list: a visible "⋯" trigger (primary, discoverable, works on touch) plus right-click-at-cursor
  (secondary, desktop-only, additive).
- Right-clicking a row never falls through to the browser's native context menu.

**Non-Goals:**
- Any change to what's *in* the menus (items, permissions, confirmation dialogs) — this is
  purely about how they're triggered.
- Mobile/touch equivalents for right-click (e.g. long-press) — out of scope; the visible "⋯"
  already covers touch.

## Decisions

**`RowActionMenu` gets one new capability (`openAt`), not a second component.** A `forwardRef`
exposing `openAt(x, y)` lets a right-click handler on the row reuse the exact same open/close
state, click-outside/Escape logic, and item rendering the button trigger already uses — the only
difference is whether the menu renders anchored under the button (`absolute right-0`) or fixed
at the cursor (`fixed`, explicit `left`/`top`). Two triggers, one state machine, one visual
language.

**The tree's bespoke local `ContextMenu` component is deleted, not kept alongside.** Before this
change, `FolderTree.tsx` had its own small right-click-only menu implementation, separate from
`RowActionMenu`. Keeping both would mean two menu components with near-identical logic to
maintain; replacing it with `RowActionMenu` is the same DRY argument that motivated extracting
`RowActionMenu` out of `AdminMenu.tsx`'s pattern in the first place.

**Per-row refs, not a shared ref registry.** Each `FolderRow`/`CaseRow`/tree `TreeNode` already
renders as its own component instance (required for hooks — `useRef` inside a `.map()` callback
that isn't its own component would violate the rules of hooks once list length can change), so
each owns one local `useRef<RowActionMenuHandle>` — no `Map`-based registry needed.

## Risks / Trade-offs

- Extracting `FolderRow`/`CaseRow` as local subcomponents inside `FolderExplorerPage.tsx` is a
  larger diff than a one-line ref, but it's the only correct way to give each row its own
  imperative handle — matches the precedent `FolderTree.tsx`'s own `TreeNode` already sets.
