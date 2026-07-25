## Context

`RunPage.tsx` mutates run state via `closeRun`, `reopenRun`, `recordVerdict`,
and `markRetest`. All four follow the same shape: write, then re-fetch via
`load()` or `refreshSelected()`, each of which `Promise.all`s multiple GET
endpoints and only commits state once every one of them resolves. Found
while dogfooding the first real CI-imported run: closing it took several
visible seconds to reflect in the badge, even though the server-side
`UPDATE test_runs SET status = 'closed'` (`store/runs.go`) returns
immediately.

## Goals / Non-Goals

**Goals:**
- The status badge reflects a close/reopen the moment the write succeeds,
  not after a full page reload.
- Other views that show this run's status (e.g. project landing) invalidate
  correctly, via the `bumpDataRevision()` convention already used by
  `SuitesPage` and `FolderExplorerPage`.
- The button communicates in-flight state instead of looking unresponsive.
- A session-expiry 401 during either action surfaces the existing
  session-expired modal, not a generic run-lifecycle error.

**Non-Goals:**
- `recordVerdict`/`markRetest` have the identical over-fetching shape, but
  are out of scope here — this change fixes what was actually reported
  (close/reopen). A follow-up can apply the same fix there if the pattern
  proves out.
- No backend changes — the close/reopen endpoints are already correct and
  synchronous.

## Decisions

- **Update `run.status` directly from the close/reopen response instead of
  re-fetching the run.** The `PATCH`/`POST` handlers already return nothing
  new to react to beyond success — `run.status` is a local field we own optimistic-safely; on failure, the code already falls back to the existing
  error path and never touched `run.status`, so there's no rollback to
  manage. Rejected alternative: fetch only `GET /runs/{key}` after success
  (still correct, still faster than the 3-way `Promise.all`) — not chosen
  because it's a strictly slower, still-a-network-round-trip version of the
  same fix for no added correctness.
- **Add `bumpDataRevision()` after both actions**, matching the existing
  convention (`SuitesPage.tsx`, `FolderExplorerPage.tsx`) rather than
  inventing a new invalidation mechanism.
- **Disabled "Closing…"/"Reopening…" button state**, driven by a local
  `isClosing`/`isReopening` boolean already implied by the existing
  `async` handler shape — no new state management pattern needed.
- **Session-expiry during close/reopen**: no new code path required — the
  existing `sessionExpiryMiddleware` (`api.ts`) already fires on any `401`
  except `/auth/login`/`/auth/logout`, and it's currently untested against
  this specific action. This change adds the missing test coverage rather
  than new plumbing.

## Risks / Trade-offs

- [Risk] Updating `run.status` locally on success without re-fetching could
  drift from the server if two actors race to close/reopen the same run
  concurrently → Mitigation: the server remains authoritative on the next
  full page load; a lifecycle status doesn't have a scenario for
  low-consequence transient staleness like this, and the endpoint returns
  `409`/`403` on conflicting writes, which already surfaces via the
  existing error path.
