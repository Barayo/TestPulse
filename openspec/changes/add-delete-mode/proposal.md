## Why

Neither test cases nor sections have a delete action wired up in the UI today — case
deletion exists only as a soft-delete API path (`test-authoring`'s "Soft deletion
protects run history"), and section deletion currently reparents contents rather than
removing them, with no UI trigger at all. Now that `add-project-rbac` is introducing
per-resource `caseDelete`/`sectionDelete` permission flags, we need an actual delete UI
to exercise them, and it needs to be safe: delete is destructive (especially for a
section, which can contain an entire subtree of cases), so it must be an explicit,
warned-about action — not a stray button next to every row.

## What Changes

- Add a **delete mode** toggle to the Library view: an explicit "Manage"/"Delete mode"
  switch that must be turned on before any delete affordance (checkbox selection, delete
  buttons) appears on sections or cases. Off by default on every visit.
- Delete mode and its controls are only visible/usable to an actor whose effective
  project permissions include `sectionDelete` or `caseDelete` (the flags
  `add-project-rbac` defines) — an actor with neither flag never sees the toggle at all,
  not just a disabled one.
- **BREAKING**: Replace the "Deleting a section reparents its contents" behavior with
  cascading soft delete: deleting a section soft-deletes every case anywhere in its
  subtree and removes every descendant section, instead of moving children to the
  parent. The root section remains non-deletable.
- Section deletion becomes **logical (soft), not physical**: add a `deleted` flag to the
  section table, matching the pattern `test_cases.deleted` already uses, so a deleted
  section's history/audit trail is preserved rather than the row being removed.
- Wire up case deletion in the UI (soft delete, reusing the existing `deleted` column
  and its already-specified "still visible from past run results" guarantee).
- Every delete action (single case, single section, and any future bulk delete) SHALL
  show a confirmation dialog before executing, stating what will be removed — for a
  section, explicitly naming how many cases/subsections are in its subtree. Reuses the
  destructive-confirmation dialog pattern `add-project-rbac` is introducing for "Reset
  roles to defaults" (first such pattern in this codebase).
- Bulk multi-select delete is out of scope for this change (single-item delete only,
  gated behind delete mode) — flagged as a natural follow-up once delete mode itself is
  validated.

## Capabilities

### New Capabilities
(none — delete mode is a UI/permission layer over section/case deletion, which are
existing `test-authoring` concepts)

### Modified Capabilities
- `test-authoring`: "Deleting a section reparents its contents" is replaced by cascading
  soft delete of the section's entire subtree; soft-deletion is extended to sections
  (previously only cases were soft-deleted).

## Impact

- **Dependencies (hard sequencing)**: this change assumes both `add-project-rbac`
  (for the `sectionDelete`/`caseDelete` permission flags gating delete mode, and the
  "Reset to defaults" confirmation-dialog pattern it introduces) and
  `rename-folders-to-sections` (for "Section" terminology/identifiers) are implemented
  and archived first. Its spec delta below is written in Section/permission-flag terms
  against the state those two changes leave behind, not against the current main specs.
- **Schema**: adds a `deleted boolean NOT NULL DEFAULT false` column (and a
  `WHERE NOT deleted` filtered index) to the section table, amending the same
  core-domain migration `rename-folders-to-sections` already amends (pre-1.0 policy —
  one more in-place amendment, not a new migration file).
- **Backend**: section store's `Delete` moves from reparent+hard-delete to a recursive
  soft-delete of the subtree; new/updated service methods enforce the
  `sectionDelete`/`caseDelete` permission checks `add-project-rbac` defines.
- **API**: section list/get endpoints exclude soft-deleted sections, matching how case
  listing already excludes soft-deleted cases.
- **UI**: delete-mode toggle and confirmation dialog in the Library view
  (`SectionExplorerPage.tsx`/`SectionTree.tsx`, post-rename names) and case views
  (`CaseDrawer.tsx`); permission-gated visibility using `add-project-rbac`'s effective
  permissions.
- **Docs**: `docs/test-management.md`, `docs/database.md`, `docs/api.md`.
