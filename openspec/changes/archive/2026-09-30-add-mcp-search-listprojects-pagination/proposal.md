## Why

As an agent working against a large TestPulse instance, when I call `search` or `list_projects`, I want to be able to page through results beyond the first batch, so I don't silently miss data on a big project/instance. Verified directly against current code: `SearchRepo.Search` hardcodes `LIMIT 50` with no offset/cursor parameter at all (`store/search.go:51`); `ProjectRepo.List`/`ListForMember` return every accessible project with no limit whatsoever (`store/projects.go:181-226`). Both silently truncate (search) or silently return everything (list_projects) today — an agent has no way to know it's seeing a partial or unbounded result set.

## What Changes

- `list_projects` gains genuine cursor-based (keyset) pagination — new `ProjectRepo.ListPage`/`ListForMemberPage` store methods mirroring `RunRepo.ItemsPage`'s exact `(created_at, id)` keyset pattern (fetch `limit+1`, encode a cursor from the last in-page row, `store.ClampLimit`'s existing default/max), a new `Service.AccessibleProjectsPage`, and `cursor`/`limit` input on the tool, `{projects, nextCursor}` output — the same envelope shape `list_run_items` already established.
- `search` gains pagination too, but via a simpler mechanism: an opaque cursor that internally encodes an integer offset, not a true keyset cursor. This is a deliberate, justified difference (design.md D2), not an inconsistency overlooked — `search`'s results are rank-ordered (`ts_rank DESC`) across a 6-way `UNION ALL` of heterogeneous entity tables, not append-only time-ordered data; a real keyset cursor would need a floating-point rank tiebreak across differently-sourced rank values, adding real complexity for a query that's already bounded by `MaxPageLimit` regardless.
- Both tools' external interface stays consistent: an opaque `cursor` string and a `limit`, `{items/projects: [...], nextCursor}` — an agent doesn't need two different pagination mental models for two different tools, even though the two tools' internal pagination strategies differ for good reason.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `mcp-server`: `search` and `list_projects` tool requirements both gain pagination.

## Impact

- **Affected code**: `apps/api/internal/store/projects.go` (new `ListPage`/`ListForMemberPage`, existing `List`/`ListForMember` untouched), `apps/api/internal/store/search.go` (`Search`'s signature extended with `limit`/`offset` — its only caller is the MCP tool, updated in the same change), `apps/api/internal/store/pagination.go` (new offset-cursor helper), `apps/api/internal/service/project_rbac.go` (`AccessibleProjectsPage`), `apps/api/internal/service/service.go` (`Search`'s signature extended to match), `apps/api/internal/mcp/read_tools.go` (both tools' input/output types), `apps/api/internal/mcp_test/mcp_scenarios_test.go`.
- **No REST/openapi.yaml impact**: these are new store/service methods used only by the MCP tools; REST's existing `/api/v1/projects` and search behavior are untouched (REST's own project-list pagination was explicitly descoped in the now-closed issue #29, since the web UI does client-side filter/sort over the full list — that constraint doesn't apply to MCP's thin read path).
- **No migration needed**: no schema change; `search`'s existing `tsvector`+GIN indexes are reused as-is.
- **Docs**: `docs/mcp-server.md` (both tools' table rows note pagination).
- **Sample Project**: exempt per CLAUDE.md's standing rule — no new user-facing product surface.
