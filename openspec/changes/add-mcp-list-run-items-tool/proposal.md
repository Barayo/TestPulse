## Why

As an agent driving a test-run execution flow, when I want to know which specific case keys are still pending or failed in a run, I want a tool that lists a run's items with their case keys and statuses, so I can act on them without already knowing every case key in advance. Verified directly against current code: `get_run_progress` (the only MCP tool touching run items today) returns only `domain.RunSummary` — aggregate counts, no itemization. REST already has this exact capability (`GET /runs/{runKey}/items` → `Service.RunItemsPage`, cursor-paginated via the existing `add-cursor-pagination` capability), but nothing exposes it via MCP — an agent today has no way to discover which case keys in a run still need a result, undercutting the record-results flagship flow.

## What Changes

- Add one new MCP tool, `list_run_items`, wrapping the existing `Service.RunItemsPage(ctx, runID, assignee, cursor, limit)` — the same cursor-paginated method REST's `listRunItems` handler already uses, gated by `domain.PermRead` on the run's project (matching `get_run_progress`'s own permission).
- Input: `runKey` (required), plus optional `cursor`/`limit` (REST's own pagination convention).
- Output is cursor-paginated from day one — `{items: [...], nextCursor}`, matching REST's own `pagePayload` envelope shape — rather than returning everything unpaginated and creating a future version of issue #149's complaint for this tool too.
- Each item's output drops every raw internal ID with no usable key substitute (`ID`, `RunID`, `CaseID`, and the assignee's internal ref ID), consistent with the ID-safety convention established in `fix-mcp-output-id-leaks` — this is a brand-new output type, built ID-safe from the start rather than retrofitted later.
- `jiraLinked` and `assignee` filtering (REST's other `listRunItems` query params) are explicitly out of scope: `jiraLinked` is a niche filter not requested by the issue, and `assignee` would require a raw internal user/team UUID no MCP tool anywhere exposes a way to obtain — shipping it would just move the "dead-end ID" problem from output to input.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `mcp-server`: adds the `list_run_items` tool requirement.

## Impact

- **Affected code**: `apps/api/internal/mcp/read_tools.go` (new tool, following `getRunProgress`'s template), `apps/api/internal/mcp_test/mcp_scenarios_test.go` (new scenario tests).
- **No REST/openapi.yaml impact**: reuses `Service.RunItemsPage` as-is.
- **No migration needed**.
- **Docs**: `docs/mcp-server.md` (new tool's table row, tool count correction to 13), `ROADMAP.md` (MCP tool surface line).
- **Sample Project**: exempt per CLAUDE.md's standing rule — no new user-facing product surface, only a new agent-facing MCP tool wrapping an already-shipped REST capability.
