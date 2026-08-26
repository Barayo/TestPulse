## Context

Several rounds of Pepe/Fable-5 mockup review already settled the interaction
model this design formalizes: v1 (checkbox-based) was rejected ("Checkboxes
are ugly"); the approved direction removes the checkbox affordance entirely
in favor of `RunPage.tsx`'s existing shift-click range-select semantics,
plus keyboard parity (arrow-key focus + Space/Shift+Space), plus a
bottom-fixed footer bar carrying the count and actions instead of
`RunBulkActionBar.tsx`'s inline top-of-list bar.

## Goals / Non-Goals

**Goals:** select any contiguous or built-up set of case rows without a
checkbox, using only Shift+Click and keyboard, and act on the whole
selection with Move to…/Delete in one step.

**Non-Goals:** selecting folder rows (issue #63's original idea included
sections, but every review round since only ever mocked case selection —
folders keep their existing single-row `Move to…`/`Delete`); persisting
selection across a folder navigation or a filter/search change (RunPage's
own bulk-select doesn't guarantee this either — selection is a transient,
current-view concept, not a saved state); new API endpoints (existing
single-case endpoints looped client-side are enough at this scale).

## Decisions

**D1 — Shift+Click only, no plain-click selection.**
A plain click always opens the case (unchanged) — this is a hard constraint
`redesign-case-picker-membership`'s own analysis already flagged when
comparing Library to CasePicker: unlike CasePicker's rows (which have no
competing click action), a Library row's plain click is already spoken for.
Mirroring `RunPage.tsx`'s `toggleSelect(id, shiftKey)` exactly: the first
Shift+Click (no prior anchor) toggles just that row and sets it as the
anchor; every subsequent Shift+Click extends a contiguous range from that
anchor. This literally realizes the original ask ("enable shift+click for
multiselection") without inventing a second gesture for the first click.

**D2 — Keyboard mirrors the mouse model, not `RunPage.tsx`'s exact bindings.**
`RunPage.tsx`'s Space unconditionally toggles one row and has no
shift-modified variant, because its checkbox already carries the
range-vs-single distinction visually. Library has no checkbox, so Space
alone (first press) plays the same role as an anchor-setting Shift+Click,
and **Shift+Space** plays the role of a range-extending Shift+Click —
two keyboard bindings where RunPage only needed one, because Library's
mouse model itself needs two gestures where RunPage's needed one (plain
checkbox-click vs. shift-checkbox-click). Arrow keys (and j/k, matching
RunPage's own dual binding) move a `focusedIndex` through the case-only
list; Enter opens the focused case, matching RunPage's own Enter.

**D3 — Real `scrollIntoView`, not a latent gap.**
`RunPage.tsx`'s keyboard nav has no `scrollIntoView` call — a known,
previously-noted gap, left alone there because that page's row virtualization
context made the fix non-trivial. Library's case list is not virtualized
(every row is a real DOM node), so `element.scrollIntoView({ block:
'nearest' })` on the focused row, via a `Map<string, HTMLLIElement>` ref
collection keyed by case key, is a direct, low-risk fix — worth doing here
since nothing blocks it.

**D4 — Selection tint, not a new icon.**
A selected row gets `bg-primary/10` (a `bg-primary/10` collision with hover
was already caught and worked around once this session, for CasePicker's
membership tint at 10-15% — same fix applies here: `hover:bg-accent`
and `bg-primary/10` render as visually distinct tints in this palette, so no
new token is needed). No checkmark, no border — the row's existing content
(title, pills) is the only thing that changes visual weight, via the
background alone. A keyboard-focused row (independent of selection) gets a
`ring-2 ring-inset ring-primary/50` outline so focus and selection stay
visually distinguishable when they overlap.

**D5 — Footer bar is a new component, not a reused one.**
`RunBulkActionBar.tsx` is left untouched — its `rounded-md border bg-accent`
inline-bar styling is designed to sit at the top of a list, not float over
the viewport, and it has no "Select all" affordance. `LibraryBulkActionBar.tsx`
is a new, small component that imports `RunBulkActionBar.tsx`'s exported
`BulkAction` type (so both bars describe actions identically) but renders
its own `fixed inset-x-4 bottom-4 z-50 … shadow-lg ring-1 ring-foreground/10`
card, matching `ConfirmBanner.tsx`'s elevated-toast idiom rather than
inventing new positioning language.

**D6 — Bulk Move/Delete are new dialogs, not repurposed single-case ones.**
The existing `movingCaseKey`/`deleteTarget` state and dialogs stay exactly
as they are (already well-tested, single-case only). Bulk move gets its own
`bulkMoveKeys: string[] | null` state and dialog reusing `FolderPicker`;
bulk delete extends `DeleteTarget`'s existing discriminated union with a
`{ kind: 'bulk'; keys: string[] }` variant handled in the same dialog and
`confirmDelete()` function as `case`/`folder`, since the confirm-and-reload
shape is identical — only the message and the delete call differ.

**D7 — Client-orchestrated bulk actions, matching `recordBulkVerdict.ts`.**
`bulkMoveCases(keys, targetFolderId)` and `bulkDeleteCases(keys)` are small
`lib/` helpers, each a thin `Promise.all` over the existing single-case
endpoint — the same shape `recordBulkVerdict.ts` already established for
the Run board's bulk verdict actions. No backend change, no new endpoint.

**D8 — Reuse `RunShortcutsHint`/`RunShortcutsOverlay` for discoverability.**
Shift+Click and Space/Shift+Space have no visual affordance on the row
itself (deliberately, per "checkboxes are ugly"). `RunShortcuts.tsx`'s two
components are already fully generic (not RunPage-specific despite the
filename) — wiring the same `ShortcutEntry[]`-driven footer hint + "?"
overlay into `FolderExplorerPage.tsx` costs nothing new and matches how
`RunPage.tsx` already solves the identical discoverability problem for its
own keyboard-only interactions, rather than adding a Library-specific
tooltip or leaving the gesture entirely undiscoverable.

## Risks / Trade-offs
- **Selection not preserved across navigation**: a user who selects cases,
  then navigates to a different section, loses the selection silently
  (no warning dialog) — matches `RunPage.tsx`'s own bulk-select behavior
  precedent, not a new gap.
