## 1. list_projects pagination (keyset)

- [x] 1.1 Write a failing test `TestProjectRepoListPagePaginatesWithCursor` in `apps/api/internal/store/projects_test.go`: create 3 projects, call `ListPage` with `limit: 2`, assert 2 projects and a non-empty cursor, then call again with that cursor and assert the remaining 1 project with an empty cursor.
- [x] 1.2 Run the test, confirm it fails (method doesn't exist).
- [x] 1.3 Implement `ProjectRepo.ListPage(ctx, cursor string, limit int) ([]domain.Project, string, error)`, mirroring `RunRepo.ItemsPage`'s exact keyset pattern (design.md D1): decode `(createdAt, id)`, `WHERE (created_at, id) > (...)`, `ORDER BY created_at ASC, id ASC`, fetch `limit+1`, `encodeCursor` from the last in-page row.
- [x] 1.4 Run the test, confirm it passes.
- [x] 1.5 Write a failing test `TestProjectRepoListForMemberPagePaginatesWithCursor`: same shape as 1.1, but for a non-admin member's scoped project list.
- [x] 1.6 Implement `ProjectRepo.ListForMemberPage(ctx, userID, cursor string, limit int) (...)`, same pattern as 1.3 applied to `ListForMember`'s existing WHERE clause.
- [x] 1.7 Run the test, confirm it passes.
- [x] 1.8 Implement `Service.AccessibleProjectsPage(ctx, cursor string, limit int) ([]domain.Project, string, error)`, mirroring `AccessibleProjects`'s existing scoped-vs-unscoped branch but calling the new `*Page` store methods.
- [x] 1.9 Write a failing test `TestMCPListProjectsPaginatesWithCursor` in `apps/api/internal/mcp_test/mcp_scenarios_test.go`: create 3 projects, call `list_projects` with `limit: 2`, assert 2 projects and a non-empty `nextCursor`, then call again with that cursor and assert the remaining 1 project.
- [x] 1.10 Run the test, confirm it fails (tool doesn't accept `cursor`/`limit` yet).
- [x] 1.11 Update `ListProjectsInput`/`ListProjectsOutput` and `listProjects`'s handler in `apps/api/internal/mcp/read_tools.go` to accept `cursor`/`limit` and call `svc.AccessibleProjectsPage`, returning `nextCursor`.
- [x] 1.12 Run the test, confirm it passes; run the existing `TestMCPListProjectsScopedVsUnscoped`/`TestMCPListProjectsResultHasReadableSummary`, confirm they still pass.

## 2. search pagination (offset, opaque cursor)

- [x] 2.1 Write a failing test `TestPaginationEncodeDecodeOffsetCursorRoundTrips` in `apps/api/internal/store/pagination_test.go`: encode an offset, decode it, assert equality; decode a malformed string, assert an `ErrInvalidCursor`-wrapped error.
- [x] 2.2 Run the test, confirm it fails (helpers don't exist).
- [x] 2.3 Implement `encodeOffsetCursor(offset int) string`/`decodeOffsetCursor(cursor string) (int, error)` in `apps/api/internal/store/pagination.go`, mirroring `encodeCursor`/`decodeCursor`'s shape (design.md D2).
- [x] 2.4 Run the test, confirm it passes.
- [x] 2.5 Write a failing test `TestSearchRepoSearchPaginatesWithOffset` in `apps/api/internal/store/search_test.go` (or existing search test file): create enough matching rows to exceed a small limit, call `Search` with `limit`/`offset`, assert the first page's count and a non-empty next-offset, then call again with that offset and assert the remaining rows.
- [x] 2.6 Run the test, confirm it fails (signature doesn't accept limit/offset yet).
- [x] 2.7 Extend `SearchRepo.Search`'s signature to `Search(ctx, query string, projectIDs []string, limit, offset int) ([]domain.SearchResult, int, error)` (returning the next offset, or 0/sentinel when there's no next page) — no separate unpaginated method, since this is `Search`'s only call site (design.md D2).
- [x] 2.8 Run the test, confirm it passes.
- [x] 2.9 Extend `Service.Search`'s signature to match, decoding/encoding the opaque cursor via `encodeOffsetCursor`/`decodeOffsetCursor` at the service boundary (store layer works in plain ints, service layer speaks cursors — matching `AccessibleProjectsPage`'s split).
- [x] 2.10 Write a failing test `TestMCPSearchPaginatesWithCursor` in `apps/api/internal/mcp_test/mcp_scenarios_test.go`: create enough matching cases to exceed a small `limit`, call `search` with that `limit`, assert a non-empty `nextCursor`, then call again with that cursor and assert the remaining results with no further `nextCursor`.
- [x] 2.11 Run the test, confirm it fails.
- [x] 2.12 Update `SearchInput`/`SearchOutput` and `search`'s handler in `apps/api/internal/mcp/read_tools.go` to accept `cursor`/`limit` and return `nextCursor`; update the result-text summary line to mention when more results are available (design.md D3).
- [x] 2.13 Run the test, confirm it passes; run the existing `TestMCPSearchFindsMatchesAndRespectsProjectScoping`/`TestMCPSearchOutputHasNoRawProjectID`/`TestMCPSearchResultHasReadableSummary`, confirm they still pass.

## 3. Documentation

- [x] 3.1 Update `docs/mcp-server.md`'s `search` and `list_projects` table rows to note pagination (`cursor`/`limit`).

## 4. Full verification

- [x] 4.1 Run `go build ./... && go test ./...` in `apps/api`, confirm 100% pass, no regressions.
- [x] 4.2 Run `make coverage-api`, confirm the ≥80% gate still passes.
- [x] 4.3 Run `make lint-api`, confirm clean.
