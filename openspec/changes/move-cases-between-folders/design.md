## Context

`PUT /api/v1/cases/{id}/folder` already exists and works (test-authoring's
"Move a case to a different folder" scenario) but has never had a UI. The
library explorer (`FolderExplorerPage.tsx`) already shows root-level cases
correctly when you navigate to the Library root — the actual gap found live
was narrower: the *landing page's* Library panel only ever lists real named
subsections (`useProjectLanding`'s `topLevel.map(...)`), never a row for
root itself, so a case sitting in root has no representation there even
though the project summary strip counts it.

## Goals / Non-Goals

**Goals:**
- A case can be moved to a different section via drag-and-drop (tree node
  or inline subsection row as drop target) or via a "Move to…" picker.
- Root-level cases get a visible entry in the landing page's Library panel.

**Non-Goals:**
- Reparenting sections themselves via drag-and-drop — only cases move.
- Dropping directly onto the root/"Library" breadcrumb crumb or a tree
  root node — the tree doesn't render a root row today; the Move-to picker
  (which lists every folder including root) covers "move back to root."
  Revisit only if this turns out to be a common enough action to want a
  dedicated drop target.
- Multi-select drag (dragging several cases at once) — single-case moves
  only, matching every other case-authoring interaction in the app today.

## Decisions

**Native HTML5 drag-and-drop, no new dependency.** `draggable`, `onDragStart`,
`onDragOver` (`preventDefault` to allow the drop), `onDrop`. Keeps the
"all stack additions must be open source" constraint trivially satisfied
(browser API, not a library) and avoids pulling in a DnD framework for a
single-item, single-target interaction.

**Two independent paths to the same move, not drag-and-drop with a
fallback bolted on.** Confirmed with the user: drag-and-drop alone has no
keyboard/touch path and no visible affordance. The "Move to…" button is a
first-class action, not an accessibility afterthought — same underlying
`moveCase(caseId, folderId)` call, two entry points.

**Move-to picker: a `Dialog` + searchable list, same shape as
`ProjectSwitcher`.** Shows every folder in the project with its full path
(disambiguates same-named sections at different depths — e.g. two
"Regression" sections under different parents). Reuses the existing
`Dialog`/`Input` components rather than introducing a new picker pattern.

**Root-level cases surface as a prepended "Unsectioned" pseudo-row in the
Library panel, not a structural change to the folder model.** Computed as
`cases.filter(c => c.folderId === root.id).length` in `useProjectLanding`,
shown only when > 0, clicking it navigates to `/library/{root.id}` — the
existing Library root view, which *already* shows those cases correctly
today (this was never broken; only the landing panel's summary was blind
to them). Counts toward the panel's `TOP_N` cap like any other row, prepended
so it's the first thing seen — deliberately not exempted from the cap to
avoid special-casing the render logic for a case that will be rare (many
named subsections *and* leftover unsectioned cases at once).

**Drop-target no-op: dropping a case onto its current folder does
nothing** (no API call, no error) — same folder is a no-op, not an error
state.

## Risks / Trade-offs

- **jsdom doesn't support real drag events** — tests drive
  `onDragStart`/`onDragOver`/`onDrop` handlers directly via
  `fireEvent.dragStart(el, { dataTransfer: mockDataTransfer })` with a
  minimal `{ getData, setData }` stub, the standard RTL pattern for this;
  covers the handler logic, not actual browser drag physics (never
  meaningfully testable in jsdom regardless).
- **Prepending "Unsectioned" competing with real subsections for the
  `TOP_N` slot** is a real but minor trade-off, noted above — acceptable
  for the rare case it affects.

## Open Questions

None outstanding.
