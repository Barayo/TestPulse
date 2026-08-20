## Context

TestPulse's case classification (priority/platform/testType/automated/tags)
is a fixed Go struct mirrored as discrete DB columns on `test_case_versions`
— confirmed via codebase inventory, there is no generic-JSON escape hatch
today. This is the first "user-orderable list of child DB rows" feature in
the codebase (`roles.rank` is a flat display-order column on independent
top-level rows, not a reorder-children-of-a-parent case). Pepe's approved
design (mock: `https://claude.ai/code/artifact/1a795049-4dbd-479c-8ff2-6196bd868d41`)
settled the UI shape across three review rounds (initial design, field/
sidebar overflow handling, drag-handle reordering); this doc covers the
technical how.

## Goals / Non-Goals

**Goals:**
- Project-scoped custom field definitions (text/select), reorderable,
  with select options independently reorderable.
- Values stored per case version, surviving the existing immutable-version
  model unchanged.
- Reuse existing patterns exactly where one exists (Role CRUD shape,
  deletion-preview convention, `PermManageProject` gating, native
  drag-and-drop already used by `FolderExplorerPage.tsx`).

**Non-Goals:**
- No new field types beyond text/select (no number/checkbox/date — later
  work if ever).
- No Library list-view integration (explicit scope cut, proposal.md).
- No case-creation-drawer integration (classification fields are edit-only
  today; custom fields follow the same convention, not a new one).
- No retroactive backfill of custom field values onto past versions.

## Decisions

**D1 — Two new tables, following `roles`' column-style exactly (not
`test_case_versions`' baseline-pg_dump style — `00002_color_theme.sql`'s
plain goose `ALTER`/`CREATE` style is the more recent, correct precedent
to copy):**
```sql
CREATE TABLE case_custom_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (name <> ''),
    field_type text NOT NULL CHECK (field_type IN ('text', 'select')),
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX case_custom_fields_project_id_idx ON case_custom_fields(project_id);

CREATE TABLE case_custom_field_options (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    field_id uuid NOT NULL REFERENCES case_custom_fields(id) ON DELETE CASCADE,
    value text NOT NULL CHECK (value <> ''),
    position integer NOT NULL DEFAULT 0
);
CREATE INDEX case_custom_field_options_field_id_idx ON case_custom_field_options(field_id);

ALTER TABLE test_case_versions ADD COLUMN custom_fields jsonb NOT NULL DEFAULT '{}';
```
`ON DELETE CASCADE` on both FKs means deleting a field definition cleanly
removes its options — no orphan cleanup logic needed. `custom_fields` is
never retroactively rewritten on old version rows (immutable payload,
matching `domain.go`'s existing comment on `test_case_versions`); it's
sparse — a version created before a field existed simply has no key for
it, rendered as `PropertyRow`'s existing empty-dash.

**D2 — Values keyed by field ID, not name; select values store the
option's ID, not its text.** Both renames (field or option) must not
orphan existing case data or silently reattribute historical diffs to the
wrong label. `CaseContent.CustomFields map[string]string` — key is the
field's UUID, value is either free text (text-type) or an option UUID
(select-type). Rendering always resolves through the *live* field/option
definitions, same as field/option names themselves aren't duplicated into
case content.

**D3 — API surface mirrors `roles`' shape, project-scoped instead of
tenant-scoped, `PermManageProject`-gated for writes, `PermRead` for list
(and a public equivalent, since public projects' case sidebars need field
names to render values meaningfully):**
```
GET    /api/v1/projects/{projectKey}/custom-fields              (PermRead)
GET    /api/v1/public/projects/{projectKey}/custom-fields        (public)
POST   /api/v1/projects/{projectKey}/custom-fields               (PermManageProject)  {name, fieldType, options?: string[]}
PATCH  /api/v1/custom-fields/{fieldId}                           (PermManageProject)  {name}  — fieldType immutable
DELETE /api/v1/custom-fields/{fieldId}                           (PermManageProject)
GET    /api/v1/custom-fields/{fieldId}/deletion-preview          (PermManageProject)  {caseCount}
PUT    /api/v1/projects/{projectKey}/custom-fields/order         (PermManageProject)  {fieldIds: string[]}
POST   /api/v1/custom-fields/{fieldId}/options                   (PermManageProject)  {value}
DELETE /api/v1/custom-fields/{fieldId}/options/{optionId}        (PermManageProject)
PUT    /api/v1/custom-fields/{fieldId}/options/order             (PermManageProject)  {optionIds: string[]}
```
A single "set full order" endpoint (not a one-step move-up/move-down
endpoint) serves both the drag-and-drop interaction (send the final
dropped-into order) and the `RowActionMenu` "Move up"/"Move down" fallback
(client computes the swapped array locally, sends the same full-order
shape) — one backend operation, two frontend triggers, avoiding a second
endpoint that would have to stay in lockstep with the first.

**D4 — Deletion preview is counts-only, matching `RoleDeletionPreview`'s
established convention.** `{caseCount: int}` — the number of the project's
current (non-deleted) cases whose *current* version has a value set for
this field: `SELECT count(*) FROM test_cases c JOIN test_case_versions v
ON v.case_id = c.id AND v.version = c.current_version WHERE c.project_id =
$1 AND NOT c.deleted AND v.custom_fields ? $2` (jsonb `?` key-existence
operator).

**D5 — `CaseRepo.NewVersion` gains one new column in its existing
INSERT** (`store/cases.go` — same function, no new write path), and
`Service.EditCase`/`CreateCase` validate `CustomFields` against the
project's live field definitions before writing: unknown field IDs
rejected; a select field's value must be one of that field's current
option IDs (or absent — never a value validated at write time that later
goes stale, since a deleted option cannot be re-selected but a version
that already recorded it keeps it, per D1/D6).

**D6 — Deleting a field or option does not retroactively touch existing
`custom_fields` JSON on past versions; version-diff rendering resolves
against live definitions only, so a deleted field's historical change
silently stops appearing** (decided product behavior, proposal.md) —
`versionDiff.ts`'s `SCALAR_FIELDS` becomes a function of
`(customFieldDefs: {id, name}[]) => ScalarField[]`, concatenating the
existing static fields with one entry per **currently live** field
definition, `get: (c) => c.customFields?.[def.id] ?? ''`. A version that
references a since-deleted field's ID simply has that key ignored by the
diff — no error, no stale label.

**D7 — Reordering UI: native HTML5 drag-and-drop (`draggable`,
`dragstart`/`dragover`/`drop`), reusing `FolderExplorerPage.tsx`'s exact
pattern, `GripVertical` from `lucide-react` (already a dependency) as the
handle glyph.** Grab starts only from the handle (`mousedown` flips that
row's `draggable` to true, reset on `dragend`) — the name input, delete
icon, and option `×` never trigger a drag. Applied identically to the
field list and each select field's option list — one interaction model,
not two.

**D8 — Non-drag fallback: each field/option row's existing `RowActionMenu`
gains "Move up"/"Move down" items**, disabled at the respective boundary
(matches the drag handle's own first/last-row disabled treatment already
shown in the mock). Calls the same PUT-full-order endpoint as D3, with the
array pre-swapped client-side.

**D9 — Sidebar cap is defined-order-based, not populated-first**: the
same first 3 custom fields (by the project's live order) always render
directly regardless of which are filled in for a given case, so visibility
never silently varies case-to-case; the rest sit behind `<details>` "Show
N more" (`CaseSidebarSection.tsx`'s own existing collapse element, not a
new one).

## Risks / Trade-offs

- [A select field with a deleted option leaves old case versions
  referencing a dangling option ID] → Mitigation: rendering resolves
  against live options; a version's value for a now-deleted option simply
  fails to resolve to a label and renders as unset (same as D6's
  field-deletion handling, applied one level down) — documented in
  tasks.md as an explicit scenario to test, not left implicit.
- [Two new tables plus a new JSONB column is real migration surface] →
  Mitigation: fully additive (`ADD COLUMN ... DEFAULT '{}'`), matching
  `00002_color_theme.sql`'s own additive shape; no existing data touched,
  no backfill needed.
- [Native drag-and-drop has no built-in keyboard path] → Mitigation: D8's
  `RowActionMenu` fallback is the accessible path, built from day one, not
  a follow-up.

## Migration Plan

Additive migration + new endpoints + new UI surface, ships in one PR. No
flag — a project with zero custom fields defined behaves identically to
today (every new code path is conditioned on the field-definitions list
being non-empty).

## Open Questions

None — resolved through three rounds of Pepe design review plus the
founder's explicit calls on reordering interaction, sidebar overflow,
deleted-field diff behavior, and Library-row scope.
