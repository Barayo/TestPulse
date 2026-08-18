## Why

The Library's section tree panel (`FolderTree.tsx`) is a fixed 256px width. Users with
deep or wide project hierarchies have no way to see more of a long section name without
relying on the hover-tooltip fallback — a resizable divider (precedented by VS Code's
explorer, Slack's channel list, Figma's layers panel) lets them trade tree width for
content-pane width on demand. Issue #56, flagged during `polish-library-page`'s deep-nesting
fix as a legitimate but separately-scoped enhancement.

## What Changes

- The section tree panel gains a draggable, keyboard-resizable divider between it and the
  content pane, on desktop only (the tree is already hidden below 768px).
- Width is clamped 200px–480px, defaults to today's 256px, and persists per-device via
  `localStorage` (`testpulse.libraryTreeWidth`) — matching the existing
  `useViewModeOverride`/`useSortOverride` client-only-preference pattern, no server change.
- The divider is invisible at rest (today's existing `border-r` is the only affordance);
  on hover, keyboard focus, or while dragging it becomes a solid 2px `--primary` line with
  an 8px invisible hit zone, per Pepe's design review.
- New `apps/web/src/lib/useResizableWidth.ts` hook (reusable for any future resizable panel)
  and a small `ResizeHandle` component; `FolderTree.tsx`'s `<nav>` accepts a `width` prop
  instead of a hardcoded `w-64`.
- **Extended scope (user-requested mid-implementation):** `CasePicker.tsx`'s own separate
  "Sections" rail — a differently-implemented fixed `w-56` tree used by both the Suites
  detail page's case-membership editor and the New Run form's case selector (per
  `ui-navigation` spec: "the same mechanics as the suite case picker") — gets the identical
  resizable-divider treatment, reusing the same `useResizableWidth`/`ResizeHandle`
  infrastructure. One shared component, so both surfaces get it consistently rather than
  forking a resizable/non-resizable variant. Persists separately under
  `testpulse.casePickerRailWidth`, default 224px (matching today's `w-56`), same 200–480px
  clamp and visual treatment — no new Pepe review needed since the interaction and visuals
  are already validated, identical to the Library tree.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: the "Library with two-pane navigation" requirement's section-tree-panel
  behavior gains a resizable divider; the existing "truncated section name" scenario's
  wording ("the tree pane's fixed width") no longer holds once width is user-adjustable and
  is updated accordingly. The "Suites index and detail page" requirement's case-grid section
  tree gains the same resizable-divider behavior; "Run creation" inherits it by reference
  (its case picker already reuses "the same mechanics as the suite case picker").

## Impact

- `apps/web/src/components/FolderTree.tsx` — drop hardcoded `w-64`, accept `width` prop.
- `apps/web/src/pages/FolderExplorerPage.tsx` — wire up `useResizableWidth`, render the
  handle between the tree and content pane.
- `apps/web/src/lib/useResizableWidth.ts` (new) — persisted, clamped, keyboard-accessible
  width state, mirroring `useViewModeOverride.ts`'s localStorage pattern.
- `apps/web/src/components/CasePicker.tsx` — drop hardcoded `w-56` on the "Sections" rail,
  wire up a second `useResizableWidth` instance + `ResizeHandle`; affects both
  `SuiteCaseGrid.tsx` (Suites) and `NewRunPage.tsx` (New Run), since both consume this one
  component.
- New unit tests (`useResizableWidth.test.ts`), extended `FolderTree.test.tsx`,
  `FolderExplorerPage.test.tsx`, and `CasePicker.test.tsx`, two new E2E scenarios.
- No backend, API, or migration changes — purely client-side.
