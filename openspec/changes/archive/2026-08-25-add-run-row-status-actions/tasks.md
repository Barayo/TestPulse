## 1. Board: single-row verdict actions

- [x] 1.1 Write a failing `RunPage.test.tsx` case: right-clicking a single
      (unselected) row on an open run, with record permission, shows Pass/
      Failed/Blocked/Skipped in the context menu.
- [x] 1.2 Write a failing `RunPage.test.tsx` case: selecting "Pass" from a
      single row's context menu calls `POST /api/v1/items/{itemId}/results`
      for that item only (not the whole selection) and the row's status
      updates after refetch.
- [x] 1.3 Write a failing `RunPage.test.tsx` case: the single-row menu
      shows no verdict items when the run is closed.
- [x] 1.4 Write a failing `RunPage.test.tsx` case: the single-row menu
      shows no verdict items when the caller lacks `runRecordResult`.
- [x] 1.5 Add `handleItemVerdict(itemId, verdict)` to `RunPage.tsx`
      (`recordBulkVerdict([itemId], verdict)` then `await load()`,
      design.md D1) and a per-item verdict-menu-items builder reusing
      `STATUS_LABEL`/the existing dot-icon construction, parameterized by
      the row's id instead of the fixed `handleBulkVerdict` call. Splice
      these into `RunItemRow`'s single-item `menuItems` branch, below a
      divider after the existing three items, gated identically to
      `verdictMenuItems` (`run?.status === 'open' && canRecord`).

## 2. Board: single-row Retest action

- [x] 2.1 Write a failing `RunPage.test.tsx` case: right-clicking a single
      row whose current status is `failed`, on an open run, with
      permission, shows Retest.
- [x] 2.2 Write a failing `RunPage.test.tsx` case: right-clicking a single
      row whose current status is NOT `failed` does not show Retest,
      regardless of permission/run status.
- [x] 2.3 Write a failing `RunPage.test.tsx` case: selecting Retest calls
      `PUT /api/v1/items/{itemId}/status` with `{status: 'retest'}` for
      that item, and the row's status updates after refetch.
- [x] 2.4 Write a failing `RunPage.test.tsx` case: Retest is not shown when
      the run is closed or the caller lacks permission, even for a failed
      row.
- [x] 2.5 Add `handleRetest(itemId)` to `RunPage.tsx` (design.md D2,
      mirroring `RunItemDetailPage.tsx`'s `markRetest` request shape, then
      `await load()`). Add the conditional Retest item (rotate icon, no
      verdict dot) to the single-item menu below a second divider, gated by
      `run?.status === 'open' && canRecord && item.currentStatus === 'failed'`.

## 3. Verify menu ordering and existing behavior unchanged

- [x] 3.1 Write/extend a `RunPage.test.tsx` case confirming the existing
      three single-row items (Open execution, Go to case in Library,
      Assign to…) still appear first and unchanged when the new items are
      also present.
- [x] 3.2 Confirm (existing tests should already cover this, add a
      regression case if not) that the bulk-context menu's own items and
      behavior are completely unaffected by this change. **Confirmed**:
      full existing bulk-context test suite (RunPage.test.tsx) still
      passes unchanged.

## 4. Docs and Sample Project

- [x] 4.1 Update `docs/test-management.md`'s run execution board section
      with a sentence describing the extended single-row context menu
      (verdicts + conditional Retest).
- [x] 4.2 Confirm the Sample Project's open run(s) already include at
      least one `failed` item so the Retest option has something real to
      demonstrate; add one via `seed.go` if not, with a
      `seed_test.go` assertion. **Confirmed already sufficient** — the
      "Nightly — main" open run already has a failed item (the flaky
      checkoutValid case); added `TestSeedContentShowcasesRetestOnOpenRun`
      to lock this in as a regression guard.

## 5. Full verification

- [x] 5.1 Run `make test` (web) and `make coverage-web`; confirm coverage
      stays at/above threshold.
- [x] 5.2 Run `make lint`.
- [x] 5.3 Manually verify in a real browser (deploy locally): right-click a
      single row on an open run and confirm the full menu (existing items +
      verdicts + conditional Retest), confirm it's absent on a closed run
      and without permission, and confirm the bulk-context menu is
      unchanged. Also validated both `api` and `web` CI jobs green via
      `act pull_request` (GitHub Actions itself blocked on a billing
      issue during this change).
