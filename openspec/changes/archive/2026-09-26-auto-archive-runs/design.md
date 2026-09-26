## Context

Runs have `status` (`open`/`closed`, `add-run-lifecycle-status`) but no
`archived` concept at all — confirmed via `domain.Run`'s fields and
`test_runs`' schema (`apps/api/internal/db/migrations/00001_baseline.sql`):
`id`, `key`, `project_id`, `name`, `status`, `created_at`, `suite_id`. No
archive column, no store method, no route, no UI.

Projects, by contrast, already had manual archive/unarchive (its own
`Archive`/`Unarchive` store methods, a Settings-page toggle, a collapsed
"Archived" section on the Projects list) *before* `add-data-retention`
added `ProjectAutoArchiveWorker` as pure automation on top. Issue #44 asks
for the run equivalent of that worker, but the manual foundation it would
sit on doesn't exist yet — this change builds both, in that order.

`RunRetentionWorker` (`add-data-retention` D8) already establishes the
precedent for run-level automatic sweeps: one instance-wide `0`-means-off
threshold, eligibility scoped to **closed** runs only, age measured from
the run's own `created_at` — no richer "last activity" signal, because
(unlike a project) a closed run is read-only (`add-run-lifecycle-status`:
recording a result, updating status/assignee, or adding an item are all
rejected with 409 once closed) and therefore cannot generate new activity
after the fact. `ProjectAutoArchiveWorker` (D9) needed a computed
multi-table activity signal specifically because a project stays
perpetually mutable; that reasoning doesn't transfer here, so this change
doesn't need it either.

## Goals / Non-Goals

**Goals:**
- A run can be manually archived and unarchived, mirroring the
  close/reopen action pair's shape (dedicated endpoints, not a generic
  PATCH) and the Projects list's archived-section UX exactly.
- A Tenant Admin can configure an instance-wide age threshold (`0` = off)
  that automatically archives eligible closed runs, via a new independent
  background worker.

**Non-Goals:**
- No automatic *deletion* of runs by this change — that's
  `RunRetentionWorker`'s existing, separate policy; this is strictly the
  softer, reversible alternative the issue asks for.
- No per-project override or exemption flag (unlike
  `ProjectAutoArchiveExempt`) — no signal yet that any project needs to
  opt out of an *archiving* (non-destructive) policy the same way a
  project might need to stay unarchived for visibility reasons. Add one
  later if a real need surfaces; YAGNI for v1.
- No computed "last activity" eligibility signal — see Context; a closed
  run's own `createdAt` is sufficient and correct, not a simplification
  that loses accuracy.
- No archiving of *open* runs by the automatic worker — an open run may
  still be actively worked; only closing it makes it eligible (mirrors
  `RunRetentionWorker`'s identical rule). Manual archive has no such
  precondition (see D2).

## Decisions

### D1: `test_runs.archived boolean DEFAULT false NOT NULL` + `instance_settings.run_auto_archive_inactive_days integer DEFAULT 0 NOT NULL`
New migration, additive columns only. Same `0`-means-off convention as
every other retention/archive threshold in this codebase
(`runRetentionDays`, `autoArchiveInactiveDays`) — no nullable column, no
new sentinel value to special-case.

### D2: Manual archive/unarchive has no status precondition; the automatic worker only ever touches closed runs
A Tenant/Project Admin choosing to manually archive a run is a deliberate,
reversible, one-off decision — same trust level as manually archiving a
project (no precondition there either). The *automatic* policy is more
conservative by design (mirrors `RunRetentionWorker`'s own open-run
carve-out): only closed runs are ever swept, so an actively-worked run is
never hidden out from under its team without a human choosing that.

### D3: `Service.ArchiveRun`/`UnarchiveRun`, gated by `PermManageProject` — not `PermRunRecordResult` (close's bar) or a new permission flag
Archiving changes a run's visibility/lifecycle in a way closer to a
project-level administrative action than routine test execution — matches
how project archive/unarchive is already gated (`Manage Project`'s own
documented scope: "rename, description, archive"). Reusing this existing
permission, rather than `runDelete`/`projectDelete` (`add-data-retention`
D3, deliberately narrow and destruction-specific) or introducing a new
flag, avoids growing the permission model for an action that fits an
existing one's stated purpose exactly.

### D4: `RunAutoArchiveWorker` mirrors `ProjectAutoArchiveWorker`'s shape exactly, not `ProjectDeletionWorker`'s
`Sweep(ctx) (archived int, err error)`, a `Run(ctx)` ticker loop, same
`Interval` pattern (an hour by default) — archiving is a cheap `UPDATE`,
no chunked batching needed (unlike `ProjectDeletionWorker`'s cascading
purge). A fourth, independent worker rather than folding into
`RunRetentionWorker`: different population (non-archived closed runs vs.
runs eligible for permanent deletion), different independently-configurable
threshold — folding them in would make every retention tick also pay for
an archive-eligibility scan the instance might not have enabled, and vice
versa. Audited via the existing `system` `ActorKind` pattern, actor ID
`"run-auto-archive-worker"` — distinct from `"retention-worker"` and
`"auto-archive-worker"` (the project one) so all three automated
processes stay independently attributable in the audit log.

### D5: `RunRepo.ListEligibleForAutoArchive(ctx, days) ([]domain.Run, error)` — a pure age filter, mirroring `ListEligibleForRetention`'s existing shape
```sql
SELECT id, key, project_id, name, status, created_at
FROM test_runs
WHERE status = 'closed' AND archived = false
  AND created_at < now() - make_interval(days => $1)
```
Callers (the worker) are responsible for treating `days == 0` as
"policy off" before calling this — same contract `ListEligibleForRetention`
already uses, kept consistent rather than pushed into the query itself.

### D6: Frontend — collapsed "Archived" section on `RunsPage.tsx`, mirroring `ProjectsPage.tsx`'s pattern exactly; archive/unarchive buttons on `RunPage.tsx` beside close/reopen
No backend list-filtering param needed: like Projects, the run list
endpoint returns every run (archived field included), and the frontend
splits `active`/`archived` client-side — `RunsPage.tsx` already computes
`open`/`closed` groups the same way, so this is one more filter, not a new
pattern. A Pepe UI-design pass happens before this task is implemented
(this project's standing rule for any UI change), producing the actual
visual treatment; this decision fixes the *data flow*, not the pixels.

## Risks / Trade-offs

- **A run manually archived, then automatically un-eligible forever**
  (once archived, `ListEligibleForAutoArchive`'s `archived = false` filter
  naturally excludes it) → Not a risk, this is correct: archiving (by
  either path) is a terminal state for the sweep's purposes; unarchiving
  is the only way back, exactly as intended.
- **Two independent age-based run policies (retention deletes, this
  archives) could confuse an admin about which wins** → They don't
  conflict: retention deletion is unconditional on a closed run's age
  regardless of `archived`, so a run past *both* thresholds is deleted
  (the more consequential policy), not left in an ambiguous
  archived-then-deleted limbo — this matches how the two thresholds are
  already independently documented in `docs/test-management.md`.

## Migration Plan

New migration, additive columns with safe defaults (`archived = false`,
`run_auto_archive_inactive_days = 0`) — no backfill needed, no behavior
change for any existing instance until a Tenant Admin opts in. Rollback is
reverting the commit (the migration-policy gate prevents editing it in
place after merge, per CLAUDE.md).
