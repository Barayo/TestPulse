## Context

`test_runs` currently has no status column (`apps/api/internal/db/migrations/00002_core_domain.sql`);
`domain.Run` is `{ID, ProjectID, Name, CreatedAt}`. Every run-item mutation
(`AddRunItem`, `RecordResult`, `SetItemStatus`, `AssignItem` in
`apps/api/internal/store/runs.go`) is unconditional today. This change adds
the missing state machine and is a direct prerequisite for
`link-result-actor-to-identity`, whose "actor editable only while the run is
open" rule needs somewhere to hang.

## Goals / Non-Goals

**Goals:**
- A run has exactly two states, `open` and `closed`, with well-defined
  transitions.
- Closing is available to anyone who could already write to the run;
  reopening is admin-only.
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
authorization rules (anyone-who-can-write vs. admin-only), so collapsing
them into one endpoint would just push that asymmetry into conditional
logic inside a single handler. Two small, single-purpose endpoints are
clearer and match this codebase's existing pattern of specific action
endpoints (`/close`, `/reopen`) alongside generic `PATCH` for simple field
updates elsewhere (e.g. `PATCH /api/v1/users/{userId}`).

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
  no UI signal); the error message names the run and points at "ask an
  admin to reopen it."
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
   the three existing mutating run-item methods.
3. `ConflictError` + `respond()` mapping, then the two new endpoints.
4. Web: status badge + close/reopen controls on the run board, admin-gated
   reopen.

## Open Questions

- None — scope is deliberately small (see Non-Goals).
