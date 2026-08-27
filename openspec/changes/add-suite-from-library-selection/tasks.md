## 1. Frontend: folder-to-cases resolution helper (TDD)

- [x] 1.1 Test + `apps/web/src/lib/resolveSuiteCaseKeys.ts`: given selected folder ids, selected case keys, the full folder list, and the full case list, return the deduplicated union of directly-selected case keys and every case (at any depth) inside every selected folder's subtree — reuses `subtreeIds(folders, folderId)` from `add-library-folder-selection` (design.md D7)
- [x] 1.2 Test + a case that's both directly selected and inside a selected folder's subtree is only counted/included once
- [x] 1.3 Test + two selected folders with an ancestor/descendant relationship don't double-count their overlapping cases
- [x] 1.4 Test + recursion covers nested subfolders at any depth, not just direct children

## 2. Frontend: suite-from-cases orchestration helper (TDD)

- [x] 2.1 Test + `apps/web/src/lib/createSuiteFromCases.ts`: `POST /projects/{projectKey}/suites` then `Promise.all` over `PUT /suites/{suiteKey}/cases/{caseKey}` for each resolved case key, returning the created suite (design.md D5) — mirrors `bulkMoveCases.ts`/`bulkDeleteCases.ts`'s shape

## 3. Frontend: footer bar action (TDD)

- [x] 3.1 Test + `FolderExplorerPage.tsx`: compute the resolved case count via `resolveSuiteCaseKeys` and pass a new `BulkAction` (`kind: 'button'`) to `LibraryBulkActionBar` labeled `` `Create suite from ${n} case${n === 1 ? '' : 's'}…` `` (design.md D2/D3)
- [x] 3.2 Test + the action is omitted entirely when the resolved case count is 0 (e.g. only empty folders selected) — design.md D2's hide rule
- [x] 3.3 Test + the action is omitted when `permissions?.suiteCreate` is falsy
- [x] 3.4 Test + placement in the action cluster is Move to… → Create suite from N cases… → Delete → Clear

## 4. Frontend: create-suite dialog (TDD)

- [x] 4.1 Test + a new dialog (in `FolderExplorerPage.tsx`, alongside the existing bulk-move/bulk-delete dialogs) with title "New suite from selection", a description stating `{n} case{s} from your selection will become this suite's members` (same resolved `n` as the footer button), a "Suite name" field (placeholder "Smoke"), Cancel/`Create suite` footer — `Create suite` disabled until the name is non-empty, Enter-to-submit (design.md D1/D3)
- [x] 4.2 Test + confirming calls `createSuiteFromCases` with the resolved case keys (from `resolveSuiteCaseKeys`, not the raw selection), clears the Library selection, and navigates to `/projects/{projectKey}/suites/{created.key}`
- [x] 4.3 Test + selecting a folder pulls in every case in its subtree, recursively, into the created suite's membership
- [x] 4.4 Test + a mixed folder+case selection unions both without duplicating overlap
- [x] 4.5 Test + cancelling or dismissing the dialog leaves the Library selection unchanged and creates no suite

## 5. Regression safety

- [x] 5.1 Full web test suite green, typecheck clean, lint clean
- [x] 5.2 Confirm every pre-existing `FolderExplorerPage.test.tsx` bulk-select test (Move to…/Delete/Clear, case-only and mixed) still passes unmodified
- [x] 5.3 Web coverage gate (≥80% all metrics)
- [x] 5.4 `openspec validate --all --strict`

## 6. Docs

- [x] 6.1 Update `docs/test-management.md`'s Library bulk-selection section with the new "Create suite from N cases…" action, including that selecting a folder recursively includes every case in its subtree

## 7. Sample Project showcase

- [x] 7.1 Evaluate `seed.go`: does the existing section tree give a meaningful "select a section (or a section plus a few extra cases) and turn it into a suite" demo moment, showing the recursive folder-inclusion behavior, or does it need a small addition/reordering to make that moment obvious when browsing the Sample Project? — **No addition needed.** "Authentication" already has ~10 direct cases plus a nested "Two-Factor" subsection with its own case (`rework-library-ux`/`add-delete-mode` showcase work), so selecting "Authentication" (or it plus a couple of extra cases from elsewhere) already exercises real recursive resolution, not a toy example.

## 8. Validation

- [x] 8.1 `make lint` / web coverage gate green — oxlint clean (0 errors, pre-existing warnings only, none in touched files), `tsc --noEmit` clean, full `vitest run --coverage` 1431/1431 passing at 92%+ statements/94%+ lines/84%+ branches/90%+ functions
- [x] 8.2 Local docker-compose deploy + manual browser validation, against the Sample Project: a cases-only selection ("Create suite from 5 cases…" → dialog → confirmed → suite created with 5 members → navigated to its page); a folder selection resolving recursively through a temporarily-added nested subfolder (5 → 6 cases live, then cleaned up); an already-existing real nested case (`Checkout` under `Localization`, leftover from earlier manual testing) correctly resolved through two levels without any code change needed; a genuinely empty folder correctly hides the action entirely. All temporary test folders/cases/suites created for validation were deleted afterward, leaving the Sample Project exactly as found.
