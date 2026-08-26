## Why

As a user reorganizing the Library, when I want to restructure a whole subtree — merge sections together, move a section into a different parent, or clear out several stale sections — I want to select folders (alongside cases) and act on the whole selection at once, instead of deleting one section at a time via its own "⋯" menu and having no way to move a section anywhere at all.

GH #140, filed as a natural follow-on to the just-shipped `add-library-bulk-select` (case-only). Investigating the current code surfaced a bigger gap than the issue assumed: **a folder cannot be moved (reparented) today at any granularity** — no drag-and-drop, no menu action, no backend endpoint; only `DELETE /folders/{id}` exists. Per explicit direction, this change builds single-folder reparenting first, then bulk selection/move/delete on top of it — not bulk-only.

## What Changes

**New capability: moving (reparenting) a folder — doesn't exist today**
- New `sectionEdit` permission (mirroring `caseEdit`'s tier — Contributor and Project Admin get it by default, matching where `sectionCreate` already sits), requiring a new migration (`can_section_edit` column on `roles`) and full plumbing: `domain.go` (Permission/Role/Permissions), `store/roles.go`, `project_rbac.go`'s factory-default mirror, `role_handlers.go`, `openapi.yaml`'s `Permissions` schema, `RolesPage.tsx`'s permission checklist.
- New backend endpoint `PUT /api/v1/folders/{folderId}` (body: `{ parentFolderId }`), gated by `sectionEdit`. Rejects: moving the root folder, moving a folder into itself, and moving a folder into any of its own descendants (a cycle) — checked server-side via the same recursive subtree CTE `SubtreeCounts`/`Delete` already use, so a client bypass can't corrupt the tree.
- New "Move to…" item in a folder row's "⋯" menu (gated by `sectionEdit`, alongside the existing `sectionDelete`-gated "Delete"), reusing `FolderPicker` — the target list excludes the folder's own subtree client-side (defense in depth; the server is the real guard).

**Folder selection, extending `add-library-bulk-select`'s model to a second row type**
- Folders and cases share **one selection set** (not two independent ones) — matches how a real file manager lets you select files and folders together and act on the mixed set. Shift+Click/keyboard range-select now spans both row kinds in their rendered order (folders first, then cases, matching the existing list layout).
- The footer bar's **Move to…** and **Delete** act on the mixed selection: every selected case moves into the chosen folder (existing `bulkMoveCases`); every selected folder reparents into it (new `bulkMoveFolders`, looping the new endpoint). **Delete** removes every selected case and cascades-deletes every selected folder; the confirmation sums each selected folder's existing delete-preview (case + subsection counts) across the whole selection, on top of the case count, so the confirmation is never a surprise.
- A folder row keeps its own "Move to…"/"Delete" single-item menu unchanged — bulk is additive, not a replacement.

## Capabilities

### New Capabilities
- (none — extends `library-bulk-select` and `ui-navigation`, no new capability directory)

### Modified Capabilities
- `library-bulk-select`: selection extends to folders; Move to…/Delete act on a mixed folder+case selection.
- `ui-navigation`: a folder row gains a "Move to…" action (new capability); the "Suites index and detail page"/Library requirements are unaffected (this only touches the Library's own folder rows).
- `authorization`: a new `sectionEdit` permission.

## Impact

- **Database migration**: `00006_section_edit_permission.sql` (new `can_section_edit` column on `roles`, backfilling Contributor/Project Admin) — per CLAUDE.md's permanent incremental-migration policy, this file is never edited again once merged.
- **API contract**: new `PUT /api/v1/folders/{folderId}` endpoint and `sectionEdit` field on `Permissions` in `packages/shared/openapi.yaml`; `make generate` regenerates shared types (CI fails on drift).
- Backend files: `internal/domain/domain.go`, `internal/store/folders.go`, `internal/store/roles.go`, `internal/service/service.go`, `internal/service/project_rbac.go`, `internal/server/handlers.go`, `internal/server/role_handlers.go`.
- Frontend files: `apps/web/src/pages/FolderExplorerPage.tsx`, `apps/web/src/components/FolderPicker.tsx` (reused, not modified), `apps/web/src/components/LibraryBulkActionBar.tsx` (reused, not modified), `apps/web/src/pages/RolesPage.tsx`, new `apps/web/src/lib/bulkMoveFolders.ts` + `bulkDeleteFolders.ts` (or a generalized preview-summing helper — see design.md).
- **Docs**: `docs/test-management.md` (Library section — folder move/delete, bulk selection extended to folders) and wherever `docs/` documents the permission matrix.
- **Sample Project**: existing seed data has enough sections (Authentication/Checkout/Settings/Notifications/Localization/Reporting API, with Two-Factor nested under Authentication) to demonstrate a folder move, a mixed folder+case bulk selection, and a bulk-delete confirmation summing multiple subtrees; no seed changes anticipated, to confirm during implementation.
- Board: GH #140 moved to "In progress." A second issue may be worth filing for the new `sectionEdit` permission's RolesPage exposure if that's judged separable — proposed as part of this same change for now, since it's small.
