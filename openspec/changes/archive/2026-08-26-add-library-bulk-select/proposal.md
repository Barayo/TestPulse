## Why

As a user reorganizing the Library, when I need to move a batch of cases into a new section or clear out several stale drafts, I want to select many cases at once and act on all of them together, instead of repeating **Move to…**/**Delete** one row at a time through the per-row **⋯** menu.

GH #63: `add-delete-mode`'s design.md explicitly deferred bulk-select as a Non-Goal, not a rejection. Grounded in several rounds of Pepe/Fable-5 review that settled the open questions #63 itself left unscoped (row checkboxes vs. a mode toggle vs. shift-click ranges): "Checkboxes are ugly" ruled out row checkboxes entirely; the approved direction is shift-click ranging (mouse) and Space/Shift+Space ranging (keyboard) against a real, scrollable keyboard focus — no new selection affordance drawn on the row itself, since the row's own content already communicates selection via a background tint.

## What Changes

**Selection model** (`FolderExplorerPage.tsx`)
- No checkboxes. A case row is selected via **Shift+Click** — the first Shift+Click on a row selects just that row and sets it as the range anchor; a subsequent Shift+Click extends a contiguous range from that anchor (identical semantics to `RunPage.tsx`'s existing `toggleSelect(id, shiftKey)`, applied here for the first time without an accompanying checkbox). A plain click keeps opening the case, unchanged.
- Keyboard: arrow keys (or j/k) move a focused row through the current case list only (folder rows aren't part of the selectable set), with real `scrollIntoView` — a gap `RunPage.tsx`'s own keyboard nav still has, fixed here since Library's list isn't virtualized and the fix is direct. **Space** toggles the focused row (mirrors a first Shift+Click); **Shift+Space** extends the range from the anchor to the focused row (mirrors a subsequent Shift+Click). **Enter** opens the focused case.
- A selected row is shown by a `bg-primary/10` tint, visually distinct from the existing `hover:bg-accent` highlight — no icon, no checkbox, no new row chrome.

**Bulk action footer** (new `LibraryBulkActionBar.tsx`)
- Appears only once `selected.size > 0`, fixed to the bottom of the viewport (`ConfirmBanner.tsx`'s existing `fixed inset-x-4 bottom-4 … shadow-lg ring-1 ring-foreground/10` elevated-card idiom, not `RunBulkActionBar.tsx`'s inline-bar positioning — its actions-rendering shape is reused via the shared `BulkAction` type, not the component itself, since the two differ in position and the footer additionally needs a "Select all" link).
- Shows "N selected", a **Select all {total}** link (hidden once everything visible is already selected), **Move to…**, **Delete**, and **Clear**.

**Bulk actions**
- **Move to…** reuses the existing `FolderPicker` in a new dialog (separate from the single-case move dialog, to avoid touching its tested behavior), applying the target folder to every selected case.
- **Delete** reuses the existing delete-confirmation `Dialog`, extended with a `{ kind: 'bulk'; keys: string[] }` variant of `DeleteTarget` alongside the existing `case`/`folder` variants, naming the count rather than a single title.
- Both loop the existing single-case endpoints (`PUT /cases/{key}/folder`, `DELETE /cases/{key}`) via `Promise.all`, the same client-orchestration pattern `recordBulkVerdict.ts` already established for the Run board's bulk verdicts — no new API endpoints.
- A successful bulk action clears the selection and reloads the page's data, matching every existing single-case action's own after-effect.

## Capabilities

### New Capabilities

- `library-bulk-select`: multi-select case rows in the Library and apply Move to…/Delete to the whole selection at once.

### Modified Capabilities

(none — this is new, additive behavior; existing single-case move/delete/keyboard behavior is unchanged)

## Impact

- **Frontend only.** No API/schema changes — bulk actions loop the existing single-case endpoints.
- Files: `apps/web/src/pages/FolderExplorerPage.tsx`, new `apps/web/src/components/LibraryBulkActionBar.tsx`, new `apps/web/src/lib/bulkMoveCases.ts` + `apps/web/src/lib/bulkDeleteCases.ts`.
- **Docs**: `docs/test-management.md`'s Library section gains a paragraph on selection/bulk actions.
- **Sample Project**: existing seed data already has enough cases per section to demonstrate a multi-row selection and bulk move/delete; no seed changes needed.
- GH #63 is already at board status "In progress."
