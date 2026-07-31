## 1. Shared shortcuts components

- [x] 1.1 Write failing tests for `RunShortcutsHint` (renders a persistent footer legend from a passed-in shortcut list) and `RunShortcutsOverlay` (opens on `?`, closes on `Escape` or `?`, lists the same shortcuts) in `apps/web/src/components/RunShortcuts.test.tsx`
- [x] 1.2 Implement `RunShortcutsHint` and `RunShortcutsOverlay` in `apps/web/src/components/RunShortcuts.tsx` to pass those tests
- [x] 1.3 Write a failing test for a shared `useKeyboardShortcut`-style guard helper that ignores keys while an input/textarea/contentEditable element has focus, then implement it (`apps/web/src/lib/keyboardShortcutGuard.ts`)

## 2. Run item detail page: verdict shortcuts and auto-advance

- [x] 2.1 Write a failing `RunItemDetailPage.test.tsx` test: pressing `F` on a pending item records verdict `failed` (same request as clicking the "Failed" button)
- [x] 2.2 Write a failing test: pressing `R` when the item is `failed` marks retest; pressing `R` when it isn't `failed` does nothing and the hint omits `R`
- [x] 2.3 Write a failing test: recording a verdict when a later `pending` item exists in the run navigates to that item
- [x] 2.4 Write a failing test: recording a verdict on the last remaining `pending` item navigates back to `/runs/:runKey`
- [x] 2.5 Write a failing test: pressing `j`/`k` navigates to the next/previous item in run order regardless of status
- [x] 2.6 Write a failing test: shortcut keys typed into the comment field or the actor-override field do not trigger verdicts/navigation
- [x] 2.7 Implement the above in `RunItemDetailPage.tsx`: keep the full ordered item list in state (currently discarded after finding the matching item), add the keyboard handler, auto-advance logic, and `j`/`k` navigation, guarded via the helper from 1.3
- [x] 2.8 Wire `RunShortcutsHint`/`RunShortcutsOverlay` into `RunItemDetailPage`, verify all tests from 2.1–2.6 pass

## 3. Run execution board: list navigation

- [x] 3.1 Write a failing `RunPage.test.tsx` test: `j`/`k` moves a focus cursor through the visible (filtered/grouped) item list
- [x] 3.2 Write a failing test: `Enter` on the focused item navigates to that item's page, same destination as a click
- [x] 3.3 Write a failing test: `j`/`k`/`Enter` do nothing while an unrelated input has focus
- [x] 3.4 Implement focus-cursor state and the keyboard handler in `RunPage.tsx`, guarded via the same helper, to pass 3.1–3.3
- [x] 3.5 Wire `RunShortcutsHint`/`RunShortcutsOverlay` into `RunPage`

## 4. End-to-end coverage

- [x] 4.1 Add an e2e scenario to `apps/web/e2e/test-execution.spec.ts`, titled per the "Run item detail page" requirement: recording a verdict via keyboard on one item auto-advances to the next pending item
- [x] 4.2 Add an e2e scenario for `j`/`k` navigation on the run execution board reaching and opening an item via `Enter`

## 5. Docs and Sample Project

- [x] 5.1 Update `docs/test-management.md`'s run execution section with the new keyboard shortcuts (keys, auto-advance behavior, `?` overlay)
- [x] 5.2 Verified every seeded run item always receives a verdict (`recordVerdicts` cycles verdicts over every case ID, never leaving one unexecuted) — no run had a `pending` item to demonstrate auto-advance against. Fixed by adding one more case to "Sprint 12 execution" via `AddRunItem` without recording a result for it, plus `TestSeedContentHasAPendingItemForKeyboardTriage` in `seed_test.go`

## 6. Spec sync

- [x] 6.1 Sync the `test-execution` delta spec in this change into `openspec/specs/test-execution/spec.md`
