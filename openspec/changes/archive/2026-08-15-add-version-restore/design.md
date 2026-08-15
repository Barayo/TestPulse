## Context

Read the actual schema before designing this (2026-07-15 session): case
content already lives entirely in `test_case_versions` (`case_id, version,
title, steps, …`), never on `test_cases` itself. `test_cases.current_version`
is a plain integer; `test_run_items` pins results via the composite key
`(case_id, version)` as a literal foreign key into `test_case_versions`.
That pin is what makes "a run always shows the exact content it was
tested against" true — and it's the constraint that shapes this design.

## Goals / Non-Goals

**Goals:**
- Restore old content without ever reusing a version number for
  different content (would corrupt any run that pinned that number).
- Give audit entries a place to carry structured before/after detail,
  reusable beyond just move and restore.

**Non-Goals:**
- No change to how versions are stored or numbered — `current_version`
  stays a monotonic integer counter, not a foreign key to a specific row.
- No "undo the restore" meta-operation — restoring is just another
  version; if you restore v1 and regret it, you restore v3 (or whichever
  you want) the same way. No special-cased history of restores beyond
  what the audit log already captures.

## Decisions

**Restore appends forward, never rewinds `current_version` in place.**
Considered and rejected: setting `current_version` directly back to an
old number. This looks cheaper but breaks the one invariant the whole
versioning system exists to protect — if a later edit then reused that
same version number for genuinely different content, any run that
pinned it via the `(case_id, version)` foreign key would silently point
at the wrong history. Instead, restore calls the exact same
`store.Cases.NewVersion` path `EditCase` already uses, just sourcing its
content from an old version instead of user input. Zero schema changes
to the versioning tables; the "hard part" the request anticipated
(separating content from the parent entity) turned out to already be
true of the existing design.

**`AuditEntry.Detail`: a generic `map[string]any`/`jsonb` field, not a
restore-specific or move-specific shape.** One column, reused by any
action that wants to record before/after state:
- `move` → `{ "from": "<folderId>", "to": "<folderId>" }`
- `restore` → `{ "restoredFrom": 1, "newVersion": 4 }`
- Other actions leave it null/omitted — no migration needed to adopt it
  later, since it's optional and unstructured beyond "valid JSON."

**Restore's audit action is `"restore"`, not `"edit"`** — even though
mechanically it's the same `NewVersion` call `EditCase` makes. The
action name is what makes a case's audit trail legible ("this became
version 4 because someone restored version 1," not "someone made an
edit that happens to look identical to version 1").

**API shape:** `POST /api/v1/cases/{caseId}/versions/{version}/restore`,
no request body — the target version is fully specified by the URL.
Returns the updated `TestCase` (now at the new current version), `201`,
consistent with how `EditCase`'s endpoint responds today.

## Risks / Trade-offs

- **Audit `detail` is unstructured JSON**, not a per-action typed schema
  — trades some type safety for not needing a new column/table per
  action that wants detail. Acceptable given the audit log is
  read/query-only, never validated against on write paths elsewhere.
- **A case with heavy restore usage accumulates version numbers
  quickly** (each restore is a full new version) — this is correct
  behavior, not a bug, but worth knowing: "current version 12" doesn't
  mean 12 distinct pieces of content, some may be repeats.

## Open Questions

None outstanding.
