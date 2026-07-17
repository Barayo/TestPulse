## Context

Today, deleting anything is either unreachable from the UI (sections) or API-only
(cases — `test-authoring`'s soft-delete requirement has no button anywhere). Two other
in-flight changes reshape the ground this feature stands on:

- `add-project-rbac` (design D11) defines `caseDelete` — `DELETE /cases/{id}` — and
  `sectionDelete` — `DELETE /folders/{id}` — as two of its ten per-resource permission
  flags, enforced via `requirePermission(perm, resolver)` middleware. It also introduces
  this codebase's first destructive-confirmation dialog pattern (D12, "Reset roles to
  defaults"): a warning dialog whose copy states precisely what will be affected before
  a destructive action proceeds.
- `rename-folders-to-sections` renames the `Folder` concept to `Section` end-to-end
  (domain type, table, routes, UI).

This change is sequenced after both: it consumes the permission flags and dialog
pattern from the former, and uses the terminology from the latter throughout.

## Goals / Non-Goals

**Goals:**
- An explicit, off-by-default "delete mode" that gates every delete affordance in the
  Library view, so destructive actions are never one accidental click away.
- Deleting a section is safe to reason about: it soft-deletes its whole subtree
  (matching how case deletion already preserves history for referencing runs), never a
  hard `DELETE`.
- Permission-gated at the UI level (the control doesn't render at all without
  `caseDelete`/`sectionDelete`) in addition to the API-level enforcement
  `add-project-rbac` already provides — defense in depth, not a UI-only guard.

**Non-Goals:**
- Bulk/multi-select delete — this change is single-item delete (one case, or one
  section-and-its-subtree) per confirmed action. Bulk delete is a natural follow-up once
  this ships and is validated.
- New permission flags. `caseDelete`/`sectionDelete` already cover this; delete mode
  adds no new entry to `add-project-rbac`'s permission catalog.
- Un-deleting / trash / restore UI. The `deleted` flag makes the data recoverable at the
  DB level (same guarantee `test_cases.deleted` already gives), but a restore flow is
  out of scope here, same as it's out of scope for cases today.

## Decisions

**Cascading soft delete replaces reparent-on-delete for sections.**
The current `FolderRepo.Delete` (`apps/api/internal/store/folders.go`) reparents child
folders and cases to the deleted folder's parent, then hard-`DELETE`s the row. Once a
real delete UI exists, "delete" needs to mean delete — reparenting-on-delete was a
placeholder that was never exposed to a user. Replaced with: recursively soft-delete
(`deleted = true`) every section in the target's subtree and every case (at any depth)
under any of those sections, in one transaction. The root section stays non-deletable
(unchanged check).

**Add `deleted` to the section table, not a new `deleted_at`/tombstone table.**
Mirrors `test_cases.deleted boolean NOT NULL DEFAULT false` exactly — same column type,
same `WHERE NOT deleted` filtered-index pattern on the listing indexes
(`test_case_sections_project_idx`, `test_case_sections_parent_idx`). Considered a
separate soft-delete/audit table; rejected as unnecessary complexity when the existing
case pattern already solves this and audit history is separately covered by
`add-project-rbac`'s (and the base) audit log.

**Recursive subtree resolution happens in the store layer via a recursive CTE**, not
by loading the whole tree into Go and walking it — the section tree can be arbitrarily
deep (per `test-authoring`'s "folders can be nested to arbitrary depth"), and a
`WITH RECURSIVE` query finding every descendant section ID is both simpler and avoids
N+1 queries compared to walking parent/child links in application code.

**Delete mode is a client-only view state, not a persisted setting.**
Off by default every time the Library view is opened — considered persisting the
toggle (e.g. per-user preference) but rejected: the whole point is that delete
affordances require a deliberate action each session, not a one-time opt-in that then
silently stays on.

**Reuse `add-project-rbac`'s D12 confirmation dialog component** rather than building a
second one. Its copy is customized per call site (case: "Delete case '{title}'?";
section: "Delete section '{name}' and everything in it? This removes N case(s) and M
subsection(s)."), computed from the recursive subtree count before the dialog opens.

**Permission check is duplicated at the UI (hide control) and API (`requirePermission`)
layers**, not UI-only. The API-side check already exists as part of
`add-project-rbac`'s D11 enforcement matrix — this change's job is only to make the UI
respect the same flags for visibility, not to introduce new enforcement.

## Risks / Trade-offs

[Recursive soft-delete could silently touch far more cases than a user expects in a
deep tree] → the confirmation dialog states the exact subtree count (cases + sections)
computed server-side before the user confirms, not a generic warning.

[Soft-deleting a case that's mid-execution in an open run] → unchanged from today's case
soft-delete guarantee: the run still shows the pinned version's content (`test-authoring`
"Soft deletion protects run history"); this change doesn't alter that, only adds the UI
path to trigger it plus the same guarantee extended to cases removed via a section
cascade.

[Amending the core-domain migration a second time (once for the rename, once for this
column) could get confusing if the two changes are implemented out of order] → this
change's tasks explicitly assume `rename-folders-to-sections`'s migration edit has
already landed; its own migration task amends the post-rename table name
(`test_case_sections`), not `test_case_folders`.

[Coverage gates regress if the new recursive-delete path or dialog isn't fully
exercised] → task-level requirement to hit `make coverage-api`/`make coverage-web`
after implementation, same as every change in this repo.

## Open Questions

None outstanding — permission model, cascade scope, and soft-vs-hard delete were all
confirmed with the user during scoping.
