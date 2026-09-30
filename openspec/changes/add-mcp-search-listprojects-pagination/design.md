## Context

Verified directly against current code:

- `SearchRepo.Search` (store/search.go:19-69): a single query, `UNION ALL` across 6 entity tables (case/suite/run/project/release/testPlan), each `SELECT`ing `ts_rank(...) AS rank`, `ORDER BY rank DESC LIMIT 50` — hardcoded, no offset or cursor parameter exists at all.
- `ProjectRepo.List`/`ListForMember` (store/projects.go:181-226): both `ORDER BY created_at` with no `LIMIT` — return every accessible project unconditionally.
- `RunRepo.ItemsPage` (store/runs.go:788-878, added in `add-cursor-pagination`, reused by `list_run_items` this session) is the established keyset-pagination template: decode `(createdAt, id)` from an opaque cursor, `WHERE (created_at, id) > ($cursorCreatedAt, $cursorID)`, `ORDER BY created_at ASC, id ASC`, fetch `limit+1` to detect a next page, `encodeCursor(last.CreatedAt, last.ID)` for the next page's cursor, `store.ClampLimit` (default 50, max 200, `pagination.go:14-15`).
- `store/pagination.go` already has `encodeCursor`/`decodeCursor` (typed to `(time.Time, string)`) and a separate `encodeCursorWithRank`/`decodeCursorWithRank` (typed to `(int, time.Time, string)`, currently used only by `roles.go` for an unrelated integer-ranked list) — neither fits `search`'s `float64` `ts_rank` directly, and `roles.go`'s usage isn't a UNION-ALL-across-heterogeneous-tables scenario, so it's not a drop-in template either.
- The now-closed issue #29 ("Evaluate pagination for high-growth list endpoints") explicitly noted project-count growth is expected to stay small, and explicitly descoped `/api/v1/projects`/`summaries` REST pagination because the web UI (`ProjectsPage`) does client-side search/filter/sort over the complete in-memory list — paginating that REST endpoint would force server-side filter/sort and real "load more" UI, a materially bigger change. That constraint is REST/web-UI-specific and doesn't apply here: MCP's `list_projects` is an independent, thin read path with no client-side-filtering UI to preserve.

## Goals / Non-Goals

**Goals:**
- Both `search` and `list_projects` gain pagination, so neither silently truncates or silently returns unbounded results.
- One consistent external interface across all paginated MCP tools: opaque `cursor` string, `limit`, `{<items-field>: [...], nextCursor}` — matching `list_run_items`'s already-shipped envelope.
- `list_projects` gets genuine keyset pagination (the technically correct choice, and cheap to do given `created_at` ordering already exists).

**Non-Goals:**
- True rank-based keyset pagination for `search` — would require a stable floating-point `(rank, key)` tiebreak across a 6-way `UNION ALL` of independently-computed `ts_rank` values; real added complexity for a query that's already bounded by `MaxPageLimit` regardless of pagination strategy. Revisit only if offset-based pagination's known drift-under-concurrent-writes weakness becomes an actual problem for search specifically (unlikely: search results aren't typically paginated many pages deep by an agent).
- Any change to REST's `/api/v1/projects`/search endpoints or the web UI's client-side filtering — issue #29 already examined and descoped that separately.
- `search`'s `jiraLinked`-style additional filters — out of scope, unrelated to pagination.

## Decisions

**D1 — `list_projects`: genuine keyset pagination, mirroring `ItemsPage` exactly.** New `ProjectRepo.ListPage(ctx, cursor string, limit int) ([]domain.Project, string, error)` and `ListForMemberPage(ctx, userID, cursor string, limit int) (...)`, both following `ItemsPage`'s exact shape: decode `(createdAt, id)`, `WHERE ($cursorCreatedAt IS NULL OR (created_at, id) > ($cursorCreatedAt, $cursorID))`, `ORDER BY created_at ASC, id ASC`, fetch `limit+1`, `encodeCursor` from the last in-page row. `Service.AccessibleProjectsPage` mirrors `AccessibleProjects`'s existing scoped-vs-unscoped branch, calling the paginated store methods instead. Rejected alternative: offset-based, for consistency with `search` — rejected because keyset pagination is strictly better here (no drift under concurrent inserts) and costs nothing extra to implement given `created_at` ordering and the `encodeCursor` helper already exist.

**D2 — `search`: offset-based internally, opaque cursor externally, by extending `Search`'s existing signature (not a parallel method).** `SearchRepo.Search`/`Service.Search` have exactly one caller each — the MCP `search` tool (confirmed by direct grep; unlike `ProjectRepo.List`/`ListForMember`, which REST's own project listing also depends on, D1's parallel `*Page` methods are necessary there to avoid touching REST's behavior). Since nothing else calls `Search`, its signature is extended directly (`limit, offset int` added; old unpaginated call sites don't exist to break) rather than adding a redundant, never-diverging duplicate method. Add a new pair of helpers to `store/pagination.go`, `encodeOffsetCursor(offset int) string`/`decodeOffsetCursor(cursor string) (int, error)` (base64 JSON, mirroring `encodeCursor`'s shape but carrying a single int). `... ORDER BY rank DESC LIMIT $N OFFSET $M`, fetch `limit+1` to detect a next page, encode the next offset. From the MCP tool's caller-facing perspective this is indistinguishable from `list_projects`'s cursor — an opaque string, not an exposed integer — preserving Goals' "one consistent interface" without requiring `search` to solve keyset-across-UNION-ALL. Rejected alternative: force true keyset pagination onto `search` for internal consistency — rejected per Non-Goals; the complexity isn't justified by any concrete problem this data shape actually has (not append-only, not growing at the query's ordering boundary the way run items/audit logs are).

**D3 — MCP tool output/result-text conventions reused as-is.** Both tools' new `cursor`/`limit` input fields and `nextCursor` output field match `list_run_items`'s exact naming and jsonschema description style; both get a result-text summary line per `add-mcp-human-readable-results`'s established convention (e.g. `"Found %d match(es) for %q (more available)"` when `nextCursor` is non-empty).

## Risks / Trade-offs

- **[Risk]** Offset-based pagination for `search` can skip or repeat a row if the underlying data changes between page requests (a case is created/deleted mid-pagination). → **Mitigation**: accepted (Non-Goals) — this is the same well-understood trade-off any offset-based pagination has; search results aren't a hot-write path an agent is likely to paginate through while data churns underneath it, unlike run items or audit logs.
- **[Risk]** Two different pagination *implementations* behind one *interface* could confuse a future maintainer reading `search`'s code expecting the same keyset pattern as everywhere else. → **Mitigation**: D2's rationale is documented directly in code comments at the new helper and the `Search` variant, not just here.

## Migration Plan

Additive only — no schema change, no migration file. `List`/`ListForMember` (unpaginated) are left in place since REST's `Service.ListProjects` and other internal callers (Context) still need the complete list; only `list_projects`'s MCP tool switches to the new `*Page` variants. `Search`/`SearchRepo.Search` has its signature extended in place (D2) since its only caller is being updated in the same change.
