## Why

`add-identity-basics` established a real `Actor` (authenticated user or
agent token) for every request, used by the audit log. But the pre-existing
test-execution flow for recording a run result
(`POST /api/v1/items/{itemId}/results`) still takes an arbitrary,
client-supplied `actor` string, completely disconnected from who is
actually authenticated. A result's "who executed this" has no identity
guarantee behind it. This change closes that gap: the actor is derived from
the authenticated caller by default, remains correctable while the run is
still open, and is permanently sealed once the run closes — which is why
this depends on `add-run-lifecycle-status` landing first.

## What Changes

- Recording a result no longer *requires* a client-supplied `actor` — it
  defaults to the authenticated caller (their display name, plus a real
  link to the user or agent token behind it).
- The client MAY still explicitly pass `actor` to override the recorded
  display name (e.g. an agent recording a result on behalf of a named human
  tester who isn't the API caller) — but only while the run is open. Once
  the run is closed, no new results can be recorded at all
  (`add-run-lifecycle-status`), which is what actually seals the actor
  value; no separate enforcement is needed here.
- Every result additionally stores which real actor (if any) is behind it —
  `actorKind`/`actorRef` alongside the existing free-text display name —
  denormalized the same way `audit_log` already does, so history survives
  the actor's own deletion.
- Existing results recorded before this change have no real actor behind
  them; they display their original free-text value with `actorKind`
  `unknown` rather than an error or a fabricated identity.
- **BREAKING**: `actor` moves from required to optional in the
  `POST /api/v1/items/{itemId}/results` request body (a required→optional
  field is additive at the JSON level, but the *meaning* changes: omitting
  it no longer produces a validation error, it produces the authenticated
  caller).

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `test-execution`: the "Append-only result log" requirement's "Actor is
  required" scenario is replaced — actor is now derived, not required —
  and gains scenarios for the override, the real-actor link, and the
  `unknown` fallback for pre-existing data.

## Impact

- **Dependency**: requires `add-run-lifecycle-status` (the open/closed gate
  is what actually makes a recorded actor immutable after the fact — this
  change does not duplicate that enforcement).
- **API**: `packages/shared/openapi.yaml` — `NewResult.actor` becomes
  optional; `Result` schema gains `actorKind` (`user`/`agent`/`unknown`) and
  a real actor reference.
- **Backend**: migration amending `test_run_results` (new nullable
  `actor_kind`/`actor_ref_id` columns, backfilled `unknown` for existing
  rows — per `CLAUDE.md`'s pre-1.0 policy of amending the domain area's
  existing migration file); `RecordResult` service method resolves the
  actor from `context.Context` (the same `domain.ActorFromContext` used for
  audit logging) when the client omits `actor`.
- **Frontend**: the run board's result-recording control drops the
  now-unnecessary "who executed this" free-text input for the common case
  (it's implicit), keeping an optional override field for the
  agent-recording-on-behalf-of-a-human case.
