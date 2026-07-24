## Context

`add-delete-mode` shipped an app-wide "Delete mode" toolbar toggle gating every row's delete
icon in the Library view. A live UX critique (grounded in this app's own precedent —
`PeoplePage.tsx`'s row-action recipe, `docs/design-system.md`'s destructive-confirmation
pattern, and `AdminMenu.tsx`'s existing dropdown-menu interaction) went through two revisions
before the user confirmed the direction: delete needs to be closed-by-default per row, not just
visually quieter while a mode is on. See the mockup discussed in conversation (not persisted to
the repo) for the before/after comparisons that led here.

## Goals / Non-Goals

**Goals:**
- Delete (and, for case rows, Move) render nothing destructive until a user deliberately opens
  that row's own menu.
- Reuse `AdminMenu.tsx`'s click-outside/Escape-to-close interaction rather than inventing a new
  one.
- Preserve every existing permission gate and the confirmation dialog exactly as shipped — this
  is a discovery/trigger rework, not a permissions or confirmation-copy change.

**Non-Goals:**
- Multi-select / bulk move or delete — raised in the same conversation, filed separately as
  GitHub issue #63 (backlog), not part of this change.
- Any change to `MyPermissions`, `FolderDeletePreview`, or the delete/move API endpoints.
- Adding new menu items beyond "Move to…" and "Delete" — a natural home for future per-row
  actions (e.g. rename), but none are being added now.

## Decisions

**A shared `RowActionMenu` component, not per-page duplicated markup.** `AdminMenu.tsx`'s
open-state/click-outside/Escape logic is copied into a new, generic component that takes a list
of `{ label, icon, onSelect, danger?, dividerBefore? }` items rather than hardcoding "Move to…"
and "Delete" — `FolderExplorerPage.tsx` is the only caller today, but the component doesn't
assume that. Extracting it also makes it independently unit-testable (open/close, keyboard,
item click) without going through the full page's data-loading scaffolding.

**Folder rows get a menu with one item, not a bare icon.** A folder row only ever has one
possible action (`Delete`, gated by `sectionDelete`). A one-item menu is slightly more clicks
than a bare icon would be, but using the same `RowActionMenu` component for both row types
keeps the interaction consistent across the page — a user learns "⋯ opens row actions" once,
not two different affordances depending on row type. If a folder gains a second action later
(e.g. rename), the menu is already there to hold it.

**The app-wide "Delete mode" toggle is removed, not kept alongside the menu.** Once Delete lives
behind a deliberately-opened per-row menu, the toggle would be a second gate on the same action
for no added safety — the permission check (`caseDelete`/`sectionDelete`, resolved via the
existing `GET /permissions`) still fully controls whether the menu item renders at all.

**"Move to…" keeps its current unconditional visibility (no permission check).** This matches
today's shipped behavior exactly — `moveCase` (case-to-folder) already required no explicit
permission check in the UI before this change, and that isn't part of what's being revised here.

## Risks / Trade-offs

- **"Move to…" now costs one extra click** (open menu → click item) instead of being a
  standalone visible button. Accepted deliberately: the previous adjacency of a visible Move
  button next to a visible Delete button was itself the problem the critique identified — two
  click-targets of very different consequence, one hover apart.
- **The `⋯` trigger needs a visible hover/focus state** even though it's not opacity-gated
  (unlike `PeoplePage.tsx`'s reveal-on-hover icons) — otherwise it can read as dead space on
  desktop until clicked. Covered by a task below; verify visually before calling this done.

## Migration Plan

Pure frontend interaction change, no data migration. Land behind the normal TDD/PR flow; no
feature flag needed since there's no persisted state tied to the old toggle (`deleteMode` was
component-local `useState`, reset on every page load already).
