## 1. Shared assign primitives

- [x] 1.1 Write failing tests for `assignRunItems(itemIds, assignee)` (`apps/web/src/lib/assignRunItems.test.ts`): calls `PUT /items/{itemId}/status` with `{ assignee }` once per id, resolves after all complete, works for a single id the same as many
- [x] 1.2 Implement `assignRunItems` in `apps/web/src/lib/assignRunItems.ts` to pass those tests
- [x] 1.3 Write failing tests for `AssignDialog` (`apps/web/src/components/AssignDialog.test.tsx`): renders a text field, lists `suggestions` as datalist options, calls `onAssign(value)` on submit, is prefilled with the item's current assignee when provided
- [x] 1.4 Implement `AssignDialog` in `apps/web/src/components/AssignDialog.tsx` to pass those tests

## 2. Run board: assignee display, assign control, filter

- [x] 2.1 Write a failing `RunPage.test.tsx` test: a row shows its assignee, or "Unassigned" when none
- [x] 2.2 Write a failing test: the row menu's "Assign to…" opens `AssignDialog` prefilled with the item's assignee and suggesting other assignees already used in the run
- [x] 2.3 Write a failing test: submitting the dialog calls the assign endpoint for that item and updates the row without a full reload
- [x] 2.4 Write a failing test: the assignee filter renders one chip per distinct assignee present, plus "Unassigned" and "All"
- [x] 2.5 Write a failing test: selecting an assignee chip narrows the list to that assignee; selecting "Unassigned" narrows to items with no assignee
- [x] 2.6 Write a failing test: an active assignee filter composes with an active status filter (both must match)
- [x] 2.7 Implement 2.1–2.6 in `RunPage.tsx` (assignee shown on `RunItemRow`, wired `AssignDialog`, client-side assignee filter state alongside the existing status filter)

## 3. Run board: multi-select and bulk assignment

- [x] 3.1 Write a failing test: checking a row's checkbox shows a bulk action bar with the selection count
- [x] 3.2 Write a failing test: "select all" selects every currently visible (filtered) item, not items hidden by the active filter
- [x] 3.3 Write a failing test: bulk-assigning from the action bar calls `assignRunItems` with every selected item's id and clears the selection on success
- [x] 3.4 Implement `RunBulkActionBar` (`apps/web/src/components/RunBulkActionBar.tsx`) as a generic "selection count + actions" bar, no assignment-specific logic baked in
- [x] 3.5 Wire selection state (`selectedIds: Set<string>`), row checkboxes, "select all", and the bulk "Assign to…" action into `RunPage.tsx`, passing `RunBulkActionBar` only the assign action for now

## 4. Run creation: default assignee

- [x] 4.1 Write a failing `NewRunPage.test.tsx` test: entering a default assignee and creating the run calls `assignRunItems` with every created item's id and that assignee, after the create call resolves
- [x] 4.2 Write a failing test: leaving the default assignee empty creates the run without any assign calls, unchanged from today
- [x] 4.3 Implement the default-assignee field and post-creation assign call in `NewRunPage.tsx`

## 5. End-to-end coverage

- [x] 5.1 Add an e2e scenario to `apps/web/e2e/test-execution.spec.ts` under "Requirement: Run item assignment": assign an item from the board, then filter by that assignee and by "Unassigned"
- [x] 5.2 Add an e2e scenario for bulk-assigning two selected items in one action
- [x] 5.3 Add an e2e scenario for creating a run with a default assignee and confirming every item is pre-assigned

## 6. Docs and Sample Project

- [x] 6.1 Update `docs/test-management.md`'s run execution board section with the assign control, assignee filter (including Unassigned), bulk assignment, and default assignee at creation
- [x] 6.2 Update `apps/api/internal/sampledata/seed.go` to assign a few items in an existing seeded run (leaving others unassigned) so the board's assignee display, filter, and Unassigned state all have something real to show; add/update a `seed_test.go` check for it

## 7. Spec sync

- [x] 7.1 Sync the `test-execution` delta spec in this change into `openspec/specs/test-execution/spec.md`
