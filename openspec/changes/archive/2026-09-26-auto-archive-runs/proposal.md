## Why

As a Tenant Admin, when a project accumulates hundreds of old, finished
runs, I want old ones to declutter out of the default run list
automatically, without permanently losing them, so the list stays usable
without resorting to the destructive, irreversible run-retention policy
(issue #44).

Runs today have no archive concept at all — unlike projects, which already
support manual archive/unarchive (with its own settings-page toggle and a
collapsed "Archived" section on the Projects list) *before*
`ProjectAutoArchiveWorker` was layered on top as pure automation. Building
"auto-archive runs by age" faithfully means building that same foundation
first: this change adds manual run archive/unarchive, then the automatic
age-based worker on top of it — not just the worker in isolation.

## What Changes

- A run gains an `archived` flag, toggleable via a new pair of actions
  (mirroring `close`/`reopen`'s shape): `POST /runs/{runKey}/archive` and
  `POST /runs/{runKey}/unarchive`.
- The Runs list page gains a collapsed "Archived" section, splitting
  active/archived runs client-side — the same pattern the Projects list
  already uses for archived projects.
- A new Tenant-Admin-configurable instance setting,
  `runAutoArchiveInactiveDays` (0 = off, matching every other retention/
  archive threshold's default), drives a new background worker
  (`RunAutoArchiveWorker`) that automatically archives eligible runs —
  mirroring `ProjectAutoArchiveWorker`'s shape, not `ProjectDeletionWorker`'s
  (archiving is a cheap `UPDATE`, no batching needed).
- Eligibility is **closed, non-archived runs whose `createdAt` is older
  than the threshold** — simpler than `ProjectAutoArchiveWorker`'s
  multi-table "last activity" signal, because a closed run is already
  read-only (`add-run-lifecycle-status`): unlike a project, it cannot
  receive new activity after closing, so its own creation date is a
  sufficient and correct age signal on its own (see design.md).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `test-execution`: adds manual run archive/unarchive alongside the
  existing close/reopen lifecycle, and a new "Automatic run archiving"
  requirement sibling to the existing "Automatic run retention" one.

## Impact

- **Backend**: new migration (`test_runs.archived`,
  `instance_settings.run_auto_archive_inactive_days`); `domain.Run`,
  `domain.InstanceSettings`; `RunRepo` (Archive/Unarchive/
  ListEligibleForAutoArchive); `Service` (ArchiveRun/UnarchiveRun); new
  `RunAutoArchiveWorker`; two new API routes; `main.go` worker wiring.
- **Frontend**: `RunsPage.tsx` (archived section, mirroring
  `ProjectsPage.tsx`'s own), `RunPage.tsx` (archive/unarchive actions,
  mirroring close/reopen), `InstanceSettingsPage.tsx` (new threshold
  field, mirroring the existing two). A Pepe UI pass precedes any frontend
  code, per this project's standing rule.
- **Docs**: `docs/test-management.md` (mirrors its own existing
  "Run retention" section), `docs/deployment.md` (worker failure-logging
  list already anticipates new workers being added there).
- **Sample Project**: `seed.go` gets at least one already-archived run,
  demonstrating the new list section (CLAUDE.md's standing showcase rule).
