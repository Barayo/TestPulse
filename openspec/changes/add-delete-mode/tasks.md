## 0. Prerequisites

- [ ] 0.1 Confirm `add-project-rbac` is implemented and archived (needed for `caseDelete`/`sectionDelete` permission flags, `requirePermission` middleware, and the D12 confirmation-dialog component). Do not start section 3+ before this lands.
- [ ] 0.2 Confirm `rename-folders-to-sections` is implemented and archived (needed for `test_case_sections` table/domain naming this change's migration and store code build on).

## 1. Database

- [ ] 1.1 Write a failing DB integration test asserting `test_case_sections` has a `deleted boolean NOT NULL DEFAULT false` column and that a deleted section is excluded by a `WHERE NOT deleted` filtered listing index.
- [ ] 1.2 Amend `00002_core_domain.sql` (already amended once by `rename-folders-to-sections`) in place: add the `deleted` column to `test_case_sections`, and update `test_case_sections_project_idx`/`test_case_sections_parent_idx` to `WHERE NOT deleted`. Update the `-- +goose Down` block. Make the test from 1.1 pass.

## 2. Go store: cascading soft delete

- [ ] 2.1 Write failing store-layer tests for `SectionRepo.Delete` (or its renamed equivalent): deleting a section with cases soft-deletes those cases; deleting a section with nested subsections soft-deletes the entire subtree (sections and cases); deleting the root section still returns the existing root-not-deletable error; deleted sections are excluded from `List`.
- [ ] 2.2 Replace the reparent-then-hard-delete body of `Delete` with a `WITH RECURSIVE` query collecting the target section's subtree IDs, then soft-delete (`UPDATE ... SET deleted = true`) every section and every case in that set, in one transaction. Make the tests from 2.1 pass.
- [ ] 2.3 Update `store.go`/`store_test.go` and any other store callers that assumed reparent-on-delete semantics.

## 3. Go service & server: permission-gated delete

- [ ] 3.1 Write failing service/handler tests: deleting a case or section without `caseDelete`/`sectionDelete` permission is rejected (`requirePermission`); with permission, it succeeds and returns the count of cases/sections removed (for the confirmation dialog's pre-check).
- [ ] 3.2 Add/update the section and case delete routes to enforce `requirePermission(caseDelete | sectionDelete, resolver)` and to return the subtree case/section counts on delete (or via a pre-delete "preview" endpoint/query param, per whichever `add-project-rbac`'s route conventions favor — check its handlers before deciding). Make the tests from 3.1 pass.

## 4. API contract

- [ ] 4.1 Update `packages/shared/openapi.yaml` for the case/section delete routes' permission requirements and any new response/preview fields (subtree counts) needed by the confirmation dialog.
- [ ] 4.2 Run `make generate`; verify no drift in `packages/shared/src/api.ts`.

## 5. Frontend: delete mode toggle

- [ ] 5.1 Write failing component tests: delete mode toggle is absent without `caseDelete`/`sectionDelete` permission; present but off by default with permission; toggling it reveals delete controls on rows; toggling off hides them again.
- [ ] 5.2 Add the delete-mode toggle to `SectionExplorerPage.tsx` (post-rename name), gated on the actor's effective permissions (consuming whatever permission-check hook/context `add-project-rbac`'s frontend work introduces). Make the tests from 5.1 pass.

## 6. Frontend: confirmation dialog and delete actions

- [ ] 6.1 Write failing component tests: deleting a case shows a confirmation naming the case; deleting a section shows a confirmation stating its subtree's case/subsection counts; canceling either makes no API call and leaves the UI unchanged; confirming calls the delete endpoint and removes the row from view.
- [ ] 6.2 Wire delete buttons in `SectionTree.tsx`/`SectionExplorerPage.tsx` and `CaseDrawer.tsx` to open `add-project-rbac`'s D12 confirmation dialog component with case-specific copy, reusing it rather than building a new dialog. Make the tests from 6.1 pass.
- [ ] 6.3 Run `make test-web` and `make coverage-web`.

## 7. E2E

- [ ] 7.1 Add a `ui-navigation.spec.ts` (or new `delete-mode.spec.ts`) scenario per the added/modified `test-authoring` requirements: delete mode hidden without permission, toggle reveals actions, section delete removes its subtree, cancel leaves state unchanged.
- [ ] 7.2 Run `make e2e` (headless) and confirm the new scenarios pass.

## 8. Specs & docs

- [ ] 8.1 Run `/opsx:sync` (or `openspec-sync-specs`) to merge this change's `test-authoring` delta into `openspec/specs/`.
- [ ] 8.2 Update `docs/test-management.md` (delete mode, cascade semantics), `docs/database.md` (new `deleted` column on sections), and `docs/api.md` (permission requirements, any new response fields) to match.

## 9. Final verification

- [ ] 9.1 Run `make lint`, `make test`, `make coverage-api`, `make coverage-web` and confirm all gates pass before archiving this change.
