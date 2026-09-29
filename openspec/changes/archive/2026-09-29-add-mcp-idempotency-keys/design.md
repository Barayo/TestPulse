## Context

`apps/api/internal/mcp/write_tools.go` registers `upsert_test_case`
(line 22), `bulk_add_cases` (line 37), and `create_test_run` (line 42) via
`sdkmcp.AddTool`. Each handler resolves the project, checks permission via
`svc.Authorize`, then calls straight into the service layer
(`svc.CreateCase`/`svc.BulkAddCases`/`svc.CreateRun`) with no dedup check —
confirmed by reading all three handler bodies and grepping the whole
`apps/api/internal` tree for "idempot"/"dedup": every hit is either the
word "idempotent" describing an already-naturally-idempotent operation
(tag assign/star, requirement link-case) or the static `IdempotentHint`
tool annotation (`writeAnnotations`, line 17-19) — a client-facing MCP
protocol hint only, never enforced server-side.

`/mcp` is registered via `mcp.go`'s `NewHTTPHandler` with
`StreamableHTTPOptions{Stateless: true}` — the file's own comment: "each
MCP request (including every tool call) is a single authenticated HTTP
POST... no separate session-establishment step." There is no session to
scope a key to; any fix must be a client-supplied key carried in the tool
call's own input, checked against server-side state keyed by (caller,
tool, key).

The closest existing pattern for short-lived, expiring server-side state
is `password_reset_tokens` / `sessions`: a DB table with `expires_at`, a
`DeleteExpired`-style method, invoked once at process startup via
`Service.CleanupExpiredSessions` (`identity.go:176`, called from
`main.go:75`) — not a recurring background worker. `docs/deployment.md`
documents this app as explicitly safe to scale to multiple replicas
("App is stateless; scale freely"), all real state living in Postgres —
an in-process/in-memory idempotency cache would be silently wrong the
moment a retry lands on a different pod than the original attempt, so a
DB-backed store is the only choice consistent with that documented
scaling story, not just a style preference.

`execution-import`'s `testpulse_case_key`-based matching is a
superficially similar "client supplies a stable key" pattern, but its
semantics are different: match-or-report-unmatched, deliberately never
auto-creating on a miss. Idempotency needs the opposite promise — create
once, then return the *same result* on every subsequent call with that
key — so that pattern doesn't transfer directly; it's mentioned here only
to rule it out as a reusable mechanism.

## Goals / Non-Goals

**Goals:**
- A retried `upsert_test_case` (create path), `bulk_add_cases`, or
  `create_test_run` call carrying the same `idempotencyKey` as a prior
  successful call returns that same result instead of creating a
  duplicate.
- Zero behavior change for any caller that doesn't supply the new
  parameter — this is purely additive and opt-in.
- Survives a restart and works correctly across multiple replicas (DB-
  backed, not in-memory).

**Non-Goals:**
- Not covering `upsert_test_case`'s *edit* path — a retried edit creates a
  new immutable version each time, a similarly-shaped problem, but the
  issue scoped this to the create path only. Flagged in proposal.md as a
  candidate follow-up rather than silently dropped.
- Not caching error results — a failed attempt (validation, permission)
  creates nothing, so it's always safe to retry freely with the same key;
  caching errors would add replay-fidelity complexity (matching status
  codes, error shapes) for a case that doesn't need protecting.
- Not making the TTL admin-configurable — a fixed constant is enough for
  "recognize a retry shortly after a timeout"; the issue itself calls this
  "lowest priority," so this stays a narrow safety net, not a new
  instance-wide setting surface.
- Not adding idempotency to any other MCP tool beyond the three named in
  the issue (`upsert_test_suite`, `upsert_step_group`, `record_result`,
  etc. are unaffected) — those either aren't create-style or weren't named
  as needing this.

## Decisions

**D1: New DB-backed table `mcp_idempotency_keys`, not an in-memory cache.**
See Context — the documented multi-replica scaling story makes this the
only correct choice, not a stylistic one.

```sql
CREATE TABLE mcp_idempotency_keys (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    actor_id text NOT NULL,
    tool_name text NOT NULL,
    idempotency_key text NOT NULL,
    result_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    UNIQUE (actor_id, tool_name, idempotency_key)
);
```

**D2: Only successful results are cached.** The handler performs the
create first; only on success does it store `result_json`. A failed
attempt is never written, so retrying after a validation/permission error
just runs the create fresh — exactly today's behavior for errors,
unaffected by this change.

**D3: Key uniqueness scoped to `(actor_id, tool_name, idempotency_key)`** —
mirrors the common idempotency-key convention (Stripe et al.: scope by
caller identity + operation) so one agent's key can't collide with
another's, and the same key string can't accidentally match across
different tools.

**D4: Fixed 24-hour TTL, not admin-configurable.** Long enough to cover a
retry after a slow timeout or a brief outage, short enough that the table
never meaningfully grows. Matches the issue's own "lowest priority, real
value depends on how often agents actually retry" framing — a fixed
constant, not a new tunable.

**D5: Cleanup via a startup sweep, mirroring `CleanupExpiredSessions`
exactly** — a new `Service.CleanupExpiredIdempotencyKeys` called once from
`main.go` alongside the existing session cleanup call, not a new
recurring background worker. A 24-hour TTL means stale rows are cheap and
harmless between restarts; this app's own existing precedent for this
exact class of ephemeral state uses a startup sweep, not a ticker.

**D6: Two new `Service` methods, shared by all three tool handlers** —
`IdempotentResult(ctx, actorID, toolName, key) (json.RawMessage, bool,
error)` and `SaveIdempotentResult(ctx, actorID, toolName, key string,
result any) error`. Keeps `internal/mcp` thin (it already never touches
`internal/store` directly, only `Service`) and keeps the JSON
marshal/unmarshal in one shared place instead of three copies. The
handler flow becomes: resolve project/authorize as today → if
`idempotencyKey != ""`, check `IdempotentResult` first and return early on
a hit → otherwise perform the create → on success, if a key was supplied,
call `SaveIdempotentResult`.

## Risks / Trade-offs

- **A caller reuses the same key for what's actually a different logical
  operation** (e.g. copy-pastes a key across two different `create_test_run`
  calls) → they get back the first call's result, not a new run. This is
  the correct, expected idempotency-key contract (the same trade-off every
  idempotency-key API makes) — the key's uniqueness is the caller's
  responsibility, not the server's to second-guess.
- **The 24-hour TTL is a guess, not measured from real retry behavior** →
  Acceptable per the issue's own low-priority framing; easy to adjust
  later without a migration (it's a constant, not a stored value) if real
  usage shows it's wrong.

## Migration Plan

New migration, additive only (a new table, nothing existing changes). No
backfill. Rollback is reverting the commit — the table has no other
consumers to break.
