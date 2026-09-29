## Why

As an agent operating over an unreliable network, when a `create_test_run`
or `bulk_add_cases` call times out and I retry it, I want the server to
recognize the retry and return the original result instead of creating a
second copy, so a flaky connection doesn't leave duplicate data behind
(issue #153).

Verified before designing: `upsert_test_case`'s create path, `bulk_add_cases`,
and `create_test_run` (`apps/api/internal/mcp/write_tools.go`) call straight
through to `svc.CreateCase`/`svc.BulkAddCases`/`svc.CreateRun` with no
dedup check of any kind — confirmed via a repo-wide grep for
"idempot"/"dedup" (the only hits are the `IdempotentHint` tool-annotation,
which is a client-facing hint only, never enforced server-side). `/mcp` is
explicitly stateless per-request (`mcp.go`'s `StreamableHTTPOptions{Stateless:
true}`) — there's no session to scope a key to, so any fix has to be a
client-supplied key carried in the tool call itself.

## What Changes

- Each of the three create-style tools gains an optional `idempotencyKey`
  string parameter. Omitting it preserves today's exact behavior — this is
  strictly additive, opt-in per call.
- When supplied, the server checks for a prior successful call scoped to
  (caller, tool, key); if found, it returns that stored result verbatim
  without re-executing the create. If not found, it performs the create as
  normal, then stores the result under that key.
- Only successful results are ever cached — a failed attempt (validation
  error, permission error) creates nothing, so it's always safe to retry
  freely; caching errors would add complexity for no benefit here.
- New DB-backed store (`mcp_idempotency_keys`, TTL + startup cleanup sweep,
  mirroring the existing `password_reset_tokens`/session cleanup pattern) —
  not an in-memory cache, since `docs/deployment.md` documents this app as
  safe to scale to multiple replicas sharing one Postgres, and an
  in-process cache would silently stop working the moment a retry lands on
  a different pod.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `mcp-server`: `upsert_test_case`, `bulk_add_cases`, and `create_test_run`
  each gain idempotency-key support on their create path.

## Impact

- **Backend**: new migration (`mcp_idempotency_keys` table); new
  `MCPIdempotencyKeyRepo` (`apps/api/internal/store`); two new `Service`
  methods used by all three tool handlers; `apps/api/internal/mcp/write_tools.go`
  (the three input structs + handler bodies); `main.go` (startup cleanup
  call, mirroring `CleanupExpiredSessions`).
- **Contract**: none — MCP tool schemas aren't part of `openapi.yaml`, they're
  defined directly in `write_tools.go` and discovered via the MCP protocol
  itself.
- **Docs**: `docs/mcp-server.md` (or wherever the tool reference lives) —
  document the new optional parameter and its retry-safety guarantee.
- **Sample Project**: exempt — an agent-facing reliability mechanism, not a
  new user-visible product feature (CLAUDE.md's standing exemption).
- **Explicitly out of scope** (see design.md Non-Goals): `upsert_test_case`'s
  *edit* path (a retried edit creates a new version each time, a similar-
  shaped problem) — the issue scoped this to the create path only; noted
  as a candidate follow-up, not silently ignored.
