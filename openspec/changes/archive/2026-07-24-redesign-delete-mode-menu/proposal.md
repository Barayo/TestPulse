## Why

A live UX critique of `add-delete-mode` (shipped, archived) found the app-wide "Delete mode"
toolbar toggle wrong for how rarely delete should actually be used: it puts a destructive-tinted
control in the toolbar permanently and, once toggled on, exposes a delete icon on every row —
"less loud," never actually hidden. Direct follow-up feedback confirmed the goal: delete should
be residual, closed by default, not just a quieter always-on control. A per-row contextual "⋯"
menu — closed until deliberately opened — gives that property; once it exists, gating the same
action a second time with an app-wide mode toggle is redundant.

## What Changes

- Remove the "Delete mode" toolbar toggle and its `deleteMode` state entirely.
- Add a reusable `RowActionMenu` component (`apps/web/src/components/RowActionMenu.tsx`) — a
  closed-by-default "⋯" dropdown, reusing the click-outside/Escape-to-close pattern
  `AdminMenu.tsx` already established in this app.
- Each case row's actions ("Move to…", "Delete") move into one `RowActionMenu`, replacing the
  two standalone icon buttons. "Move to…" keeps its current unconditional visibility; "Delete"
  is included only when the actor has `caseDelete`, separated from "Move to…" by a divider and
  styled `text-destructive`.
- Each folder row's action (`Delete`) moves into a `RowActionMenu` containing that single item,
  shown only when the actor has `sectionDelete` — matching today's "hidden entirely, not just
  disabled" guarantee, now expressed as "the trigger itself doesn't render" instead of "the mode
  toggle doesn't render."
- Drag-and-drop case moves, the confirmation dialog (and its copy), and the delete-preview
  endpoint are all unchanged — this is purely a rework of how the actions are *discovered and
  triggered* in the Library view, not what they do.

## Capabilities

### Modified Capabilities
- `test-authoring`: the "Destructive actions require delete mode and confirmation" requirement
  changes from an app-wide toggle to a per-row contextual menu; confirmation-dialog behavior is
  unchanged.

## Impact

- `apps/web/src/pages/FolderExplorerPage.tsx` — remove delete-mode state/toggle, wire both row
  types through the new menu.
- `apps/web/src/components/RowActionMenu.tsx` (new) + test file.
- `apps/web/src/pages/FolderExplorerPage.test.tsx` — replace delete-mode-toggle tests with
  per-row-menu tests.
- `apps/web/e2e/delete-mode.spec.ts` — update flows to open the row menu instead of toggling a
  mode.
- `openspec/specs/test-authoring/spec.md`, `openspec/specs/authorization/spec.md` (one
  cross-reference comment) — sync.
- `docs/test-management.md` — update the "Delete mode" section.
- No API, schema, or permission-model changes; `GET /permissions` and
  `GET /folders/{folderId}/delete-preview` are reused as-is.
