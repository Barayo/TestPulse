## Why

Today a test run has no lifecycle: it can be modified (results recorded,
items added, assignees changed) forever, with no notion of "this run is
done, stop touching it." This becomes a real problem once results are
attributed to real identities (`link-result-actor-to-identity`, proposed
alongside this change): if anyone can edit a run's results at any time,
"who actually executed this" has no stable meaning — a run needs a point
where its record of execution is sealed. This change introduces that seal:
an explicit open/closed status per run, closing off modification, with a
controlled, admin-only escape hatch to reopen when a genuine correction is
needed.

## What Changes

- Every run has a `status`, `open` or `closed`. Runs are created `open`.
- While `open`: results can be recorded, item status/assignee can be
  updated, and items can be added — exactly today's behavior.
- Once `closed`: all of the above are rejected (`409`) — a closed run is a
  sealed record.
- Any actor who can already record results on the run (`runRecordResult`
  permission) can close it — closing is the natural "I'm done" action, not
  a privileged one.
- **Only an actor with the `manageProject` permission can reopen a closed
  run** — the same per-project permission that gates renaming/archiving a
  project (add-project-rbac design.md D11); reopening is the privileged,
  should-be-rare action (undoing a seal), unlike closing.
- **BREAKING**: recording a result, updating item status/assignee, or
  adding an item to a *closed* run now fails where it previously succeeded.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `test-execution`: adds the run status field and the open/closed
  modification gate; existing requirements ("Append-only result log", "Run
  item status lifecycle", run item assignment, run creation) are amended to
  state they apply only to open runs. Adds two new requirements: run
  closing and manageProject-gated reopening.

## Impact

- **API**: `packages/shared/openapi.yaml` — `Run` schema gains `status`;
  new `POST /api/v1/runs/{runKey}/close` and `POST /api/v1/runs/{runKey}/reopen`
  (key-addressed, per `resource-keys` — `add-human-readable-keys` shipped
  since this proposal was first written).
- **Backend**: `apps/api/internal/domain` (`RunStatus` type on `Run`);
  migration amending `test_runs` (new column, per `CLAUDE.md`'s pre-1.0
  policy of amending the existing migration file for the domain area rather
  than stacking a new one); `RunRepo`/service methods to close/reopen and a
  guard checked before every existing mutating run-item operation; a new
  `ConflictError` (409) alongside the existing `ValidationError` (400) /
  `UnauthorizedError` (401) / `ForbiddenError` (403) taxonomy in `service`.
  Authorization is enforced the same way as every other route — the
  `requirePermission` middleware, `runRecordResult` for close and
  `manageProject` for reopen — not a manual role check inside the service
  (there is no single "admin" role any more; `add-project-rbac` replaced
  the old fixed Tester/Contributor/ProjectAdmin ladder with fully custom,
  per-project permission flags).
- **Frontend**: run execution board shows the run's status and a
  close/reopen control (reopen visible/usable only when the caller's
  effective permissions include `manageProject`, mirroring how other
  manageProject-gated project actions are shown/hidden); recording
  controls disable when the run is closed.
- **Downstream**: `link-result-actor-to-identity` depends on this — its
  "actor stays editable while the run is open" rule needs this status to
  exist first.
