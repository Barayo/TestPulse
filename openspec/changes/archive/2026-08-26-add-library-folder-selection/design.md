## Context

GH #140 assumed folder move already worked for one folder and just needed
a bulk wrapper — investigation found the opposite: folders can only be
deleted today, never moved, at any granularity. This design covers both
"build move" and "extend bulk-select to folders" as one change, per
explicit direction after surfacing the gap.

## Goals / Non-Goals

**Goals:** a folder can be moved (reparented) via a "Move to…" menu item,
server-side cycle-safe; the Library's existing Shift+Click/keyboard
bulk-select (`add-library-bulk-select`) extends to folders, sharing one
selection set with cases so a mixed selection can be moved or deleted in
one action.

**Non-Goals:** folder rename (still doesn't exist; out of scope, matches
the original GH #140 ask of "moving... or deletion" only); moving a folder
via drag-and-drop (cases already support drag-and-drop move; folders get
only the menu-driven "Move to…" for now — drag-and-drop for folders is a
plausible future GH issue, not blocking this one); a dedicated bulk-move/
bulk-delete backend endpoint (client-orchestrated loops over the
single-item endpoints are enough at this scale, matching `bulkMoveCases`/
`bulkDeleteCases`'s existing precedent).

## Decisions

**D1 — New `sectionEdit` permission, not reuse of `sectionCreate`/`sectionDelete`.**
Moving a folder is neither creating nor deleting one — reusing either
existing flag would misrepresent what a role can actually do (e.g. a role
with only `sectionCreate` could suddenly reparent folders it didn't create).
`sectionEdit` mirrors `caseEdit`'s existing tier exactly: Contributor and
Project Admin get it by default (the same rank threshold `sectionCreate`
already uses), consistent with this codebase's small-deliberate-permission-
set philosophy (`CasePicker`'s own `readOnly` gating cites the same
principle). Full plumbing: migration → `domain.go` → `store/roles.go` →
`project_rbac.go`'s `defaultRoles` mirror → `role_handlers.go` →
`openapi.yaml` → `RolesPage.tsx`.

**D2 — Server-side cycle detection via the existing subtree CTE, not a client-only guard.**
`FolderRepo.Move(ctx, folderID, targetParentID)` reuses the exact
`subtreeCTE` pattern `SubtreeCounts`/`Delete` already established: before
updating `parent_folder_id`, check `targetParentID` is not `folderID`
itself and not in `folderID`'s subtree (a single query, same recursive CTE,
just an `EXISTS` instead of a count). Rejects with a client-facing
`invalid()` error, not a 500 — this is a normal, expected user mistake
(dragging/picking a folder into its own child), not a server fault. The
client-side `FolderPicker` filtering (D3) is UX polish on top of this real
guard, not a substitute for it.

**D3 — Reuse `FolderPicker` for the "Move to…" target list, filtered client-side.**
`FolderPicker` (already generic: `folders`/`rootId`/`query`/`onSelect`) is
reused unmodified for folder-move exactly as it already is for case-move
and "Browse sections." The caller (`FolderExplorerPage.tsx`) computes the
moving folder's subtree ids (a new small helper, mirroring `CasePicker`'s
existing `buildFolderTree().subtreeIds` pattern already used elsewhere in
this codebase) and passes a filtered `folders` list excluding them — so an
invalid target never even appears as a clickable row, rather than being
clickable and then rejected.

**D4 — One shared selection set for folders and cases, not two independent ones.**
Matches how a real file manager lets a user select files and folders
together. `add-library-bulk-select`'s `selected: Set<string>` becomes a set
of entry ids where a folder's id and a case's key never collide (folders
use their DB id, cases use their key — already disjoint namespaces in this
codebase, confirmed by reading `FolderExplorerPage.tsx`). The Shift+Click/
keyboard range model (`orderedVisibleCases` → renamed `orderedVisibleEntries`)
now walks a combined, rendered-order list: subfolders first, then cases —
identical to the DOM order the page already renders today, so a range
Shift+Click spanning a folder and a case selects everything visually
between them, matching what the user sees.

**D5 — The footer bar's Move to…/Delete act on the mixed selection, split by kind internally.**
`LibraryBulkActionBar` itself is unchanged (D5 of the prior change already
made it generic: count/actions/onClear). The **Move to…** handler splits
the current selection into folder ids and case keys, calls `bulkMoveFolders`
and `bulkMoveCases` against the one chosen target, and awaits both. **Delete**
similarly splits and calls `bulkDeleteFolders`/`bulkDeleteCases`. Both
helpers follow the exact `Promise.all`-over-the-single-item-endpoint shape
`bulkMoveCases`/`bulkDeleteCases` already established.

**D6 — Bulk-delete confirmation sums every selected folder's existing delete-preview.**
`GET /folders/{folderId}/delete-preview` already exists per-folder
(`FolderDeletePreview`). The confirmation dialog fetches it for every
selected folder (parallel `Promise.all`, small counts, no new batch
endpoint needed at this scale) and sums `caseCount`/`folderCount` across
all of them, added to the directly-selected case count, so "Delete 3 items"
always states the true blast radius (e.g. "12 cases, 2 sections") before
the user confirms — never a silent surprise the way a bare count would be.

**D7 — A folder row's own single-item "⋯" menu is additive, not replaced.**
"Move to…" and "Delete" continue to work per-row exactly as today (Delete
already does; Move to… is new but follows the identical dialog pattern the
case row's own "Move to…" already uses). Bulk selection via Shift+Click/
keyboard is a second, independent way to reach the same underlying actions
— the same "additive, not a replacement" relationship
`add-library-bulk-select`'s own design.md already established for cases.

## Risks / Trade-offs

- **This is the first change in the current batch of Library work to touch
  the database and the API contract** — real production-outage-shaped
  surface (per CLAUDE.md's migration-policy history). Mitigated by strictly
  following the established incremental-migration pattern (one new file,
  never edited after merge) and by the migration itself being purely
  additive (a new nullable-by-default-false column, no data rewrite).
- **Extending `orderedVisibleCases`/`selected` to a mixed entry set touches
  already-shipped, tested code from `add-library-bulk-select`** — every
  existing case-only bulk-select test must keep passing unmodified; new
  tests cover the folder and mixed-selection cases additively.
- **A folder in the confirmation-preview sum could itself be an ancestor or
  descendant of another selected folder** (e.g. selecting both "Authentication"
  and its child "Two-Factor") — the sum would double-count "Two-Factor"'s
  cases (once under its own preview, once under Authentication's subtree
  preview). Accepted for now: the count would overstate slightly in this
  specific case, never understate (safe direction for a destructive
  action), and the real per-folder cascading delete itself is still
  correct (each `DELETE` call is independently safe) — only the
  confirmation number's precision is affected. Worth a follow-up if it
  turns out to matter in practice.
