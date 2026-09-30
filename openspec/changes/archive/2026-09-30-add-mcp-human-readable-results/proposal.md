## Why

As a developer watching an agent work through TestPulse's MCP tools in a chat transcript, when a tool call returns, I want a short human-readable summary line instead of a raw JSON blob, so the transcript stays readable for a human observer. Verified directly against the vendored SDK (`github.com/modelcontextprotocol/go-sdk@v1.7.0/mcp/server.go:415-443`): every tool handler in this codebase currently returns `nil` as its `*CallToolResult`, which makes the SDK auto-populate `content[0].text` with the raw serialized JSON of the typed output — the exact behavior the issue describes, confirmed at the source, not assumed from the issue text.

## What Changes

- Every one of the 12 registered MCP tools' handlers gains a short natural-language summary line in `CallToolResult.Content`, built from values the handler already has in scope (no new service calls, no new lookups).
- `StructuredContent` (what the calling model actually parses) is untouched — the SDK only skips auto-populating `Content` when the handler supplies its own; it still marshals the typed `Out` value into `StructuredContent` regardless, confirmed at the same source location.
- Error paths are untouched: a handler that returns a non-nil `error` already goes through the SDK's own `SetError` path, independent of `Content`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `mcp-server`: adds one new cross-cutting requirement covering every tool's result text, rather than duplicating the same constraint into each of the 12 existing per-tool requirements.

## Impact

- **Affected code**: `apps/api/internal/mcp/write_tools.go`, `apps/api/internal/mcp/read_tools.go` — a small helper plus one summary-line change per handler's success path. `apps/api/internal/mcp_test/mcp_scenarios_test.go` (new assertions on `result.Content` text).
- **No REST/openapi.yaml impact, no migration, no service-layer changes** — this is presentation-only, confirmed in scope by the issue itself and by reading every handler: all needed values (keys, names, counts) are already resolved before the existing return statements.
- **Docs**: no update needed — `docs/mcp-server.md` documents tool behavior and parameters, not wire-level content formatting.
- **Sample Project**: exempt per CLAUDE.md's standing rule — no new user-facing product surface, only transcript readability for whoever is watching an agent's tool calls.
