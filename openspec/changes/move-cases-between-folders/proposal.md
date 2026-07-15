## Why

Moving a test case to a different section is currently API-only
(`PUT /api/v1/cases/{id}/folder`) — there is no way to do it from the UI at
all. This surfaced as a real point of confusion during a live check of the
project landing page: a case created before its section existed sits in the
project's root folder, which has no row of its own in the Library panel, so
the case is effectively invisible there even though the project's own
summary correctly counts it. Cases will always land in root by default when
created before any section exists — a way to move them afterward is a real
gap, not just a nice-to-have.

## What Changes

- Add drag-and-drop: a case row in the library explorer's content list can
  be dragged onto a section in the tree, or onto a subsection row shown
  inline in the content list, moving it there.
- Add a "Move to…" action on each case row as a non-drag alternative —
  opens a folder picker (searchable, shows full path) and moves the case on
  selection. Covers keyboard/touch users and makes the capability
  discoverable without relying on an unmarked drag affordance.
- Both interactions call the existing `PUT /api/v1/cases/{id}/folder` — no
  new backend work.
- Give root-level cases (created before any section existed) a visible home
  in the Library landing panel, so they're not invisible there.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ui-navigation`: the "Library with two-pane navigation" requirement
  gains drag-and-drop and Move-to-folder scenarios; the "Project landing
  shows top-level structure only" requirement's Library panel gains
  visibility for root-level cases.

## Impact

- `apps/web/src/pages/FolderExplorerPage.tsx` — draggable case rows, drop
  handlers on subsection rows, the Move-to action and its folder picker.
- `apps/web/src/components/FolderTree.tsx` — drop handlers + hover state
  on tree nodes.
- `apps/web/src/lib/useProjectLanding.ts` / `apps/web/src/pages/ProjectPage.tsx`
  — surface root-level case count in the Library panel.
- No API, domain, or database changes — reuses the existing move endpoint.
