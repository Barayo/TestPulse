## Why

As an agent exploring a project for the first time, when I want to see everything in it (cases, suites, runs) without knowing a search term yet, I want a way to browse/list, so I'm not stuck guessing keywords. Today `search` rejects an empty `query` outright, and even if that guard were removed, the underlying full-text predicate (`tsvector @@ tsquery`) never matches anything against an empty `tsquery` — so there's no browse-without-a-keyword path at all (`#152`).

## What Changes

- `search`'s `query` parameter becomes optional. An empty/omitted `query` switches the tool into **browse mode**: instead of full-text ranking, it lists entities across the caller's accessible projects ordered by most-recently-created first, via the same cursor/limit pagination the tool already has.
- `search` gains an optional `entityType` filter (`case`/`suite`/`run`/`project`/`release`/`testPlan`) that narrows results to one entity type — usable in both browse mode (e.g. "list all suites") and keyword mode (e.g. "search for 'login' among cases only").
- No new tool is added — the settled ~13-tool MCP surface is unchanged. This is the API-widening option from the issue's design question, not the dedicated `list_cases`/`list_suites` option.
- `Rank` in `SearchOutput` is `0` for every result returned in browse mode (there's no query to rank against); this is documented, not treated as an error.

## Capabilities

### Modified Capabilities
- `mcp-server`: the `search tool` requirement changes — `query` becomes optional, an empty query lists entities by recency instead of erroring or returning nothing, and a new optional `entityType` filter applies to both modes.

## Impact

- `apps/api/internal/service/service.go`: `Service.Search` drops its `query is required` validation guard.
- `apps/api/internal/store/search.go`: `SearchRepo.Search` gains an `entityType` parameter and a browse-mode SQL path (no `tsvector @@ tsquery` predicate, ordered by `created_at DESC` instead of `rank DESC`).
- `apps/api/internal/mcp/read_tools.go`: `SearchInput.Query` becomes optional (`omitempty`), gains `EntityType`; the `search` tool's summary text and description are adjusted to mention browsing.
- `docs/mcp-server.md`: `search` row updated to describe browse mode and the `entityType` filter.
- `apps/api/internal/sampledata/seed.go`: no change expected — the Sample Project's existing suites/cases/runs are enough to demonstrate browsing; verify during implementation.
