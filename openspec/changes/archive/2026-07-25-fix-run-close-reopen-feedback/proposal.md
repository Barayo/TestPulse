## Why

Closing (or reopening) a run in the UI works correctly server-side —
`PATCH`/`POST` succeeds immediately — but the status badge doesn't reflect
it for several seconds. Root cause, found while dogfooding the first real
CI-imported run (`TD-R1`): `closeRun`/`reopenRun` in `RunPage.tsx` await a
full reload of three separate endpoints (run, items, summary) before
updating any state, so the badge is gated behind the slowest of three
round trips instead of the one write that actually matters. The page also
never calls `bumpDataRevision()`, unlike every other mutating page
(`SuitesPage`, `FolderExplorerPage`), so other views showing this run's
status lag even further. Nothing tells the user the action is in flight,
so a slow response reads as broken, not busy.

## What Changes

- `closeRun`/`reopenRun` update the run's status as soon as the write
  succeeds, instead of waiting on a 3-way `Promise.all` of run+items+summary.
- Both actions call `bumpDataRevision()` on success, matching the pattern
  already used by every other mutating page.
- The Close/Reopen button shows a disabled "Closing…"/"Reopening…" state
  while its request is in flight.
- New test coverage for the negative paths this lacked: a generic failure
  (button re-enables, existing error message shows) and a session-expiry
  401 mid-request (the existing session-expired modal opens, per
  `handle-session-expiry`, rather than a generic run-lifecycle error).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `test-execution`: "Closing a run" and "Reopening a closed run requires
  project-admin permission" gain scenarios for in-flight UI feedback and
  the two negative paths above.

## Impact

- `apps/web/src/pages/RunPage.tsx` — `closeRun`, `reopenRun`, and their
  button rendering.
- `apps/web/src/pages/RunPage.test.tsx` (or equivalent) — new negative-path
  tests.
- `apps/web/e2e/test-execution.spec.ts` — scenario coverage for the two
  new spec scenarios.
- No API/schema changes — the close/reopen endpoints already behave
  correctly; this is entirely client-side.
