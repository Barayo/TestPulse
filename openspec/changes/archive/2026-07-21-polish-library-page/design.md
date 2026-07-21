## Context

`FolderExplorerPage.tsx` renders `FolderTree` (a fixed `w-64 shrink-0` nav pane) and a content
list side by side via `flex gap-4`, with no responsive behavior — confirmed by reading the
component directly (a code-level UX audit, not yet verified live in-browser). It's also the one
page in the app using raw `<button>`s and emoji icons instead of the shared `Button`/`lucide-react`
conventions every other page follows (`ProjectsPage.tsx`, `RolesPage.tsx`, `PeoplePage.tsx`).

The existing `Breadcrumbs` component already renders the full ancestor chain as links
(`FolderExplorerPage.tsx`'s `breadcrumbSegments`), and the existing "Move to…" dialog already
renders a searchable, full-path list of every folder (`folderPath()` builds "Library / A / B"
style labels). Both are reusable building blocks for mobile navigation rather than needing new
UI invented from scratch.

## Goals / Non-Goals

**Goals:**
- Below 768px, the Library view is usable single-handed on a phone: no squeezed two-pane layout.
- Navigating up the hierarchy on mobile costs nothing new to build — `Breadcrumbs` already does
  it.
- Navigating *sideways* (to a folder that isn't an ancestor of the current one) on mobile reuses
  the existing folder-picker list/search UI from "Move to…", not a new tree-picker.
- `FolderExplorerPage.tsx` reaches for `Button`/`Card`/`lucide-react` exactly like every other
  page — no more, no less.

**Non-Goals:**
- Changing the two-pane desktop layout (≥768px) at all — it's the audit's Tier-2 pages
  (RunsPage/SuitesPage), not this page's desktop behavior, that need work.
- Drag-and-drop move behavior — unchanged; only "Move to…"'s visual weight and its picker's
  reuse change.
- Any backend/API change.
- A full component-library refactor beyond this page. `FolderPicker` is extracted because it now
  has two call sites (move, navigate) — extracting components with only one caller elsewhere in
  the app is not in scope.

## Decisions

**Mobile hides the tree pane entirely rather than collapsing it into an accordion.**
Unlike case detail's sidebar (`redesign-case-detail-page`, three short, independent sections that
fit naturally as accordions), the folder tree is a recursive, potentially-deep navigation
structure — collapsing it into a `<details>` block still leaves a hard-to-scan nested list on a
narrow screen. Hiding it and relying on `Breadcrumbs` (up) plus a folder-picker dialog (sideways)
matches how the content list already works: on mobile, you're always looking at "the current
folder's contents," identical in shape to the desktop content pane, just full-width.

**`FolderPicker` is extracted from the existing "Move to…" dialog, not built new.**
The current `Dialog` in `FolderExplorerPage.tsx` already lists every folder via
`folderPath(folders, f.id, root.id)` with a search box filtering that list. Extracting the
list-rendering+search body into `components/FolderPicker.tsx` (props: `folders`, `rootId`,
`query`, `onQueryChange`, `onSelect`) gives two call sites — "Move to…" (`onSelect` moves the
open case) and a new "Browse sections" trigger, shown only below 768px, whose `onSelect`
navigates instead. One picker, two behaviors passed in, not two pickers.

**`useMediaQuery('(min-width: 768px)')` is a new shared hook, not a duplicate of
`useIsMobile`.** `useIsMobile` already exists (`lib/useIsMobile.ts`, 640px, matches Tailwind's
`sm`) and is used by `ProjectsPage.tsx` for a *different* decision (card-grid density). Reusing
it here would conflate two unrelated breakpoint decisions under one name. `useMediaQuery` is the
same shared hook the sibling change `redesign-case-detail-page` introduces for its sidebar split,
at the same 768px breakpoint — see that change's design.md, updated to reference this one.
Whichever change is implemented first creates `lib/useMediaQuery.ts`; the other reuses it as-is.

**Button/icon/Card swaps are mechanical, done in the same pass as the layout change.**
Both issues (#47, #48) touch the same file's same markup — doing the mobile rework without also
fixing button/icon/Card usage would mean touching every row twice. No new component decisions
here: `Button`, `Card`, `FolderIcon`, `FileTextIcon` all already exist with established usage
elsewhere; this is applying them, not designing them.

## Risks / Trade-offs

[`useMediaQuery` is introduced by two changes proposed close together — if both are implemented
independently without checking the other's state first, the file could be written twice with
diverging implementations] → both design.md files now cross-reference each other and specify the
exact same hook name, signature, and breakpoint; whoever implements second checks first.

[Extracting `FolderPicker` touches the existing, working "Move to…" flow] → the extraction is
required to have a passing test asserting "Move to…" behavior is unchanged before the new
"Browse sections" call site is added, not after.

[Hiding the tree entirely on mobile removes the ability to browse the *whole* structure at a
glance, unlike desktop] → acceptable per Goals: the picker's search covers "get to a specific
folder fast," which is the actual task; browsing the whole tree for its own sake is a desktop
affordance this change doesn't try to replicate on a phone screen.

## Open Questions

None outstanding — the mobile navigation approach (breadcrumbs up, picker sideways, no
tree-as-accordion) was resolved during this design pass by reusing existing components rather
than inventing new ones.

## Addendum: deep nesting (found via real usage, not the original design pass)

A real project with 7+ levels of nested sections turned up two problems this change's original
scope didn't anticipate, both fixed here since they're in the same shared components
(`Breadcrumbs.tsx`, `FolderTree.tsx`) this change already touches:

**Breadcrumb collapse.** `Breadcrumbs.tsx`'s `shrink-0`-every-ancestor approach (this change's
own earlier `min-w-16` fix) assumed a bounded, moderate number of ancestors. At real depth, the
row grows wide enough to require horizontal scrolling — and the current page (the one thing a
breadcrumb exists to show) scrolls off-screen by default. Fixed with a hard cap
(`MAX_VISIBLE_SEGMENTS = 5`): beyond it, the middle collapses behind a menu button, first-2 +
last-2 always visible, hidden segments reachable via a click. See
`docs/design-system.md`'s breadcrumb section for the full reasoning and the industry precedent
(VS Code, Finder, GitHub all use the same collapse-the-middle pattern).

**Tree indentation + readability.** Considered and explicitly deferred: a resizable tree panel
(the user's own first instinct, and a legitimate pattern — VS Code/Slack/Figma all do it).
Rejected as the *first* fix because it doesn't bound the worst case (an impractically wide panel
would still be needed for very long names at extreme depth), doesn't help mobile (tree is
already hidden below 768px), and adds real state/interaction/a11y weight for what's fundamentally
a readability problem. Built instead: `title` attribute on every tree row (full name always
available on hover, zero interaction cost) and a capped indentation step past depth 5 (16px/level
→ 4px/level), so extreme depth doesn't consume the whole fixed-width panel in indentation alone.
Resize itself is tracked separately (issue to be filed) as genuine, larger-scoped follow-up
work — not bundled into this fix.
