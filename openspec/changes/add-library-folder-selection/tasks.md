## 1. `sectionEdit` permission plumbing (TDD where each layer has real logic)

- [x] 1.1 New migration `00006_section_edit_permission.sql`: add `can_section_edit boolean NOT NULL DEFAULT false` to `roles`; backfill existing `Contributor`/`Project Admin` rows to `true`, matching where `sectionCreate` already sits
- [x] 1.2 `domain.go`: add `PermSectionEdit`, `CanSectionEdit` (Role), `SectionEdit` (Permissions), wire into `Has()`/`Implies()`/`Intersect()`/Role↔Permissions conversions — mirror every existing `SectionDelete` touch point exactly
- [x] 1.3 Test + `store/roles.go`: add the column to `Create`/scan/list SQL
- [x] 1.4 `project_rbac.go`: add `CanSectionEdit: true` to the `defaultRoles` Contributor/Project Admin mirror (keeps `ResetRolesToDefaults` in sync with the migration's seed values)
- [x] 1.5 `role_handlers.go`: add `CanSectionEdit` to the request/response DTOs
- [x] 1.6 `openapi.yaml`: add `sectionEdit` to the `Permissions` schema; `make generate` to regenerate shared types; confirm CI's contract-drift check would pass
- [x] 1.7 `RolesPage.tsx`: add `{ key: 'canSectionEdit', shortLabel: 'Edit', fullLabel: 'Edit Section' }` to the Sections permission group (between Create and Delete, matching Cases' Create/Edit/Delete ordering); wire the field through the create/update payload
- [x] 1.8 Test: seeded Contributor/Project Admin roles report `sectionEdit: true`; Tester/Viewer report `false`

## 2. Backend: move (reparent) a folder (TDD, failing test first for each layer)

- [x] 2.1 Test + `store/folders.go` `Move(ctx, folderID, targetParentID) (domain.Folder, error)`: reuses `subtreeCTE` to reject a target that is `folderID` itself or inside its subtree; rejects moving the root folder (no parent); updates `parent_folder_id` and returns the updated row
- [x] 2.2 Test + `service.go` `MoveFolder(ctx, folderID, targetParentID) (domain.Folder, error)`: validates `targetParentID` is non-empty, calls the store method, audits `"move"`/`"folder"` with `{from, to}` (mirroring `MoveCase`'s audit shape exactly)
- [x] 2.3 Test + new handler + `openapi.yaml` route: `PUT /api/v1/folders/{folderId}` (body `{ parentFolderId }`), gated by `sectionEdit`, `make generate`
- [x] 2.4 Test: moving into a descendant, into itself, or moving the root folder each return a client error (400), not a 500 or silent no-op
- [x] 2.5 Test: a permission set lacking `sectionEdit` gets `403`

## 3. Frontend: single-folder "Move to…" (TDD)

- [x] 3.1 Test + add a small `subtreeIds(folders, folderId)` helper in `FolderExplorerPage.tsx` (mirrors `CasePicker`'s existing `buildFolderTree().subtreeIds` pattern), used to filter `FolderPicker`'s target list
- [x] 3.2 Test + add "Move to…" to `FolderRow`'s action-menu items, gated by `sectionEdit` (alongside the existing `sectionDelete`-gated "Delete"); update the row's `canDelete`-only trigger-visibility condition to `canMove || canDelete`
- [x] 3.3 Test + a new single-folder move dialog reusing `FolderPicker`, filtered to exclude the moving folder's own subtree, calling the new `PUT /folders/{folderId}` endpoint on select
- [x] 3.4 Confirm the existing single-case "Move to…" dialog and its tests are untouched (regression guard)

## 4. Frontend: extend selection to folders (TDD, building on `add-library-bulk-select`)

- [x] 4.1 Test + generalize `FolderExplorerPage.tsx`'s `orderedVisibleCases`/`toggleSelect`/keyboard-nav state to a combined, rendered-order list of folder and case entries (`orderedVisibleEntries`), disjoint ids (folder DB id vs. case key) confirmed safe to share one `Set<string>`
- [x] 4.2 Test + `FolderRow` gains `selected`/`onToggleSelect`/`focused`/`rowRef` props identical in shape to `CaseRow`'s (from `add-library-bulk-select`), including the same tint/ring classes
- [x] 4.3 Test + Shift+Click ranging and keyboard Space/Shift+Space work across a folder-then-case range (not just case-to-case, already covered)
- [x] 4.4 Test + Enter opens the focused case or navigates into the focused folder (extends the existing case-only Enter behavior)
- [x] 4.5 Confirm every existing case-only `add-library-bulk-select` test still passes unmodified

## 5. Frontend: bulk Move to… and Delete on a mixed selection (TDD)

- [x] 5.1 Test + `apps/web/src/lib/bulkMoveFolders.ts`: `Promise.all` over the new `PUT /folders/{folderId}` endpoint, matching `bulkMoveCases.ts`'s shape
- [x] 5.2 Test + `apps/web/src/lib/bulkDeleteFolders.ts`: `Promise.all` over `DELETE /folders/{folderId}`, matching `bulkDeleteCases.ts`'s shape
- [x] 5.3 Test + the footer bar's "Move to…" handler splits the selection into folder ids / case keys and calls both bulk-move helpers against the one chosen target
- [x] 5.4 Test + a new `apps/web/src/lib/folderDeletePreviewTotal.ts` (or inline helper): fetches `GET /folders/{folderId}/delete-preview` for every selected folder in parallel and sums `caseCount`/`folderCount` across them, added to the directly-selected case count
- [x] 5.5 Test + the bulk-delete confirmation dialog states the summed total (cases + subsections) when any folder is selected, and the plain case count when none is
- [x] 5.6 Test + confirming bulk delete calls both `bulkDeleteFolders`/`bulkDeleteCases` as appropriate and clears the selection

## 6. Wiring and regression safety

- [x] 6.1 Full web + Go test suites green, typecheck clean, lint clean (both apps)
- [x] 6.2 Web coverage gate (≥80% all metrics), API coverage gate (≥80%)
- [x] 6.3 Confirm every pre-existing `FolderExplorerPage.test.tsx` case-only bulk-select test (from `add-library-bulk-select`) still passes unmodified
- [x] 6.4 `openspec validate --all --strict`

## 7. Docs

- [x] 7.1 Update `docs/test-management.md`'s Library section: folder "Move to…", bulk selection now spanning folders, bulk-delete confirmation summing
- [x] 7.2 Update wherever `docs/` documents the permission matrix (likely `docs/authorization.md` or the equivalent) to add `sectionEdit`

## 8. Sample Project showcase

- [x] 8.1 Evaluate `seed.go`: does the existing section tree (Authentication/Two-Factor nested, Checkout, Settings, Notifications, Localization, Reporting API) already demonstrate a folder move and a mixed folder+case bulk selection meaningfully, or does it need a small addition (e.g. a section worth merging into another)? — **No addition needed.** "Authentication" already mixes a nested "Two-Factor" subsection alongside ~10 direct cases, so browsing into it shows a folder row and many case rows together (mixed bulk-selection demo); the 6 top-level sibling sections at root (Authentication, Checkout, Settings, Notifications, Localization, Reporting API) are real, varied move targets for a single-folder "Move to…" demo. Both scenarios were already meaningfully covered by prior showcase work (`rework-library-ux`).

## 9. Validation

- [x] 9.1 `make lint` / coverage gates (web + api)
- [x] 9.2 `act pull_request -j web` and `-j api` local CI validation, including the migration/contract-drift checks — `-j api` fully green (build/vet/lint/coverage gate); `-j web`'s lint/typecheck/coverage/build steps verified green via direct `npm run` invocations (the "Contract types are current" step legitimately diffs against git HEAD, which will only match once this change is committed — confirmed regeneration is otherwise idempotent). The `migrations` job depends on a `changes` (paths-filter) job that needs real PR context act can't simulate; manually confirmed the new migration file is untracked (`git status`), so CI's "no already-merged migration edited" check (which only flags `M` status) can never fire on it.
- [x] 9.3 Local docker-compose deploy + manual browser validation: single-folder "Move to…" (including subtree exclusion from the picker), mixed folder+case Shift+Click range, bulk move of a mix, bulk delete with a summed confirmation, and the Roles page's new Edit Section checkbox — all confirmed working live. **Found and fixed a real bug in the process**: `MyPermissions`' Tenant Admin bypass (`project_rbac.go`) hardcoded each `Permissions` field individually and was never updated for `sectionEdit` (plus pre-existing gaps for `runDelete`/`projectDelete`), so a Tenant Admin browsing the Sample Project saw no "Move to…" on section rows at all. Fixed with a new failing-test-first regression guard (`allTruePermissions()` via reflection, so this class of drift can't recur silently) before fixing the bypass; verified live in the browser afterward.
