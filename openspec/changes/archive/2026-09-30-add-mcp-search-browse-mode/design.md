## Context

`search` (`add-mcp-server`, paginated by `add-mcp-search-listprojects-pagination`) is a single UNION ALL of six tables (`test_cases`+`test_case_versions`, `test_suites`, `test_runs`, `projects`, `releases`, `test_plans`), each filtered by `project_id = ANY($projectIDs)` and `<table>.search_vector @@ plainto_tsquery('english', $query)`, ranked by `ts_rank` and offset-paginated (`SearchRepo.Search`, `apps/api/internal/store/search.go`).

`Service.Search` (`apps/api/internal/service/service.go:302`) currently hard-rejects an empty query: `if query == "" { return nil, "", invalid("query is required") }`. Verified directly against the test database that removing only that guard would not be enough — Postgres's `@@` operator with an empty `tsquery` never matches:

```
SELECT to_tsvector('english','hello world') @@ plainto_tsquery('english', '');
-- f (false)
```

So an empty-query browse mode needs a different SQL path, not just a relaxed validation check.

## Goals / Non-Goals

**Goals:**
- Let an agent list a project's entities without already knowing a keyword.
- Let that listing (and ordinary keyword search) be narrowed to one entity type.
- Keep the MCP tool count at 13 — extend `search`, don't add `list_cases`/`list_suites`.

**Non-Goals:**
- Relevance ranking in browse mode — there's no query to rank against; recency (`created_at DESC`) is the ordering, not a substitute relevance score.
- Filtering by anything other than entity type (e.g. status, priority) — out of scope for this change; `get_details`/REST remain the path for deeper filtering.

## Decisions

**D1 — Empty query is a distinct SQL path, not a relaxed predicate.** `SearchRepo.Search` grows an `if query == ""` branch with its own SQL: each arm drops the `search_vector @@ tsq` predicate (and the `q` CTE / `plainto_tsquery` call entirely — calling `plainto_tsquery` with `''` also emits a harmless but noisy Postgres NOTICE, confirmed above, best avoided rather than suppressed), and the final `ORDER BY` becomes `created_at DESC` instead of `rank DESC`. `rank` is still selected (as a literal `0`) so `SearchOutput.Rank` stays present and typed the same in both modes — callers that ignore rank in browse mode aren't surprised by a missing field.
  - *Alternative considered*: one query with `CASE WHEN $1 = '' THEN ... END` switching the predicate/ordering per-row. Rejected — harder to read, and correctness of NULL-ordering across a mixed `CASE` expression is easy to get subtly wrong (verified empirically above that the naive single-query approach doesn't even match rows, let alone rank them). Two straight-line SQL strings, selected in Go before the query executes, mirrors this file's existing style (plain, explicit SQL per method) and is trivial to test independently.

**D2 — `entityType` filters via a plain per-arm `AND` clause, not a wrapping subquery.** Each of the six SELECT arms (in both the keyword and browse SQL) gets `AND ($N = '' OR <literal entity type> = $N)`, e.g. the case arm gets `AND ($4 = '' OR 'case' = $4)`. An empty `$N` means "no filter."
  - *Alternative considered*: wrap the whole `UNION ALL` in a CTE and add one `WHERE entity_type = $N` on the outer `SELECT`. Rejected as an unnecessary extra query layer for a filter Postgres can apply per-arm just as easily; the per-arm form also lets the planner skip a table's join/scan entirely when a caller asks for one entity type (e.g. `entityType: "suite"` no longer needs to touch `test_cases`/`test_case_versions` at all), rather than filtering after computing all six unions.

**D3 — `Service.Search`'s validation change is a pure deletion, not a new branch.** Remove the `query == ""` guard; pass `query` straight through to the store layer exactly as `cursor`/`limit` already do. No new service-layer logic — the mode switch lives entirely in `SearchRepo.Search`, consistent with `Service.Search` already being a thin passthrough (confirmed during `add-mcp-search-listprojects-pagination`).

**D4 — `entityType` is validated against the same six-value enum `get_details` already uses**, at the MCP tool layer (`read_tools.go`), not the service or store layer — an unrecognized value is a validation error before any query runs, mirroring how `GetDetailsInput.EntityType` is documented (`jsonschema:"one of case, suite, run, project, release, testPlan"`) without a runtime store-layer allowlist. An empty `entityType` (the default, `omitempty`) means "no filter," same convention as empty `cursor`.

## Risks / Trade-offs

- **[Risk]** Browsing a large, mature project with no `entityType` filter returns a firehose mixing all six entity types by recency, which may be less useful than a scoped list. **Mitigation**: `entityType` exists precisely for this; `search`'s tool description will recommend pairing an empty query with `entityType` for focused browsing.
- **[Risk]** `Rank: 0` in browse-mode output could be misread as "zero relevance" by an agent that doesn't read the field's doc comment. **Mitigation**: documented in `SearchOutput`'s comment and `docs/mcp-server.md`; not worth a schema change (e.g. omitting the field) since that would make the two modes' output shapes diverge, which is worse for callers than a documented always-zero value.

## Migration Plan

No data migration. Purely additive/relaxed API surface on an existing tool; no breaking change to existing callers (`query` still works exactly as before when non-empty and `entityType` is omitted).
