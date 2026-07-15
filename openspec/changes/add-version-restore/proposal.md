## Why

Two related gaps surfaced together (2026-07-15): a case's version history
is readable but not restorable — reverting an accidental or unwanted edit
means manually re-typing old content, if anyone even remembers what it
was. Separately, the just-added case-move audit entries record *that*
something happened but not *what* — a case's audit trail can't answer
"which folder was it in before this move." Both are the same underlying
gap: audit entries currently carry no structured detail beyond actor,
action, and timestamp.

## What Changes

- `AuditEntry` gains an optional `detail` field (structured JSON) —
  general-purpose, not restore/move-specific, so future actions can carry
  before/after state the same way.
- Case-move audit entries record `{ from, to }` (the previous and new
  folder id).
- A new "restore" action: a case can be reverted to an old version's
  content. This creates a **new** version whose content is copied from
  the target version — nothing is deleted or overwritten, and the
  restored-from version's audit entry records
  `{ restoredFrom, newVersion }`.
- UI: a "Restore this version" action next to each entry in a case's
  version history, gated behind a confirmation that explains the new
  version being created will become current (existing versions remain in
  history, untouched).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `audit-log`: entries gain an optional structured `detail` field.
- `test-authoring`: "Immutable test case versioning" gains a restore
  scenario — restoring is a new version, not a rewind.
- `ui-navigation`: "Version history is visible" gains the restore action
  and its confirmation.

## Impact

- `apps/api/internal/domain/domain.go` — `AuditEntry.Detail`
  (`map[string]any`, optional); new `Service.RestoreVersion` method.
- `apps/api/internal/db/migrations/` — amend the audit table (add a
  `detail jsonb` column) in place, pre-1.0 policy.
- `packages/shared/openapi.yaml` — `AuditEntry` schema gains `detail`;
  new `POST /api/v1/cases/{caseId}/versions/{version}/restore` endpoint.
- `apps/web/src/components/CaseDrawer.tsx` (or wherever version history
  renders) — restore action + confirmation.
- No changes to `test_case_versions`/`test_run_items` — restore reuses
  the exact same "create a new version" path `EditCase` already uses;
  no new relation, no schema change to the versioning tables themselves.
