## Context

`SuiteDetailPage.tsx`'s Actions sidebar (shipped in `rework-run-creation-ux`)
already has Run suite (confirm dialog + Customize-selection deep-link),
Rename, and Delete, each as a full-width `Button` plus its own `Dialog`.
`SuitesPage.tsx`'s index renders each suite as a plain button-card with no
row-level menu at all. Every other dense list in the app (`FolderRow`,
`CaseRow` in `FolderExplorerPage.tsx`; `RunItemRow` in `RunPage.tsx`) already
owns a `RowActionMenu` per row — the index is the outlier. This is a pure
interaction-pattern-reuse change: no new mockup, since both the dialogs and
the menu component already exist and are already approved/shipped.

## Goals / Non-Goals

**Goals:**
- Suites index cards get the same Run suite/Rename/Delete actions as the
  detail page, via `RowActionMenu` (right-click + visible "⋯" trigger),
  matching the established per-row pattern exactly.
- No duplicated dialog/handler logic between the index and detail page.

**Non-Goals:**
- No new visual design work — reuses existing, already-shipped dialogs.
- No change to what Run suite/Rename/Delete actually do (their API calls,
  confirm copy, Customize-selection behavior) — only a new entry point.
- No bulk actions across multiple suites — out of scope, matches the
  existing per-row (not multi-select) precedent everywhere else in the app.

## Decisions

- **Extract a single `SuiteActionsMenu` component owning the three dialogs'
  state and handlers, rendered in two trigger variants.** It takes `suite`,
  `projectKey`, `navigate`, and `onChanged` (called after any successful
  mutation so the caller can refetch its own list/detail data), and exposes
  `variant: 'buttons' | 'menu'`:
  - `variant="buttons"` renders the three full-width `Button`s exactly as
    `SuiteDetailPage.tsx` does today (visually unchanged) — used there.
  - `variant="menu"` renders a `RowActionMenu` with the same three actions
    as menu items (Run suite, Rename, Delete-with-`danger`) — used by each
    `SuitesPage` card, one `SuiteActionsMenu` instance per card (mirroring
    `FolderRow`/`CaseRow`'s "each row owns its own menu ref" pattern — a
    `RowActionMenu` ref can't live inside a bare `.map()` callback).
  Both variants render the same three `<Dialog>`s internally, so the
  quick-run confirm copy, the Customize-selection deep-link, the rename
  input, and the delete confirmation text are written and tested exactly
  once regardless of entry point.
- **`SuiteDetailPage.tsx` is refactored to use `SuiteActionsMenu
  variant="buttons"`** rather than keeping its own separate (now
  duplicate) implementation — its existing tests move to cover
  `SuiteActionsMenu` where they test the actions themselves, and stay on
  `SuiteDetailPage.test.tsx` where they test page composition (the button
  layout, the sidebar structure).
- **The index card's own click-to-open-detail behavior and the menu's
  right-click are independent** — right-clicking a card opens the menu
  (via `e.preventDefault()` on `contextmenu`, same as `FolderRow`/`CaseRow`)
  without also navigating; the menu's own trigger button stops propagation
  so clicking it doesn't also navigate into the suite.

## Risks / Trade-offs

- [Refactoring `SuiteDetailPage.tsx`'s already-shipped, tested actions
  mid-flight] → Accepted: the alternative (duplicating three dialogs and
  their handlers onto the index) is the exact pattern this project has
  repeatedly rejected elsewhere this session (`CasePicker` extraction,
  `seedSelectionFromSuite` reuse). The extraction is mechanical and its
  existing tests pin the outward behavior, so this is a low-risk red-green
  refactor.

## Migration Plan

Pure frontend change, no schema/API impact. Ships as a regular deploy.
