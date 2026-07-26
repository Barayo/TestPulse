## Context

`SuiteCaseGrid.tsx` today: `SuiteCaseGridCase = {id, title, tags, priority, platform,
testType}` (no folder info), four flat filter dropdowns, a `max-h-96 overflow-y-auto`
`<ul>` rendering every matching case unconditionally. `SuiteDetailPage.tsx` (just
shipped, `rework-suites-landing-ux`) is its only consumer. The app's real folder
hierarchy (`Folder{id, name, parentFolderId}`, already fetched via
`GET /projects/{projectKey}/folders` and rendered read/write in `FolderTree.tsx` for
the Library browser) is never passed into this component. A Pepe/Fable-5 mockup
(`mockup.html`, this directory), user-approved, is the visual/interaction source of
truth — read it alongside this doc.

## Goals / Non-Goals

**Goals:**
- Section-tree scoping composable with the existing four dropdown filters.
- Title search, composable with scope and filters.
- Bounded DOM row count regardless of case volume or filter state, including the
  unfiltered default.
- Selection stays scope/filter/search-safe (already-established guarantee, must not
  regress).

**Non-Goals:**
- No changes to `FolderTree.tsx` itself or the Library browser — this is a separate,
  simpler, read-only tree variant (no inline creation, no drag-drop, no context
  menu), not a shared-component refactor. Reuse the *data shape*, not the component.
- No changes to run creation — it doesn't use a manual case picker today (a run
  pulls in all current project cases automatically); out of scope.
- No new backend endpoint — folders are already fetched elsewhere.

## Decisions

- **Virtualization is a lightweight custom windowing implementation, not a new
  dependency.** The mockup proved the technique (fixed 60px rows, a spacer sized to
  `total × rowHeight`, render only the visible slice + overscan) works well; the
  real implementation does the same thing idiomatically in React — a scroll
  container ref, an `onScroll` handler (throttled via `requestAnimationFrame`)
  updating a `scrollTop` state, and rendering only the computed visible slice of
  the filtered array (translated into position via a padding/transform wrapper),
  rather than the mockup's manual DOM-node-recycling (which was a vanilla-JS
  necessity for a static HTML mockup, not a pattern to carry into React — React's
  own reconciliation already avoids remounting when the *rendered slice* is small
  and keyed correctly). No new dependency (react-window etc.) — the windowing math
  is small and self-contained, and the project has no existing virtualization
  dependency to build on.
- **Fixed 60px row height is a hard constraint**, same as the mockup: tags render
  capped at 2 + a `+N` overflow badge so every row is the same height. Variable-height
  virtualization is meaningfully harder and not justified here.
- **Folder scoping selects a folder's full subtree**, not just direct children —
  matches how "Checkout → Payments" reads as one bucket in the mockup, and mirrors
  the Library browser's own section-as-subtree mental model.
- **The tree rail is collapsible** (mockup's "Hide/Show sections" toggle) — the
  grid shares its row with a 320px properties sidebar on the suite detail page, so
  reclaiming width needs to be one click.

## Risks / Trade-offs

- [Custom virtualization is more code to maintain than a library] → Accepted: the
  windowing math is small (~30-40 lines), fixed-row-height only, and avoids adding
  a new runtime dependency for one component.
- [Fixed row height caps how much per-row detail can be shown] → Already resolved
  in the mockup via the 2-tag-cap + overflow-badge pattern; carried forward as-is.

## Migration Plan

Pure frontend change, no schema/API impact. Ships as a regular deploy.
