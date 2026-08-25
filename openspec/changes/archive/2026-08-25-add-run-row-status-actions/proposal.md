## Why

As a tester triaging a run, when I right-click a single test case row on the
run execution board, I want to change its status directly from that menu —
mark it pass/failed/blocked/skipped, or retest a failed one — so I don't
have to open the item's own page for a quick status change I can already do
in bulk for multiple selected rows (GH issue #138).

## What Changes

- The single-row context menu (shown when right-clicking a row that is
  *not* part of an active multi-selection) gains the same four verdict
  items the multi-selection menu already has — Pass, Failed, Blocked,
  Skipped — below a divider after the existing "Open execution" / "Go to
  case in Library" / "Assign to…" items. Same icons/labels as the
  multi-selection menu, calling the same single-item result-recording
  endpoint.
- The single-row menu additionally gains **Retest**, shown only when that
  row's current status is `failed` (matching the existing Retest button on
  the item's own detail page), below a second divider, with a rotate icon
  rather than a verdict dot — it changes status directly
  (`PUT /items/{id}/status`), not a recorded verdict
  (`POST /items/{id}/results`).
- Both additions follow the exact gating already used for every other
  status-changing control on the board: visible only when the run is open
  and the caller holds `runRecordResult` — hidden, not disabled, when
  either condition fails.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `test-execution`: the "Run execution board" requirement's right-click
  behavior is extended — the single-item context menu (today: navigation
  and assignment only) also offers verdict-recording and, conditionally,
  Retest.

## Impact

- **Frontend only** — no backend or API changes. `apps/web/src/pages/RunPage.tsx`:
  `RunItemRow`'s single-item `menuItems` branch gains verdict items sourced
  from a per-item (not per-selection) builder, and a conditional Retest
  item. `verdictMenuItems`/`handleBulkVerdict` today always target the full
  `selectedIds` set; a single-item variant is needed to serve an unselected
  row. `recordBulkVerdict([itemId], verdict)` already generalizes cleanly
  to a single item, so no new result-recording code path is needed for the
  four verdicts — only a new handler for Retest (mirroring
  `RunItemDetailPage.tsx`'s existing `markRetest`) and a data refresh after
  either action (mirroring `handleBulkVerdict`'s `await load()`).
- **Docs**: `docs/test-management.md`'s run execution board section (right-click
  behavior) needs a sentence describing the extended single-row menu.
- **Sample Project**: the Sample Project already has an open run with a
  mix of item statuses, including at least one `failed` item (needed to
  showcase Retest) — confirm during design/implementation rather than
  assume.
