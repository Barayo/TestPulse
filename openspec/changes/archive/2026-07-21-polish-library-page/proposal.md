## Why

A full-app UX audit (2026-07-20) found `FolderExplorerPage.tsx` — the Library view, the app's
primary test-authoring surface — is the one page that breaks from the rest of the codebase's
conventions, and the one page with no mobile treatment at all. Tracked as GitHub issues #47
(mobile layout) and #48 (component/icon consistency), both `backlog`, both highest-priority
findings from that audit.

## What Changes

- **Mobile layout** (issue #47): below 768px, hide the persistent `FolderTree` pane and show only
  the content list at full width. Going up the hierarchy is covered by the existing `Breadcrumbs`
  trail (already links every ancestor). Jumping to a non-ancestor folder is covered by a new
  "Browse sections" action that opens the same searchable folder-list picker already used by
  "Move to…" — extracted into a shared `FolderPicker` component with two call sites
  (move-a-case, navigate-to-folder) instead of one. At ≥768px, nothing changes: tree and content
  list stay side by side as today.
- **Component and icon consistency** (issue #48): replace raw `<button className="...">` elements
  with the shared `Button` component; replace emoji folder/case icons (📁/📄) with `lucide-react`
  (`FolderIcon`, already used this way on `ProjectPage.tsx`/`RolesPage.tsx`; `FileTextIcon` for
  cases, already used on `RolesPage.tsx`); wrap the content list in the shared `Card` component;
  give "Move to…" more visual weight. Implementation-only — no spec-level behavior change.
- No backend/API changes. Drag-and-drop move behavior is unchanged; only "Move to…"'s visual
  treatment and its underlying picker's reuse change.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: "Library with two-pane navigation" gains mobile-specific behavior — the tree
  becomes an on-demand picker below 768px instead of a persistent pane, with breadcrumbs and the
  new picker covering navigation that the tree previously handled directly.

## Impact

- **Frontend**: `apps/web/src/pages/FolderExplorerPage.tsx` (layout, buttons, icons),
  `apps/web/src/components/FolderTree.tsx` (only rendered ≥768px, otherwise unchanged), a new
  `apps/web/src/components/FolderPicker.tsx` (extracted from the existing "Move to…" dialog body),
  a new `apps/web/src/lib/useMediaQuery.ts` hook (shared with the sibling change
  `redesign-case-detail-page`, which introduces the same hook at the same 768px breakpoint for its
  own sidebar/accordion split — whichever change lands first creates the file, the other reuses
  it; both changes' design.md note this).
- **Docs**: `docs/test-management.md` updated for the new mobile navigation behavior.
- **No backend, API, or schema changes.**
