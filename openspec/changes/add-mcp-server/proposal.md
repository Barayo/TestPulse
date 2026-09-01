## Why

As an agent developer, when I want to have my agent manage tests in TestPulse without hand-rolling REST calls, I want to point it at a standard MCP server and use domain-shaped tools instead. TestPulse's ROADMAP.md states the MCP server ships as part of the v0.1 MVP — "the differentiator ships first" — but it was never actually implemented: `add-mcp-server` was listed as in-scope, yet no MCP code exists anywhere in the codebase today. This leaves TestPulse's stated core differentiator unbuilt (tracked as GitHub #8 and #109) while every other piece of v0.1 shipped.

## What Changes

- Add an MCP server hosted inside the existing `testpulse-api` Go binary, built on the official `modelcontextprotocol/go-sdk`, speaking Streamable HTTP, mounted at `/mcp` alongside `/api/v1`.
- Gate it behind a new `TESTPULSE_MCP_ENABLED` env var, default `true`.
- Authenticate MCP requests identically to REST: `Authorization: Bearer <token>` → existing `AuthenticateToken` → `domain.Actor` on context. No new auth mode; both project-scoped and unscoped tokens work.
- Add ~11 coarse-grained domain tools (the hybrid tool-surface design already settled in ROADMAP.md v0.1): `upsert_test_case`, `upsert_test_suite`, `bulk_add_cases`, `create_test_run`, `record_result`, `update_run_item_status`, `search`, `get_details`, `get_run_progress`, `list_projects`. Deletes stay REST-only.
- Most tools are thin wraps of existing `service.Service` methods. Three require new service-layer work:
  - `bulk_add_cases`: new atomic batch-create method (all-or-nothing transaction).
  - `search`: new cross-entity full-text search backed by a `tsvector`+GIN index (new migration) across cases, suites, runs, projects, releases, and test plans.
  - `get_details`: new aggregator taking `{entity_type, key}`, routing to existing `*ByKey` lookups.
- Add a docs quickstart for connecting an agent to TestPulse's MCP server, pointed at the existing Sample Project as the "connect here" demo (no new seed data needed).

## Capabilities

### New Capabilities
- `mcp-server`: MCP protocol server exposing TestPulse's domain operations (test cases, suites, runs, results, search) as tools for AI agents, authenticated via the existing scoped API token model.

### Modified Capabilities
(none — this change reuses existing authentication and service-layer requirements as-is; it introduces a new access protocol, not new requirements on existing capabilities)

## Impact

- **New code**: `apps/api/internal/mcp/` (tool definitions, server wiring), new migration for the search index, `bulk_add_cases`/`search`/`get_details` service methods.
- **Modified code**: `apps/api/internal/server/server.go` (mount `/mcp`), `apps/api/internal/config/config.go` (`TESTPULSE_MCP_ENABLED`), `apps/api/cmd/testpulse-api/main.go` (wire config through).
- **New dependency**: `github.com/modelcontextprotocol/go-sdk` (open source, added to `apps/api/go.mod`).
- **Docs**: new MCP quickstart page, `docs/README.md` index update.
- **No breaking changes**: purely additive; existing REST API and auth are untouched.
