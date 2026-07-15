## 1. Move-case API helper (TDD)

- [x] 1.1 Write failing tests for a `moveCase(caseId, folderId)` helper in `FolderExplorerPage.tsx` (or extracted if it grows): calls `PUT /api/v1/cases/{caseId}/folder`, refetches, bumps landing data revision
- [x] 1.2 Implement, confirm green

## 2. Drag-and-drop (TDD)

- [x] 2.1 Write failing tests: dragging a case row and dropping it on a tree node moves the case; dropping on an inline subsection row in the content list moves the case; dropping on the case's current section is a no-op (no API call)
- [x] 2.2 Make case rows `draggable`, wire `onDragStart` to stash the case id
- [x] 2.3 Add `onDragOver`/`onDrop` handlers (+ hover visual state) to `FolderTree` nodes and to inline subsection rows in `FolderExplorerPage`
- [x] 2.4 Confirm tests green — surfaced a pre-existing latent test-ambiguity ("Nacionales" matching both the tree node and the content-list row) that had been passing on timing luck; fixed by scoping 4 pre-existing tests to the content list specifically

## 3. Move-to picker (TDD)

- [x] 3.1 Write failing tests: "Move to…" button opens a dialog listing every folder with its full path; selecting one moves the case; the case's current folder doesn't move it if reselected (no-op, matches drag behavior)
- [x] 3.2 Add a folder-path helper (walks `parentFolderId` chain, joins with "/")
- [x] 3.3 Build the picker (Dialog + searchable list, mirrors `ProjectSwitcher`'s shape) and the per-row "Move to…" button
- [x] 3.4 Confirm tests green

## 4. Root-level cases visible on the landing page (TDD)

- [x] 4.1 Write failing tests: a project with cases only in root shows an "Unsectioned" row in the Library panel; clicking it navigates to the root section; the row is absent when root has no direct cases
- [x] 4.2 Add the computed count directly in `useProjectLanding.ts`'s existing folder computation (prepended to `landingFolders`, no new field needed — simpler than the proposal's original plan of a separate field + prepend in `ProjectPage.tsx`)
- [x] 4.3 Confirm tests green

## 5. Verification

- [x] 5.1 Run full `apps/web` test suite, lint, typecheck, coverage gate — all green (257 tests, coverage 92.73/84.52/91.52/94.73)
- [x] 5.2 Rebuild the compose stack; verify live — drag a case between sections, use Move-to, confirm the Unsectioned row appears/disappears correctly. Verified end-to-end against the exact project that surfaced the original bug report: Case1 moved from root into "My section" via the Move-to picker, Unsectioned row appeared/disappeared correctly.

## 6. Docs and spec sync

- [x] 6.1 Update `docs/test-management.md`'s library section (currently says moving a case is "API-only for now")
- [x] 6.2 Confirm `openspec validate move-cases-between-folders` passes
