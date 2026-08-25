## Context

`RunPage.tsx`'s `RunItemRow` computes its right-click/⋯ menu items
(`menuItems`, lines 80-105) with a hard branch on `isBulkContext`
(`selected && selectedCount > 1`, line 79):

- **Bulk context**: "Assign N selected…" (if `canRecord`) followed by
  `bulkVerdictItems` (verdict items with a `dividerBefore` on the first) —
  passed down as `verdictMenuItems`, built once per render at the parent
  level (lines 490-497): when `run?.status === 'open' && canRecord`, maps
  `['pass','failed','blocked','skipped']` to `RowActionMenuItem`s using
  `STATUS_LABEL` and a colored-dot icon, each calling
  `handleBulkVerdict(verdict)` (line 413) — which always acts on the full
  `selectedIds` set via `recordBulkVerdict(Array.from(selectedIds),
  verdict)`.
- **Single-row context** (the common case): "Open execution", "Go to case
  in Library", and (if `canRecord`) "Assign to…" only — no status-change
  action at all.

A third status-changing action, **Retest**, exists today only on
`RunItemDetailPage.tsx` (`markRetest`, lines 346-356): shown only when
`currentStatus === 'failed'`, calls `PUT /items/{itemId}/status` with
`{status: 'retest'}` — a direct status set, not a recorded verdict,
reachable nowhere else in the UI.

A visual design pass (Pepe) already validated the menu's item
ordering/grouping/icon choices against a live mockup; this design covers
the remaining technical decisions.

## Goals / Non-Goals

**Goals:**
- A single, unselected row's right-click menu can record a verdict or
  (when applicable) retest, without navigating away.
- Reuse the existing verdict-recording and retest code paths exactly —
  no new backend behavior, no new result-recording semantics.

**Non-Goals:**
- Comment/attachment/actor-override input from the context menu — that
  remains exclusive to the full `RunItemDetailPage` form, matching how the
  bulk "Mark as" menu also skips them.
- Changing the bulk-context menu's own behavior — untouched.

## Decisions

### D1 — Parameterize verdict-recording by a single item id, reusing `recordBulkVerdict`

`recordBulkVerdict(itemIds: string[], verdict: Verdict)` already generalizes
to a single item (`recordBulkVerdict([itemId], verdict)`) — no new
result-recording function needed. A new handler,
`handleItemVerdict(itemId, verdict)`, calls it and then `await load()`,
mirroring `handleBulkVerdict`'s own shape (record → refetch) exactly. A
sibling item-scoped builder (name TBD during implementation, e.g.
`verdictMenuItemsFor(itemId)`) replaces the single hard-coded
`handleBulkVerdict(verdict)` call in `verdictMenuItems` with a call
parameterized by the row's own id, reusing the same `STATUS_LABEL`/dot-icon
construction.

### D2 — Add a new `handleRetest(itemId)` handler on the board, mirroring `RunItemDetailPage`'s `markRetest`

No existing board-level handler calls `PUT /items/{itemId}/status`. A new
`handleRetest(itemId)` is added to `RunPage.tsx`: same request shape as
`markRetest`, followed by `await load()` (the board already has a full
refetch path, unlike `RunItemDetailPage`'s narrower single-item patch) —
simpler than porting `markRetest`'s manual single-item state patch.

### D3 — Menu construction: flat items, not a submenu

`RowActionMenuItem` (as used by `RowActionMenu`) has no submenu concept —
unlike `RunBulkActionBar`'s separate `{kind: 'menu', label: 'Mark as',
items}` construct, which is a different component. The single-row menu's
new items are spliced flat into the existing array, matching exactly how
the bulk-context branch already splices `bulkVerdictItems` in (line 91):
existing three items unchanged and first → divider → four verdicts (same
icons/order as the bulk menu) → divider → Retest (rotate icon, only when
`item.currentStatus === 'failed'`).

### D4 — Gating stays identical to every other status control

Verdict items: computed only when `run?.status === 'open' && canRecord`
(same condition already gating `verdictMenuItems` and the bulk "Mark as").
Retest item: same condition, further narrowed by
`item.currentStatus === 'failed'`. Both hidden (item simply omitted),
never rendered-disabled — consistent with `canRecord`'s existing
hide-vs-disable convention throughout this page.

## Risks / Trade-offs

- [`verdictMenuItemsFor(itemId)` is built inline per row rather than
  memoized] → the row list is already re-rendered on every `load()`
  refetch and is not large enough (bounded by a run's item count, already
  paginated/filtered) to warrant memoization; matches the existing
  `menuItems` computation, which is also unmemoized per row.
- [Adding items to an already-dense context menu] → ordering (existing
  items first, verdicts and Retest below dividers, hidden not disabled)
  keeps the common path (Open execution) unchanged and first; validated
  visually via Pepe's mockup before this design was written.

## Migration Plan

Frontend-only change, no API/schema/migration. No feature flag — ships
directly once implemented and tested.
