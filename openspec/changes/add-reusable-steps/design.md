## Context

`domain.CaseContent.Steps` (`apps/api/internal/domain/domain.go`) is a
plain `[]Step` with no reference type — every case's steps are authored
inline, so a common sub-flow (e.g. "log in as admin") has to be
re-typed, and re-edited, in every case that uses it. Case content is
already immutable per version (`Service.CreateCase`/`Service.EditCase`,
`apps/api/internal/service/service.go`): every edit creates a new
`CaseVersion`, and a run pins each item to a specific version at creation
time — this reproducibility guarantee ("a run's results are internally
consistent," ROADMAP.md's v0.1 decisions) is a hard constraint any reuse
mechanism must not break.

The nearest existing precedent for a project-scoped authoring building
block is `CustomField` (`add-case-custom-fields`): simple mutable CRUD,
`manageProject`-gated writes, referenced by id/key from case content.
Shared step groups follow the same shape.

## Goals / Non-Goals

**Goals:**
- Let an author define an ordered step sequence once and reference it
  from multiple cases, with an explicit (never silent) way to pick up
  later edits to that sequence.
- Preserve case-version immutability and run reproducibility exactly as
  today — a saved case version's content never changes after the fact.
- One shared server-side resolution path for both the REST case-write
  routes and the MCP `upsert_test_case`/`upsert_step_group` tools, so
  there's no risk of the two diverging.

**Non-Goals:**
- Step-group versioning/history of its own (its edit history is the
  existing generic audit log, like folders/custom fields).
- Cross-project sharing (project-scoped only, matching every other
  case-authoring building block).
- Fine-grained per-group permissions beyond project-level `manageProject`.
- A dedicated "extract" REST endpoint (client-side composition instead).

## Decisions

### Snapshot-at-save, not live reference
A `Step` entry carrying `GroupRef` is resolved to the referenced group's
*current* steps at the moment a case version is saved
(`CreateCase`/`EditCase`), and that resolved content is what's persisted
into `CaseVersion.Content.Steps` — permanently, like every other field on
an immutable version. Editing the source `StepGroup` later has *zero*
effect on any case version already saved, including ones currently
referenced by open or closed runs.

**Alternative considered**: resolve `GroupRef` at read time (the group's
current content is fetched live whenever a case/run item is displayed).
Rejected — this is exactly the "run results stay reproducible" guarantee
this project has already committed to; a run's displayed steps would
silently change if someone edited an unrelated shared group weeks later,
which is a correctness regression, not a convenience.

### Staleness is tracked, refresh is explicit
Because resolution happens at save time, a case version can drift behind
its source group's current content. `Step.GroupRef.SnapshotUpdatedAt`
records the group's `updatedAt` at snapshot time. The case *editor*
(never the read-only view, which only ever shows what's actually saved)
compares this against the group's live `updatedAt` and — only while
actively editing that case, i.e. about to create a new version anyway —
surfaces a "refresh" affordance. Refreshing re-resolves that one
`GroupRef` entry's steps from the group's current content and updates
`SnapshotUpdatedAt`; nothing is written until the author saves the case
edit, same as any other field change.

### Server always re-resolves; never trusts a client-sent snapshot
A client (web UI or MCP caller) never sends resolved step content for a
`GroupRef` entry — only `{groupKey, action: "reference"}`-shaped input.
`CreateCase`/`EditCase` (and the MCP tools that call into the same
service methods) look up the referenced `StepGroup` server-side and
build the persisted `Steps` themselves. This closes an integrity gap a
naive client-snapshot design would open: a client could otherwise send an
arbitrary "snapshot" claiming to be from a group it doesn't actually
reflect (stale, tampered, or referencing a group in a different project
it can't otherwise read) and have it persisted as if genuine.

### One resolution path shared by REST and MCP
`Service.CreateCase`/`Service.EditCase` gain the `GroupRef`-resolution
step internally — both the REST handlers and the MCP `upsert_test_case`
tool call these same methods, so there is exactly one place this logic
lives. The new `upsert_step_group` MCP tool and the REST
`step-groups` routes both call a new `Service.UpsertStepGroup`, mirroring
how `upsert_test_case` already wraps `CreateCase`/`EditCase`.

### Group deletion: soft delete, detach-on-edit
Deleting a `StepGroup` is a soft delete (matching `Folder`/`TestCase`) —
it disappears from the picker and admin list, but already-saved case
versions are completely unaffected (their content is already resolved
and persisted). If an author later edits a case whose *current* content
still carries a `GroupRef` to a since-deleted group, the editor can't
refresh (nothing to refresh from) and instead offers "detach": convert
that block from a `GroupRef` entry back into plain inline `Step` entries
using its last-known-snapshotted content, so editing can continue without
data loss.

## Risks / Trade-offs

- **[Risk]** A case editor that doesn't refresh before saving silently
  keeps stale content forever (the whole point of "explicit, not
  automatic" — but the failure mode of skipping the explicit step is the
  same as the status quo today: no worse than not having reuse at all).
  **Mitigation**: none needed beyond the visible staleness pill — this is
  the deliberate trade-off of choosing explicit refresh over live
  propagation (see Decisions above).
- **[Risk]** `GroupRef` step entries expand to a variable number of steps,
  so a case's total step count isn't knowable from its `Steps` array
  length alone until resolved. Any UI or MCP consumer counting steps by
  array length undercounts.
  **Mitigation**: resolution happens server-side before a version is ever
  persisted — `CaseVersion.Content.Steps` (what's actually read back) is
  always the fully-expanded, flat list; only the *unsaved, in-progress
  editor state* (client-side) briefly represents a `GroupRef` as one
  entry before save.
- **[Trade-off]** No REST "extract" endpoint means the client performs two
  requests (create group, then update case) instead of one atomic
  operation — a failure between the two leaves an orphaned group with no
  case referencing it yet. Accepted: an orphaned, unreferenced group is
  harmless (visible in the admin list, deletable), and matches this
  proposal's explicit scope decision to avoid a bespoke endpoint for a
  client-composable operation.

## Migration Plan

No data migration for existing cases — `GroupRef` is a new optional field
on `Step`; every existing case's steps simply have it unset (a plain step,
exactly as before). New migration file adds the `step_groups` table only
(`apps/api/internal/db/migrations/`, incremental, per this project's
permanent migration policy). Rollback is a normal revert; the new table
is additive and never referenced by anything until this change's other
commits land in the same deploy.

## Open Questions

None outstanding — decisions above were made and approved during
brainstorming before this document was written.
