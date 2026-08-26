## 1. Bulk-action helpers (TDD: failing test first)

- [x] 1.1 Test + implement `apps/web/src/lib/bulkMoveCases.ts`: `Promise.all` over `PUT /cases/{key}/folder` for each key, matching `recordBulkVerdict.ts`'s shape
- [x] 1.2 Test + implement `apps/web/src/lib/bulkDeleteCases.ts`: `Promise.all` over `DELETE /cases/{key}`

## 2. Selection model in `FolderExplorerPage.tsx` (TDD)

- [x] 2.1 Test + add `selected: Set<string>` and `lastToggledKey: string | null` state; `toggleSelect(key)` implementing D1's anchor/range semantics over `orderedVisibleCases` (`searchEntireLibrary ? entireLibraryMatches : visibleHere`)
- [x] 2.2 Test + wire `CaseRow`'s title click: plain click still opens the case; Shift+Click calls `toggleSelect` and does not navigate (found `userEvent.click()` in this project's installed version takes no modifier options — tests use `fireEvent.click(el, { shiftKey: true })` instead)
- [x] 2.3 Test + render a selected row with a `bg-primary/10` tint, distinct from the existing hover highlight
- [x] 2.4 Confirm folder rows are never selectable and unaffected (regression guard)

## 3. Keyboard navigation (TDD)

- [x] 3.1 Test + add `focusedIndex` state and a keydown listener (guarded by `isEditableElementFocused()`): arrow keys/j-k move focus through the case-only list, clamped. Found and fixed a real bug along the way: all derived selection state/effects were textually placed after the component's early-return guards, so the hook count differed between the "not found"/loading render path and the normal path — a hooks-rule crash. Fixed by moving that whole block (and the early returns) so every hook runs unconditionally on every render.
- [x] 3.2 Test + real `scrollIntoView({ block: 'nearest' })` via a `Map<string, HTMLLIElement>` ref collection keyed by case key (added a global `Element.prototype.scrollIntoView` stub to the test file's top-level `beforeEach` — jsdom has no implementation at all, and the effect now fires on every render across the whole suite, not just the new tests)
- [x] 3.3 Test + Space toggles the focused row (first-toggle semantics); Shift+Space extends the range from the anchor — required bringing back an explicit `shiftKey` parameter on `toggleSelect` (mirroring `RunPage.tsx`'s own signature) rather than the shift-always-implied version from task 2, since Space and Shift+Space now need to select the same function's two different behaviors
- [x] 3.4 Test + Enter opens the focused case
- [x] 3.5 Test + reset `focusedIndex` when the visible case list changes (filter narrowing the list, verified via a priority filter)

## 4. Footer bar (TDD)

- [x] 4.1 Test + build `LibraryBulkActionBar.tsx`: count, "Select all {N}" (hidden once fully selected), Move to…/Delete/Clear, `fixed inset-x-4 bottom-4 z-50 … shadow-lg ring-1 ring-foreground/10` styling (D5), importing `BulkAction` from `RunBulkActionBar.tsx`
- [x] 4.2 Test + wire "Select all" to select every case in the current ordered list
- [x] 4.3 Test + wire "Clear" to empty the selection (and the bar disappears)

## 5. Bulk Move/Delete dialogs (TDD)

- [x] 5.1 Test + add `bulkMoveKeys: string[] | null` + `bulkMoveQuery` state and a new Dialog reusing `FolderPicker`, calling `bulkMoveCases` on confirm, then clearing selection + reloading
- [x] 5.2 Test + extend `DeleteTarget` with `{ kind: 'bulk'; keys: string[] }`, handled in the existing delete dialog and `confirmDelete()`, calling `bulkDeleteCases`
- [x] 5.3 Test: bulk delete confirmation names the exact count (fixed an ambiguous-match test bug along the way — the dialog title and description both contain "Delete 3 cases", so the assertion needed to scope to the heading role)
- [x] 5.4 Confirm the existing single-case move/delete dialogs and their tests are untouched (regression guard — full suite green throughout)

## 6. Discoverability

- [x] 6.1 Wire `RunShortcutsHint`/`RunShortcutsOverlay` (`RunShortcuts.tsx`, already generic) into `FolderExplorerPage.tsx` with the Library's own `ShortcutEntry[]` (arrows/j-k, Space, Shift+Space, Enter)

## 7. Wiring and regression safety

- [x] 7.1 Full web suite green (1369/1369), typecheck clean (`npm run typecheck`), lint clean (no new warnings)
- [x] 7.2 Confirmed `RunPage.tsx`'s own selection/keyboard-nav code is untouched (`git status` shows no diff)

## 8. Docs

- [x] 8.1 Added a paragraph to `docs/test-management.md`'s "The library" section describing Shift+Click/keyboard selection and the bulk Move to…/Delete footer bar

## 9. Validation

- [x] 9.1 `make lint` clean, web coverage gate 92.11%/84.48%/89.97%/94.53% — all ≥80%
- [x] 9.2 `act pull_request -j web` — contract-types-current, lint, typecheck, 1369/1369 tests, build all green
- [x] 9.3 Local docker-compose deploy + manual browser validation against the Sample Project's real multi-case sections: Shift+Click range-select (first click selects one row + anchor, second extends the range, footer bar appears with correct count), keyboard nav (j/j moves focus with a visible ring, Space selects the focused row), bulk "Move to…" (5 cases moved from Authentication to Notifications in one action, counts updated live, dialog closed, selection cleared) — all confirmed working against real data, not just mocks
