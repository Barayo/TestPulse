## Context

A run item's `content.steps` is a pinned, frozen copy of the case version's
steps (`test_case_versions.steps` jsonb), fixed for that run item's entire
lifetime. Execution today records exactly one `Result` per attempt — one
`verdict`, one comment, one set of attachments — with no way to say which
individual step broke. Steps are already rendered read-only during
execution (`CaseContentView` → `CaseStepsList`), and shared step-groups
(add-reusable-steps) are already resolved server-side into a flat step
array before a case is saved, so a run item's steps are always a simple,
already-flattened list by the time execution sees them.

## Goals / Non-Goals

**Goals:**
- Let a tester mark each step pass/failed/skipped/blocked, independently
  of the item's overall verdict, persisted immediately (not batched).
- Preserve every past attempt's step marks as an immutable historical
  snapshot, alongside its `Result`.
- Keep marking fully optional and backward compatible — every existing
  run item, with zero steps ever marked, behaves exactly as before.
- Extend the REST contract (`NewResult.stepResults`) so a non-interactive
  caller (future agent/import) can submit step verdicts atomically with
  the overall verdict, even though this change's own UI doesn't use that
  path yet.

**Non-Goals:**
- No auto-derivation of the overall verdict from step verdicts.
- No MCP tool wiring (issue #187, deferred).
- No support for Gherkin/text-format case content (no discrete steps).
- No editable step-marking on `CaseDetailPage` (authoring, not execution).
- No step-level history beyond what's captured per-`Result` (no separate
  "step edit log").

## Decisions

**Step identity is the array index, not a new ID.** A run item's
`content.steps` never changes after the item is created (it's a pinned
snapshot), so a step's position in that array is already a stable,
sufficient identifier. This avoids adding IDs to `domain.Step` or
migrating `test_case_versions.steps`' jsonb shape at all — the new tables
below just reference `(run_item_id, step_index)` /
`(result_id, step_index)`. Applies uniformly to a step that's part of a
resolved step-group block — those steps already sit at fixed indices in
the flattened array, so no group-aware logic is needed anywhere in this
feature.

**Two new tables, separating "live" from "historical" state**, mirroring
the existing `test_run_results` / `result_attachments` split:
- `test_run_item_step_states (run_item_id, step_index, verdict,
  updated_at)`, PK `(run_item_id, step_index)` — the mutable, carry-forward
  "current" mark per step. Upserted by the new incremental endpoint.
  Scoped to `run_item_id` (not `case_id`), so a fresh run of the same case
  always starts with a clean slate — nothing here is case-level state.
- `test_run_result_steps (result_id, step_index, verdict)`, PK
  `(result_id, step_index)` — an immutable snapshot written once, atomically
  with each new `Result`, never updated afterward.

Alternative considered: a single mutable table with a `result_id` FK,
updated in place and "closed off" when a new `Result` is recorded. Rejected
because it conflates two different lifetimes (live vs. historical) in one
table and makes the immutability guarantee implicit rather than structural
— a stray `UPDATE` could silently corrupt history. Two tables make "past
Results never change" a schema-level fact.

**Incremental persistence, not batched with the overall verdict.** New
`PUT /api/v1/run-items/{itemId}/steps/{stepIndex}` (body: `{verdict}`)
upserts one row into `test_run_item_step_states`, validating `stepIndex`
against the item's pinned `content.steps` length and `verdict` against the
same 4 values `ParseVerdict` already accepts. This means a tester working
through a long case never loses progress to a refresh — each click is
already durable before the overall verdict is ever recorded.

**`RecordResult` snapshots step state, with two input paths.**
`domain.NewResult` gains an optional `StepResults []StepResult` field:
- Supplied (future agent/import path): `RecordResult` uses it verbatim as
  the new `Result`'s snapshot, and upserts the same values into
  `test_run_item_step_states` so carry-forward state stays consistent with
  what was just reported — a caller reporting `stepResults` shouldn't leave
  stale marks behind for the next retest.
- Omitted (this change's interactive UI): `RecordResult` reads whatever
  currently sits in `test_run_item_step_states` for the item and copies it
  into the new `Result`'s snapshot as-is. Both the snapshot write and (in
  the omitted case) the read happen inside the same transaction that
  creates the `Result` row, so a snapshot always reflects a consistent
  point in time.

Both writes for a given `RecordResult` call happen in one DB transaction
(matching how `Result` + `result_attachments` are already created
together) — a `Result` is never left without its step snapshot half-written.

**Carry-forward, not reset, after recording.** `test_run_item_step_states`
is untouched by `RecordResult` (except when the caller-supplied path above
explicitly syncs it) — a retest only requires touching the steps that
actually changed, rather than re-marking a whole case from scratch.

**Frontend: a dedicated `ExecutionStepsList.tsx`, not a third mode on
`CaseStepsList`.** `CaseStepsList` already carries view/editable/bare
modes and step-group insert/extract/select logic; adding execution-only
per-step marking controls would further overload an already-dense shared
component. A separate, execution-only component keeps `CaseStepsList`
focused on authoring/display and lets the marking UI evolve independently.
Approved visual design (Pepe, mock reviewed and approved): a compact
single-letter `P F B S` segmented pill per step, reusing the exact
shortcut letters `RunItemDetailPage`'s own keyboard-shortcuts hint already
teaches (p/f/b/s for the overall verdict) rather than inventing new icons.
Colors reuse existing tokens verbatim (pass → the existing step-number
badge tint; fail and blocked → the existing destructive tint, matching how
`StatusBadge` already treats them identically; skip → the existing
"stale"-badge secondary tint) — no new visual language.

**History summary reuses the existing disclosure pattern.** The
`<details>/<summary>` idiom already used by `CaseSidebarSection` renders
each past `Result`'s step snapshot, collapsed by default:
`"{marked}/{total} steps marked"` plus `" · {failed} failed"` /
`" · {blocked} failed"` only when count > 0, omitted entirely when zero
steps were marked (so results recorded before this feature, or without
touching any step, show no new noise).

## Risks / Trade-offs

- **Two new tables for what's conceptually one small feature** → accepted:
  keeping "live" and "historical" state in separate tables is what makes
  "a past Result's step snapshot never changes" a schema guarantee rather
  than an application-level promise; the alternative (one table, more
  complex state machine) is more error-prone, not simpler.
- **`StepResults` on `NewResult` has no producer in this change** (the
  interactive UI never sends it) → accepted per explicit product decision:
  the REST contract is deliberately completed now so a future agent/import
  path (tracked as #187 for MCP specifically) doesn't require another
  schema/migration round-trip later. Covered by a service-level test even
  though no UI exercises it yet.
- **Step index stability depends on `content.steps` truly never changing
  post-pin** → already guaranteed by the existing run-item-pinning
  invariant (`test-execution`'s "Run creation pins case versions"
  requirement); this design adds no new risk here, just relies on an
  existing one.

## Migration Plan

Additive only: two new tables via a new incremental migration file
(`apps/api/internal/db/migrations/`), no changes to existing tables/columns.
No backfill needed — every existing run item simply has zero rows in
`test_run_item_step_states` and zero rows in `test_run_result_steps` for
its existing `Result`s, which is indistinguishable from "no steps marked
yet," the correct default. Rollback is dropping both new tables; no other
schema depends on them.
