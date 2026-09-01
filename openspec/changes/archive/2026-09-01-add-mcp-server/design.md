## Context

`apps/api/internal/service/service.go` already carries the doc comment "REST handlers (and later the MCP server) are thin adapters over this package" — the service layer was designed with this in mind from `establish-architecture` onward, but no MCP code was ever written. The chi router (`apps/api/internal/server/server.go`) mounts `/api/v1` inside an authenticated group using `authenticate(svc)` middleware, which resolves `Bearer <token>` via `svc.AuthenticateToken` (`internal/service/identity.go`) into a `domain.Actor` — carrying `Kind` (`user`/`agent`/`system`), `ScopedProjectID`, and `ScopedPermissions`. This actor model already treats agents as first-class per CLAUDE.md's standing architecture constraint. The tool surface itself (~11 coarse-grained tools, hybrid — not a CRUD mirror, not workflow mega-tools) was already settled as a v0.1 design decision in ROADMAP.md; this design does not revisit that list, only how to build it.

## Goals / Non-Goals

**Goals:**
- Ship a working MCP server, hosted in-process, reusing the existing service layer and auth model with zero new auth code paths.
- Make it optional via config (`TESTPULSE_MCP_ENABLED`), on by default.
- Cover the full ~11-tool surface from ROADMAP.md, including the three tools needing new service-layer work (`bulk_add_cases`, `search`, `get_details`).
- Keep MCP a thin adapter — any real logic (batch transactions, search ranking, key routing) lives in `service.Service`, testable and reusable independent of the protocol layer.

**Non-Goals:**
- Delete support via MCP (REST-only in v0.1, per ROADMAP.md).
- MCP resources or prompts (deferred "later sugar" per ROADMAP.md).
- Server-side AI features — the MCP server outsources intelligence to the client's agent, per ROADMAP.md's v0.1 framing.
- Changing the existing REST API surface or auth semantics.

## Decisions

**Transport: Streamable HTTP, not stdio.** The server lives inside a long-running network binary, not a locally-spawned subprocess, so stdio (MCP's other standard transport) doesn't apply. Mounted at `/mcp` as a sibling to `/api/v1` inside the same `r.Group` that applies `authenticate(svc)`, reusing that middleware directly rather than reimplementing auth for a new mount point.

**SDK: official `modelcontextprotocol/go-sdk`.** Considered `mark3labs/mcp-go` (popular, more historically battle-tested) and a hand-rolled JSON-RPC implementation (no dependency, full control). Chose the official SDK: it tracks the spec directly as the reference implementation, is maintained by Anthropic + Google, and satisfies CLAUDE.md's "all stack additions must be open source" constraint. Avoids owning protocol-compliance risk in a hand-rolled implementation.

**Auth: reuse `AuthenticateToken` verbatim, support both scoped and unscoped tokens.** No new token type or auth mode. A project-scoped agent token only sees/acts on its project (existing `ScopedProjectID`/`ScopedPermissions` intersection logic in `identity.go`); an unscoped token can `list_projects`/`search` across everything it has access to — identical to today's REST behavior. Considered restricting MCP to project-scoped tokens only for a simpler mental model, but this breaks `list_projects` and cross-project `search`'s intended purpose and would diverge from how REST tokens already work.

**`bulk_add_cases`: atomic, all-or-nothing.** One invalid case in a batch fails and rolls back the whole call in a single transaction. Considered partial-success-with-per-item-report (more forgiving for large batches) but rejected: it makes the tool call non-transactional, forces callers to handle mixed results, and breaks the "one clear error, fix, retry" loop that makes the flagship "read requirements.md, create a suite" demo simple for an agent to drive.

**`search`: Postgres `tsvector` + GIN index, not ILIKE.** Per the standing rule to design aggregate/search features for DB scale from day one (learned from the `useProjectSummaries` N+1 incident), a real FTS index is built now rather than shipping ILIKE and redoing it later under load. Scope: cases, suites, runs, projects, releases, and test plans — broadened from ROADMAP.md's original four (cases/suites/runs/projects) to include the newly-shipped Release/Test Plan entities, since the index and migration are being built in this change anyway and a second migration later would be pure rework.

**`get_details`: explicit `{entity_type, key}`, not key-prefix inference.** TestPulse keys do carry a type-indicating segment, but routing off an explicit param keeps the tool's contract independent of key-format conventions (which could change) and gives a clear "type/key mismatch" error path instead of silent misrouting.

**Testing: official SDK's MCP client, in-process, over real Streamable HTTP.** Same pattern as existing DB-integration tests (`TESTPULSE_TEST_DATABASE_URL` gate) — the client drives the actual wire protocol rather than hand-constructed JSON-RPC bodies, so tests catch real protocol-shape regressions and don't duplicate the SDK's own parsing logic.

## Risks / Trade-offs

- **[Risk]** New GIN index adds write-path cost (trigger or generated column maintaining `tsvector` on every case/suite/run/project/release/test-plan write) → **Mitigation**: use a generated `tsvector` column (Postgres native, no trigger needed) and confirm with `EXPLAIN ANALYZE` during implementation that write latency stays acceptable at seed-data scale before merging.
- **[Risk]** `bulk_add_cases` atomicity means one bad case in a 200-case batch blocks all 200 → **Mitigation**: this is the deliberate trade-off (see Decisions); the error message must name the specific failing case/field so an agent can fix and retry without re-diagnosing the whole batch.
- **[Risk]** Official `go-sdk` is newer than community alternatives; API surface could still shift → **Mitigation**: pin the version in `go.mod`, isolate all SDK usage inside `apps/api/internal/mcp/` so an SDK swap later stays contained.
- **[Risk]** Enabling MCP by default expands the authenticated attack surface of every deployment, including ones that never asked for it → **Mitigation**: `TESTPULSE_MCP_ENABLED=false` is a one-line opt-out; MCP requests still go through the exact same permission checks as REST, so it doesn't grant any capability a scoped token couldn't already reach over REST.

## Migration Plan

1. Add the `tsvector`+GIN index migration as a new incremental file under `apps/api/internal/db/migrations/` (goose, never edited once shipped, per the permanent migration policy).
2. Add `bulk_add_cases`, `search`, `get_details` to `service.Service`, TDD'd independent of MCP (pure Go, testable via existing service-layer test patterns).
3. Add `apps/api/internal/mcp/` wrapping all ~11 tools over the service layer; wire `/mcp` mount + `TESTPULSE_MCP_ENABLED` into `server.go`/`config.go`/`main.go`.
4. Ship docs quickstart pointing at the Sample Project.
5. Rollback: `TESTPULSE_MCP_ENABLED=false` disables the mount instantly without a redeploy of anything else; the migration is additive (new column/index only) so no data-loss rollback path is needed.

## Open Questions

None outstanding — all architectural decisions were resolved during brainstorming with the user before writing this document.
