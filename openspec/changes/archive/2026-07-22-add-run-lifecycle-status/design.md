## Context

`test_runs` currently has no status column (`apps/api/internal/db/migrations/00002_core_domain.sql`);
`domain.Run` is `{ID, Key, ProjectID, ProjectKey, Name, CreatedAt}` (the
`Key`/`ProjectKey` fields shipped since this proposal was first written —
see `add-human-readable-keys`; routes are `{runKey}`-addressed
accordingly). Every run-item mutation (`AddRunItem`, `RecordResult`,
`SetItemStatus`, `AssignItem` in `apps/api/internal/store/runs.go`) is
unconditional today. This change adds the missing state machine and is a
direct prerequisite for `link-result-actor-to-identity`, whose "actor
editable only while the run is open" rule needs somewhere to hang.

## Goals / Non-Goals

**Goals:**
- A run has exactly two states, `open` and `closed`, with well-defined
  transitions.
- Closing is available to anyone who could already write to the run
  (`runRecordResult` permission); reopening requires `manageProject`, the
  project-scoped "admin-level action" permission (there is no single,
  instance-wide "admin" role any more — see D2).
- Every existing mutating run-item operation is rejected once the run is
  closed, with a clear, distinct-from-validation error.

**Non-Goals:**
- No automatic/scheduled closing (e.g. "close after N days idle") — manual
  only, for now.
- No closing reason/audit note beyond what the existing audit log already
  captures (actor + action + timestamp) — a free-text "why reopened" field
  is a plausible future refinement, not required here.
- No cascading lock on the *run itself* (renaming a run, or the run's own
  metadata) — this change only gates run-*item* mutations (results, status,
  assignee, adding items), matching where the "who executed this, and is it
  final" concern actually lives.

## Decisions

### D1: Two states, not a richer workflow (no `draft`/`archived`/etc.)
`open` → `closed` → (admin) → `open` is the whole state machine. A richer
status set (e.g. distinguishing "closed" from "archived") is speculative
complexity with no current use case — YAGNI, matching this repo's general
bias against premature generalization.

### D2: Closing is a normal write; reopening is a distinct, privileged action
Modeled as two separate service methods/endpoints (`CloseRun`, `ReopenRun`)
rather than one generic `PATCH .../status` — the two actions have different
authorization rules (`runRecordResult` vs. `manageProject`), so collapsing
them into one endpoint would just push that asymmetry into conditional
logic inside a single handler. Two small, single-purpose endpoints are
clearer and match this codebase's existing pattern of specific action
endpoints (`/close`, `/reopen`) alongside generic `PATCH` for simple field
updates elsewhere (e.g. `PATCH /api/v1/projects/{projectKey}`).

Authorization for both is plain `requirePermission` middleware, exactly
like every other route in this codebase — `close` gated on
`domain.PermRunRecordResult` (the same permission needed to record a
verdict, matching "anyone who can already write to the run"), `reopen`
gated on `domain.PermManageProject` (the same permission that gates
renaming/archiving a project — the closest existing "this is a
project-admin-level action" concept). Neither service method performs its
own role check; this design originally assumed a single fixed "admin"
role that no longer exists — `add-project-rbac` replaced the
Tester/Contributor/ProjectAdmin ladder with fully custom, per-project,
per-resource permission flags (its design.md D10/D11), and every other
route in this codebase authorizes via those flags at the routing layer,
not inside the service.

### D3: A closed run rejects with a new `ConflictError` (409), not `ValidationError` (400)
"This run is closed" is not a problem with the request's *shape* (400) — the
identical request would have succeeded a moment before the run closed. It's
a conflict between the request and the resource's current state, which is
exactly what HTTP 409 means. `service.ConflictError` joins the existing
`ValidationError`/`UnauthorizedError`/`ForbiddenError` trio, mapped in
`server`'s `respond()` the same way.

### D4: The gate lives in the service layer, checked once per mutating call, not in the store
Each of `RecordResult`, `AddRunItem`, `UpdateItem` (service.go) fetches the
run's status (or the store methods return enough context to check it) before
delegating to the store, returning `ConflictError` if closed. This keeps
the invariant in one layer (matching where every other business rule in
this codebase lives — the store stays a thin persistence layer) rather than
duplicating the check in both store and service.

**Alternative considered**: enforce via a DB trigger/constraint on
`test_run_items`/`test_run_results` referencing `test_runs.status`.
Rejected — this codebase's existing invariants (e.g. immutable case
versioning) are enforced in Go, not triggers (the one existing trigger,
`create_project_root_folder`, is a structural default-row creator, not a
business-rule gate); consistency of approach matters more than the
marginal race-safety a DB-level check would add at this scale.

## Risks / Trade-offs

- **[Risk] A run closed mid-execution blocks a tester who didn't realize it
  was closed** → Mitigation: the run board surfaces status prominently and
  disables recording controls when closed (not just a server-side 409 with
  no UI signal); the error message names the run and points at "ask a
  project admin to reopen it."
- **[Trade-off] No audit trail of *why* a run was reopened** → Accepted per
  Non-Goals; the existing audit log still captures *that* it was reopened,
  by whom, and when.

## Migration Plan

1. Amend `00002_core_domain.sql`'s `test_runs` table: add
   `status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed'))`
   (per `CLAUDE.md`: amend in place, this is the same domain area's
   migration, not a new one). Existing runs default to `open` — the correct
   backward-compatible value pre-1.0.
2. Store/service layer: `RunRepo.Close`/`Reopen`, status check wired into
   the three existing mutating run-item service methods.
3. `ConflictError` + `respond()` mapping, then the two new key-addressed
   endpoints (`POST /api/v1/runs/{runKey}/close`, `.../reopen`), gated by
   `requirePermission` like every other route.
4. Web: status badge + close/reopen controls on the run board, reopen
   shown/enabled only when the caller's effective permissions include
   `manageProject`.

## Open Questions

- None — scope is deliberately small (see Non-Goals).
