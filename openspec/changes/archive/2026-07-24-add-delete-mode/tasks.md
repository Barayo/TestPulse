## 0. Prerequisites

- [x] 0.1 Confirm `add-project-rbac` is implemented and archived (needed for `caseDelete`/`sectionDelete` permission flags, `requirePermission` middleware, and the D12 confirmation-dialog component). Do not start section 3+ before this lands.

## 1. Database

- [x] 1.1 Write a failing DB integration test asserting `test_case_folders` has a `deleted boolean NOT NULL DEFAULT false` column and that a deleted folder is excluded by a `WHERE NOT deleted` filtered listing index.
- [x] 1.2 Amend `00002_core_domain.sql` in place: add the `deleted` column to `test_case_folders`, and update `test_case_folders_project_idx`/`test_case_folders_parent_idx` to `WHERE NOT deleted`. Update the `-- +goose Down` block. Make the test from 1.1 pass.

## 2. Go store: cascading soft delete

- [x] 2.1 Write failing store-layer tests for `FolderRepo.Delete`: deleting a folder with cases soft-deletes those cases; deleting a folder with nested subfolders soft-deletes the entire subtree (folders and cases); deleting the root folder still returns the existing root-not-deletable error; deleted folders are excluded from `List`.
- [x] 2.2 Replace the reparent-then-hard-delete body of `Delete` with a `WITH RECURSIVE` query collecting the target folder's subtree IDs, then soft-delete (`UPDATE ... SET deleted = true`) every folder and every case in that set, in one transaction. Make the tests from 2.1 pass.
- [x] 2.3 Update `store.go`/`store_test.go` and any other store callers that assumed reparent-on-delete semantics.

## 3. Go service & server: permission-gated delete

- [x] 3.1 Write failing service/handler tests: deleting a case or folder without `caseDelete`/`sectionDelete` permission is rejected (`requirePermission`); with permission, it succeeds and returns the count of cases/folders removed (for the confirmation dialog's pre-check).
- [x] 3.2 Add/update the folder and case delete routes to enforce `requirePermission(caseDelete | sectionDelete, resolver)` and to return the subtree case/folder counts on delete (or via a pre-delete "preview" endpoint/query param, per whichever `add-project-rbac`'s route conventions favor — check its handlers before deciding). Make the tests from 3.1 pass.

## 4. API contract

- [x] 4.1 Update `packages/shared/openapi.yaml` for the case/folder delete routes' permission requirements and any new response/preview fields (subtree counts) needed by the confirmation dialog.
- [x] 4.2 Run `make generate`; verify no drift in `packages/shared/src/api.ts`.

## 5. Frontend: delete mode toggle

- [x] 5.1 Write failing component tests: delete mode toggle is absent without `caseDelete`/`sectionDelete` permission; present but off by default with permission; toggling it reveals delete controls on rows; toggling off hides them again.
- [x] 5.2 Add the delete-mode toggle to `FolderExplorerPage.tsx`, gated on the actor's effective permissions (consuming whatever permission-check hook/context `add-project-rbac`'s frontend work introduces). Make the tests from 5.1 pass.

## 6. Frontend: confirmation dialog and delete actions

- [x] 6.1 Write failing component tests: deleting a case shows a confirmation naming the case; deleting a folder shows a confirmation stating its subtree's case/subfolder counts; canceling either makes no API call and leaves the UI unchanged; confirming calls the delete endpoint and removes the row from view.
- [x] 6.2 Wire delete buttons in `FolderTree.tsx`/`FolderExplorerPage.tsx` and `CaseDrawer.tsx` to open `add-project-rbac`'s D12 confirmation dialog component with case-specific copy, reusing it rather than building a new dialog. Make the tests from 6.1 pass.
- [x] 6.3 Run `make test-web` and `make coverage-web`.

## 7. E2E

- [x] 7.1 Add a `ui-navigation.spec.ts` (or new `delete-mode.spec.ts`) scenario per the added/modified `test-authoring` requirements: delete mode hidden without permission, toggle reveals actions, folder delete removes its subtree, cancel leaves state unchanged.
- [x] 7.2 Run `make e2e` (headless) and confirm the new scenarios pass.

## 8. Specs & docs

- [x] 8.1 Run `/opsx:sync` (or `openspec-sync-specs`) to merge this change's `test-authoring` delta into `openspec/specs/`.
- [x] 8.2 Update `docs/test-management.md` (delete mode, cascade semantics), `docs/database.md` (new `deleted` column on folders), and `docs/api.md` (permission requirements, any new response fields) to match.

## 9. Sample Project showcase (CLAUDE.md standing rule)

- [x] 9.1 Confirm the Sample Project (`apps/api/internal/sampledata/seed.go`) already has a folder with real nested subfolders and cases (e.g. Authentication's structure) so delete mode's cascade confirmation (subtree case/subfolder counts) has something non-trivial to show the first time someone tries it. Do not seed an actual deletion here — deleting seed content would only impoverish the showroom; the showcase is realistic structure to *try* the feature on, not a pre-deleted end state.
- [x] 9.2 If the existing structure isn't nested/rich enough for a meaningful cascade-count demo, add one small subfolder to make it so, with a corresponding assertion in `seed_test.go`.

## 10. Final verification

- [x] 10.1 Run `make lint`, `make test`, `make coverage-api`, `make coverage-web` and confirm all gates pass before archiving this change.
