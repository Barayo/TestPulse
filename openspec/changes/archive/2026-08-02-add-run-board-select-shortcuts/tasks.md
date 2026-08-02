## 1. Checkbox opacity treatment (TDD)

- [x] 1.1 Write a failing `RunPage.test.tsx` assertion: a row's checkbox carries a "dimmed" class/style at rest (not selected, not hovered, not the `j`/`k`-focused row), and carries the "full opacity" class/style once `selectedCount > 0`, once it's the focused row, or when directly hovered
- [x] 1.2 Write a failing assertion: the header "select all" checkbox never carries the dimmed class/style, regardless of selection state
- [x] 1.3 Implement the opacity classes on `RunItemRow`'s checkbox in `RunPage.tsx`, driven by existing `selected`, `selectedCount`, and `focused` props plus CSS `:hover` — no new state
- [x] 1.4 Confirm green; manual check against the compose stack that dimmed reads as "quiet," not "disabled," against the real row (per design.md's flagged risk) — nudge opacity from 0.4 toward ~0.5 if it looks broken. Confirmed live against the Sample Project board: reads as quiet, not disabled; no adjustment needed.

## 2. Space toggles the focused row (TDD)

- [x] 2.1 Write a failing `RunPage.test.tsx` test: with the focus cursor on an item (via `j`), pressing Space toggles that item into `selectedIds`; pressing it again toggles it back out
- [x] 2.2 Write a failing test: Space is ignored while a text input/textarea has focus (reuse `isEditableElementFocused()`), consistent with `j`/`k`/`Enter`
- [x] 2.3 Implement a `' '` case in `RunPage.tsx`'s `handleKeyDown` effect: calls `toggleSelect(displayOrder[focusedIndex].id)` guarded by the existing `isEditableElementFocused()` check, with `e.preventDefault()` so the page doesn't scroll
- [x] 2.4 Confirm green: unit tests, typecheck

## 3. Shift+click range-select (TDD)

- [x] 3.1 Write a failing test: with one item already selected, Shift-clicking a row further down `displayOrder` adds every item between the two (inclusive) to `selectedIds`, without removing the original selection
- [x] 3.2 Write a failing test: Shift-clicking a row before anything has been toggled selects just that row and does not error
- [x] 3.3 Write a failing test: after a Shift+click range-select, a subsequent plain checkbox click still works as an ordinary single toggle (union semantics don't get "stuck")
- [x] 3.4 Implement `lastToggledId` state in `RunPage.tsx` (set on every plain toggle — checkbox click, Space); implement the Shift+click handler on the row checkbox's `onClick` (capturing `e.shiftKey`) that computes the `displayOrder` slice between `lastToggledId` and the clicked item and unions it into `selectedIds`, falling back to single-select + new-anchor when there's no prior `lastToggledId`. Landed as `onClick` (tracks `shiftKey` into a ref) + `onChange` (does the actual toggle) rather than a single `onClick` handler with `preventDefault()` — a same-tick `preventDefault()` + controlled-checked update on the shift-clicked node itself hit a real React/jsdom controlled-checkbox reconciliation bug (the DOM node's `checked` silently failed to sync even though `selectedIds` state was correct), diagnosed via direct DOM inspection during TDD; switching to the standard onChange-driven pattern (no preventDefault at all) avoided it entirely.
- [x] 3.5 Confirm green: unit tests, typecheck

## 4. End-to-end coverage

- [x] 4.1 Add an e2e scenario to `apps/web/e2e/test-execution.spec.ts`: navigate with `j`, press Space to select an item, Shift-click a row further down, confirm the bulk action bar reflects the full range, then bulk-mark them and confirm every item's status updates

## 5. Sample Project showcase (CLAUDE.md standing rule)

- [x] 5.1 This change is pure interaction/visual polish on existing multi-select — no new persistent content type is introduced. Judgment call: confirm at implementation time whether the Sample Project's existing run item mix is sufficient to demonstrate Space/Shift+click, or whether a seed.go change is warranted (e.g. enough items in one run to make a range-select meaningfully demonstrable) — do not skip this check silently. Confirmed: "Sprint 12 execution" already has 4 items with mixed statuses (Pass/Failed/Pass/Pending), enough to demonstrate both gestures. No seed.go change needed, same judgment call as `add-bulk-status-verdicts`.

## 6. Docs and spec sync

- [x] 6.1 Update `docs/test-management.md`'s run-board section: describe the checkbox's resting/active opacity states and the Space/Shift+click shortcuts alongside the existing keyboard-navigation and bulk-action documentation
- [x] 6.2 Sync the `test-execution` delta spec in this change into `openspec/specs/test-execution/spec.md`

## 7. Verification

- [x] 7.1 `npx tsc -b --force`, `npx vitest run` (web coverage ≥80% on all four metrics), full e2e suite green. Typecheck clean; 67/67 RunPage tests pass, full web suite coverage Statements 92.03%/Branches 83.18%/Functions 90.32%/Lines 94.82%; full e2e suite 90/90 passing (rebuilt compose stack).
- [x] 7.2 Manual check against the compose stack (rebuilt): verify the three opacity states visually match the approved mock, Space toggles the focused row, Shift+click extends a range without clearing the existing selection, and a Shift+click range survives a "Group by status" toggle without producing a stale/surprising range on the next Shift+click (design.md's named risk). Verified live: dimmed-at-rest and hover-to-full-opacity confirmed via screenshot against the Sample Project board; Space/Shift+click behavior and the Group-by-status survival case confirmed via a one-off Playwright check against the same running instance (chrome-extension coordinate clicks proved unreliable for firing React state updates on checkboxes in this session, consistent with prior sessions' notes — Playwright against the real compose stack was used instead as the authoritative live check).
