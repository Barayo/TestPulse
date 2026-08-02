## Why

As a tester triaging a large run, when I've already verified a batch of
items are fine (or known out of scope this cycle), I want to record one
verdict against all of them at once, so I don't have to open each item
individually just to click the same button repeatedly. #100 shipped
multi-select and bulk *assignment* on the run board; #83's remaining
scope — bulk *status* verdicts — was deliberately split out at the time
so it wouldn't gate the assignment UI. This change closes that gap.

## What Changes

- Adds a **Mark as ▾** dropdown to the run board's existing bulk action
  bar (`RunBulkActionBar`), listing all four verdicts (Pass, Failed,
  Blocked, Skipped) as dot-colored menu items — built on `RowActionMenu`,
  the dropdown component already used for per-row actions elsewhere on
  the board — alongside the current **Assign selected…** button. Reuses
  the multi-select infrastructure (checkboxes, select-all scoped to the
  active filter, `selectedIds` state) `#100` already built, not
  rebuilding it.
- Each bulk verdict writes one result-log entry per selected item (one
  `POST /api/v1/items/{itemId}/results` call per item, the same
  `Promise.all` fan-out `assignRunItems.ts` already uses for bulk
  assignment) — preserving the existing append-only audit-trail
  guarantee; a bulk verdict is indistinguishable in history from that
  many individual recordings.
- Bulk verdict actions are only available on open runs, matching the
  existing per-item verdict controls, and require the same
  `runRecordResult` permission.
- No comment or actor-override field for a bulk verdict — those stay
  per-item, individual-recording-only affordances (see design.md).
- Right-clicking (or opening the row "⋯" menu on) a row that's part of
  an active multi-selection now shows the same bulk actions as the
  visible bar (Assign N selected…, Pass/Failed/Blocked/Skipped) instead
  of that row's ordinary single-item menu — matching how file managers
  and list UIs (Finder, Linear, GitHub) treat a right-click on a
  selected item. Right-clicking a row that is *not* part of the
  selection is unaffected: it still shows the single-item menu, and the
  checkbox selection itself is never changed by a right-click.

## Capabilities

### New Capabilities

(none — this extends existing run-execution behavior)

### Modified Capabilities

- `test-execution`: "Run execution board" gains bulk verdict actions in
  the bulk action bar and selection-aware right-click behavior;
  "Append-only result log" gains a scenario confirming a bulk verdict
  produces one log entry per item, not a single batch record.

## Impact

- Affected code: `apps/web/src/components/RunBulkActionBar.tsx` (new
  `menu`-kind bulk action, rendered via `RowActionMenu`),
  `apps/web/src/components/RowActionMenu.tsx` (new optional `trigger`
  prop for a labeled dropdown trigger, alongside its existing default
  "⋯" icon), `apps/web/src/components/StatusBadge.tsx` (exports
  `dotClass` for reuse), `apps/web/src/pages/RunPage.tsx` (bulk verdict
  handler, wired the same way bulk assignment already is), a new
  `apps/web/src/lib/recordBulkVerdict.ts` (mirroring `assignRunItems.ts`'s
  shape) — no backend/API changes, since bulk verdict recording is just
  N calls to the existing `POST /api/v1/items/{itemId}/results` endpoint.
  `RunPage.tsx`'s `RunItemRow` also gains selection-aware `items` for its
  existing `RowActionMenu`, reusing the same `verdictMenuItems` the bulk
  bar's dropdown already builds.
- Closes GitHub #83.
