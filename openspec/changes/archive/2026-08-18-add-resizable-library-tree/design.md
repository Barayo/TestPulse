## Context

`FolderTree.tsx`'s `<nav>` is a hardcoded `w-64` (256px) panel rendered by
`FolderExplorerPage.tsx` next to the content pane, desktop-only (`isDesktop` gate, hidden
below 768px). No resize affordance exists today. This design was validated via a one-question-
at-a-time brainstorm with the user (default/clamp range, handle visibility, keyboard step) and
a Pepe (Fable 5) visual-design pass for the handle's hover/focus/drag treatment, producing a
published interactive mock.

## Goals / Non-Goals

**Goals:**
- Let a user drag (or keyboard-resize) the section tree panel's width, clamped 200–480px.
- Persist the chosen width per-device, surviving reload/navigation.
- Keyboard-accessible per WCAG splitter conventions (focusable separator, arrow keys, Home/End).
- Reuse the app's existing localStorage-preference pattern and focus-ring styling — no new
  visual language, no new dependency.

**Non-Goals:**
- No reset-to-default affordance (double-click, button) — not requested, out of scope for a
  Low-priority enhancement.
- No live width tooltip while dragging — no `Tooltip` primitive exists in
  `apps/web/src/components/ui/` yet; adding one is new component surface unrelated to this
  narrow change.
- No mobile treatment — the tree is already hidden below 768px; unaffected by this change.
- No server-side persistence — this is a pure client preference, same as view-mode/sort-order.

## Decisions

**1. `useResizableWidth` hook, not a third-party resizable-panels library.**
The only requirement is a single fixed-axis width with drag + keyboard support — small
enough to hand-roll in ~100 lines, matching the codebase's existing pattern
(`useViewModeOverride.ts`, `useSortOverride.ts`) rather than pulling in a new runtime
dependency for one panel. Revisit only if a second independent resizable panel appears
elsewhere in the app.

**2. Persistence: `localStorage`, key `testpulse.libraryTreeWidth`.**
Matches design D1 (confirmed 2026-07-14, `useViewModeOverride.ts`): this is a pure
client-rendered SPA, so no server ever reads this preference — a cookie would only add bytes
to every API request for nothing. Per-device, not per-user; consistent with how view-mode and
sort-order already behave.

**3. Handle visual treatment: invisible at rest, full-opacity 2px `--primary` line on
hover/focus/drag, 8px hit zone (Pepe's recommendation, mock published).**
`docs/design-system.md` previously measured this palette's `--border` as sub-pixel at
typical DPR — too faint to read as a low-opacity tint at 1–2px width (unlike
`FolderTree.tsx`'s existing `bg-primary/10` drag-over state, which works because it covers a
whole row). The hover/focus/drag state needs the boldest signal in the app's vocabulary, not
a soft one. The 8px hit zone splits 4px into the tree pane / 4px into the existing `gap-4`,
so it never overlaps a tree row's text or the content card's edge. Keyboard focus reuses the
exact `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` recipe
already used by `button.tsx`/`input.tsx`, applied as a box-shadow around the thin line rather
than a bespoke ring treatment.

**4. Cursor: JS drag-lock, not CSS `:hover` alone.**
An 8px target is easy for the pointer to overshoot mid-drag. If `col-resize` were set only via
CSS `:hover` on the handle, the cursor would snap back to the default arrow the instant the
pointer strays outside those 8px during a fast drag — reads as broken. Implementation toggles
a `dragging` state on `pointerdown` that forces `cursor: col-resize; user-select: none` on
`document.body` until `pointerup`, and listens for `pointermove`/`pointerup` on `window` (not
just the handle) so the drag continues correctly even if the pointer leaves the 8px zone.

**5. Keyboard: `role="separator" aria-orientation="vertical"`, Left/Right ±16px, Home/End →
min/max.**
Standard resizable-splitter accessibility pattern (matches VS Code/Figma). 16px chosen over
8px so the full 280px range (200–480px) is reachable in ~18 key presses rather than ~35.

**6. `FolderTree.tsx` accepts a `width` prop instead of owning its own width.**
Keeps `FolderTree` a controlled/presentational component; `FolderExplorerPage.tsx` owns the
`useResizableWidth` state and renders the `ResizeHandle` between the two panes, consistent
with how the page already owns `expanded`, `treeCreatingIn`, etc. and passes them down.

## Addendum: extending to CasePicker's "Sections" rail (user-requested, post-Library-implementation)

After the Library tree shipped, the user asked for the same treatment on `CasePicker.tsx`'s
own "Sections" rail (`w-56`, used by both `SuiteCaseGrid.tsx` and `NewRunPage.tsx` — a
separate implementation from `FolderTree.tsx`, not a shared component, despite the visual/
behavioral similarity). Decisions:

- **Second `useResizableWidth` instance, not a shared width.** `CasePicker`'s rail is a
  functionally distinct picker (used inside dialogs/embedded panels, defaults to 224px/
  `w-56` today vs. the Library tree's 256px/`w-64`) — a separate `localStorage` key
  (`testpulse.casePickerRailWidth`) keeps the two preferences independent, matching how a
  user might want a narrower picker inside a suite-editing panel than in the full-page
  Library browser.
- **No new Pepe review.** The hover/focus/drag visual treatment is identical to the
  already-validated Library tree handle — same component (`ResizeHandle`), same tokens, same
  interaction. Re-reviewing an already-approved, unchanged visual treatment would be process
  for its own sake.
- **Interaction with the existing "Hide"/`railCollapsed` toggle:** the resize handle only
  renders when the rail is expanded (`!railCollapsed`) — nothing to resize while collapsed,
  and the collapsed state's own vertical "Show sections" tab is unaffected.
- **One component, both surfaces get it.** `CasePicker` has no per-caller prop distinguishing
  Suites from New Run, and adding one just to make the picker resizable in one context but
  not the other would be more code for a strictly worse (inconsistent) result — confirmed
  with the user before implementing (both surfaces, not Suites-only).

## Risks / Trade-offs

- **[Risk]** At the 200px floor, section names truncate more readily than at today's fixed
  256px. → **Mitigation:** already handled by the existing `title`-attribute-on-hover +
  `truncate` treatment (`FolderTree.tsx`); this design doesn't change that fallback, only
  makes it reachable at a narrower width than before — the existing "truncated section name"
  scenario is updated to describe a variable rather than fixed width.
- **[Risk]** A stored width from a future narrower/wider min/max range change could render
  out of bounds. → **Mitigation:** clamp on read, not just on write, in `useResizableWidth`.
- **[Risk]** `localStorage` unavailable (privacy mode, quota) throws on write. → **Mitigation:**
  not specifically handled — matches the existing risk tolerance of
  `useViewModeOverride.ts`, which also doesn't guard this; consistent with the rest of the
  app rather than a new defensive pattern for one hook.

## Migration Plan

Purely additive client-side change, no data migration. Ships as a normal deploy; a first
visit after deploy has no stored width and falls back to the 256px default, identical to
today's fixed width.

## Open Questions

None outstanding — default width, clamp range, handle visibility, and keyboard step were all
resolved during brainstorming; visual treatment was resolved by Pepe's design pass.
