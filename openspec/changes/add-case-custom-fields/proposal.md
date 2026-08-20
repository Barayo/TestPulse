## Why

As a Project Admin migrating a team off another test management tool, when my
team's cases need a property TestPulse doesn't have a fixed field for (e.g.
Component, Automation Owner, a Regression flag), I want to define that field
myself, scoped to my project, so my team's existing case metadata and
workflow survive the move instead of being silently dropped. Confirmed
absent by a Senior QA Architect gap assessment (2026-08-20) and filed as
issue #127 — case classification today is a fixed schema
(priority/platform/testType/automated/tags) with no extensibility mechanism.

## What Changes

- A Project Admin (`manageProject` permission) can define, reorder, rename,
  and delete custom fields on their project, from a new section on
  `ProjectSettingsPage.tsx`. Each field has a name and a type — **text** or
  **select** — chosen at creation and locked afterward. A select field has
  an ordered list of options, independently addable/removable/reorderable.
- Reordering (both the field list and each select field's option list) is
  primarily drag-and-drop via a grip handle, using the same native HTML5
  drag-and-drop approach `FolderExplorerPage.tsx` already uses for
  drag-into-folder — no new dependency. A non-drag fallback ("Move up"/"Move
  down" in each row's `RowActionMenu`) covers keyboard/no-drag use, matching
  the fallback `FolderExplorerPage.tsx`'s own drag feature already pairs
  with (`RowActionMenu`'s "Move to…" dialog).
- Deleting a field is a destructive action gated by a deletion-preview count
  (how many of the project's current cases have a value set), matching
  `RolesPage.tsx`'s deletion-preview convention exactly.
- Case authoring (`ClassificationEditor.tsx`, reached via a case's Edit
  mode) renders the project's defined fields below the fixed classification
  fields — text as `Input`, select as a native `<select>` with a leading
  unset option. Renders nothing when a project has no fields defined.
- The case detail sidebar renders custom field values via `PropertyRow`:
  select-type as a flat pill (reusing `ClassificationPills`' idiom), text-type
  as plain text — never both treated the same way. Capped at the first 3
  fields (by admin-set order); the rest collapse behind a "Show N more"
  disclosure (`<details>/<summary>`, matching `CaseSidebarSection`'s own
  mobile-collapse element). The authoring form itself is never capped.
- Version-history diffing (`versionDiff.ts`) becomes data-driven off the
  project's live field definitions instead of a hardcoded field list, so a
  custom field value change shows up as "{Field name} changed" like any
  other field.
- **Explicitly out of scope for this change**: Library list-view rows do
  not gain custom-field pills (would reopen an unbounded-row-width problem
  already solved elsewhere with hard caps — deliberate cut, not an
  oversight); the case-creation drawer does not gain custom fields (it
  never had classification fields either — those are edit-only today).
- **Decided product behavior**: deleting a field definition silently drops
  it from historical version diffs too (no "ghost" reference to a
  definition that no longer exists) — matches how role deletion already
  behaves.

## Capabilities

### New Capabilities
- `case-custom-fields`: project-scoped custom field definitions (text/select),
  their values on case content, and the endpoints/permissions governing
  both.

### Modified Capabilities
- `test-authoring`: case content gains an optional, project-defined custom
  field value set; version-history diffing includes custom field changes.

## Impact

- New migration `apps/api/internal/db/migrations/00003_case_custom_fields.sql`:
  two new tables (`case_custom_fields`, `case_custom_field_options`) plus a
  new `custom_fields jsonb` column on `test_case_versions`.
- `apps/api/internal/domain`, `internal/store`, `internal/service`,
  `internal/server` — new resource CRUD + reorder endpoints, `CaseContent`
  gains `CustomFields map[string]string`.
- `packages/shared/openapi.yaml` — new schemas/endpoints; `CaseContent`
  gains `customFields`.
- `apps/web/src/pages/ProjectSettingsPage.tsx` — new Custom fields Card.
- `apps/web/src/components/ClassificationEditor.tsx`,
  `apps/web/src/components/Pills.tsx`, `apps/web/src/pages/CaseDetailPage.tsx`
  — authoring + read-only rendering.
- `apps/web/src/lib/versionDiff.ts` — data-driven field list.
- `docs/test-management.md`, `docs/api.md` — new capability documented.
- `apps/api/internal/sampledata/seed.go` — Sample Project showcases at
  least one text and one select custom field, with values on real cases.
