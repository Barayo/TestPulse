## 1. Frontend: bulk verdict helper (TDD)

- [x] 1.1 Write a failing test for a new `apps/web/src/lib/recordBulkVerdict.ts` (`recordBulkVerdict.test.ts`): given a list of item ids and a verdict, calls `POST /api/v1/items/{itemId}/results` with `{ verdict }` once per item, mirroring `assignRunItems.ts`'s `Promise.all` shape
- [x] 1.2 Implement `recordBulkVerdict` to pass 1.1

## 2. Frontend: wire into the run board (TDD)

- [x] 2.1 Write failing `RunPage.test.tsx` assertions: on an open run, selecting items shows four bulk verdict actions in the bulk action bar (Mark Pass/Failed/Blocked/Skipped), each labeled with the current selection count; clicking one calls `recordBulkVerdict` with the selected ids and that verdict, then the board reflects the updated statuses and the selection clears
- [x] 2.2 Write a failing test: on a closed run, the bulk action bar shows only "Assign selected…", no verdict actions
- [x] 2.3 Implement the four bulk verdict actions in `RunPage.tsx`'s `RunBulkActionBar` `actions` array, conditionally spread in when `!isClosed` (same pattern `RunItemDetailPage.tsx` already uses for Retest), to pass 2.1–2.2

## 2b. Redesign: collapse verdicts into a "Mark as ▾" dropdown (TDD)

Section 2 shipped as four flat outline buttons; rejected on review (mocked
via three options, Fable-5-assisted critique — see design.md) for lacking
visual hierarchy with `Assign selected…`, ignoring the app's existing
status-color language, and repeating the selection count five times in
one row. Replaced with a single dropdown before this change was
considered done.

- [x] 2b.1 Write a failing test: `RowActionMenu` accepts an optional `trigger` prop rendering custom content in place of the default "⋯" icon, while keeping the same menu/positioning/outside-click/Escape behavior
- [x] 2b.2 Implement the `trigger` prop on `RowActionMenu`
- [x] 2b.3 Export `dotClass` from `StatusBadge.tsx` so other components can render the same status-color dot
- [x] 2b.4 Write failing tests for `RunBulkActionBar.tsx` (new `RunBulkActionBar.test.tsx`): a `menu`-kind `BulkAction` renders via `RowActionMenu` using the given `trigger`/`items`, alongside existing `button`-kind actions
- [x] 2b.5 Implement the `menu` kind on `RunBulkActionBar`'s `BulkAction` discriminated union, to pass 2b.4
- [x] 2b.6 Update `RunPage.tsx`'s bulk verdict wiring to a single "Mark as" `menu` action with four `dotClass`-colored items (Pass/Failed/Blocked/Skipped, no count in the label), replacing the four flat buttons; update `RunPage.test.tsx`'s bulk-verdict tests and the e2e scenario to open the dropdown and pick a verdict instead of clicking a labeled button directly
- [x] 2b.7 Confirm green: unit tests, typecheck, e2e

## 2c. Right-click a row while a multi-selection is active (TDD)

Added after 2b, per user request ("ask Pepe to work on the right click
with multiselect") — mocked via three states (Fable-5-assisted, see
design.md) before building: no selection, unchecked-row right-click
during a selection, checked-row right-click during a selection.

- [x] 2c.1 Write failing `RunPage.test.tsx` assertions: opening the row menu on a *checked* row while more than one item is selected shows the bulk menu (`Assign N selected…`, divider, then the same Pass/Failed/Blocked/Skipped items as the bulk bar) instead of `Open execution`/`Go to case in Library`/`Assign to…`
- [x] 2c.2 Write a failing test: opening the row menu on an *unchecked* row, while others remain selected, still shows the single-item menu and leaves the selection count/checkboxes unchanged
- [x] 2c.3 Write a failing test: picking a verdict from a checked row's bulk menu records it for every selected item (not just that row)
- [x] 2c.4 Write a failing test: picking "Assign N selected…" from a checked row's bulk menu opens `AssignDialog` scoped to the whole selection
- [x] 2c.5 Write a failing test: the bulk row menu offers no verdict items on a closed run, matching the bulk bar's own gating
- [x] 2c.6 Implement in `RunPage.tsx`: `RunItemRow` gains `selectedCount`, `onAssignSelected`, and `bulkVerdictItems` props; its `menuItems` become `isBulkContext = selected && selectedCount > 1` ? bulk items : today's single-item items. Extract `verdictMenuItems` once in `RunPage` (used by both the bulk bar's "Mark as" dropdown and every row's bulk menu, so both stay in sync automatically) and a shared `handleAssignSelected`, passed down to both call sites of `RunItemRow`
- [x] 2c.7 Add two e2e scenarios to `apps/web/e2e/test-execution.spec.ts`: real right-click (`row.click({ button: 'right' })`) on a checked row shows and can act on the bulk menu; right-click on an unchecked row during an active selection leaves the selection alone
- [x] 2c.8 Confirm green: unit tests, typecheck, e2e; manual check against the compose stack (both states)

## 3. End-to-end coverage

- [x] 3.1 Add an e2e scenario to `apps/web/e2e/test-execution.spec.ts`: select several items on an open run's board, click a bulk verdict action, confirm every selected item's status updates and the History/status reflects it after reload

## 4. Sample Project showcase (CLAUDE.md standing rule)

- [x] 4.1 This change adds an *action*, not new persistent content — there's nothing distinct to seed (the Sample Project's existing mixed-status items already demonstrate a realistic board to try bulk actions against). Judgment call: no seed.go change needed, unlike #100/#103 which added new assignable identities. Confirm this reasoning holds at implementation time rather than skipping the check silently. Confirmed: Sample Project's "Sprint 12 execution" run already has pass/failed/pending items and multiple cases to select from.

## 5. Docs and spec sync

- [x] 5.1 Update `docs/test-management.md`'s run-board section: bulk verdict actions alongside the existing bulk assignment description
- [x] 5.2 Sync the `test-execution` delta spec in this change into `openspec/specs/test-execution/spec.md`

## 6. Verification

- [x] 6.1 `npm run typecheck`, `npx vitest run` (web coverage ≥80%), full e2e suite green
- [x] 6.2 Manual check against the compose stack: select a mix of items on an open run, bulk-mark them Failed, confirm History shows one entry per item; confirm the actions disappear on a closed run
