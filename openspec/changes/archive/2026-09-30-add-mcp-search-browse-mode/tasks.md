## 1. Store layer: browse-mode SQL + entityType filter

- [x] 1.1 Write a failing test `TestSearchRepoSearchBrowsesWithEmptyQuery` in `apps/api/internal/store/search_test.go`: seed a project with a case, suite, and run; call `Search(ctx, "", []string{project.ID}, "", 0)`; assert all three come back with `Rank == 0`, ordered most-recently-created first.
- [x] 1.2 Write a failing test `TestSearchRepoSearchFiltersByEntityType` covering both modes: `Search(ctx, "", ids, "", 0)` with an `entityType` param restricted to `"suite"` returns only the suite; `Search(ctx, "checkout", ids, "", 0)` with `entityType: "case"` returns only the matching case even though the suite/project also match "checkout" by name.
- [x] 1.3 Run `go test ./internal/store/... -run TestSearchRepoSearch` and confirm both new tests fail (compile error is fine — `Search`'s signature doesn't accept `entityType` yet).
- [x] 1.4 Change `SearchRepo.Search`'s signature in `apps/api/internal/store/search.go` to `Search(ctx context.Context, query string, projectIDs []string, entityType, cursor string, limit int) ([]domain.SearchResult, string, error)`. Add the `if query == ""` branch with its own SQL (no `q` CTE, no `@@` predicate, `rank` selected as a literal `0`, `ORDER BY created_at DESC`) per design.md D1. Add the per-arm `AND ($N = '' OR '<type>' = $N)` clause from design.md D2 to both the keyword-mode and browse-mode SQL for all six arms.
- [x] 1.5 Run `go test ./internal/store/... -run TestSearchRepoSearch` (requires `TESTPULSE_TEST_DATABASE_URL`) and confirm both new tests and the existing `TestSearchRepoSearchPaginatesWithOffset` pass.

## 2. Service layer: drop the empty-query guard, thread entityType through

- [x] 2.1 Update the 4 existing call sites in `apps/api/internal/service/search_test.go` (`TestSearchRequiresQuery`, `TestSearchReturnsNoResultsWithoutAccessibleProjects`, `TestSearchFindsMatchesAcrossEntityTypes`, `TestSearchOnlyMatchesWithinGivenProjects`) to the new `Service.Search` signature (added `entityType` param, passed as `""`), and change `TestSearchRequiresQuery` into `TestSearchAllowsEmptyQuery`: call `Search(ctx, "", nil, "", "", 0)` and assert no error (this is the failing test — `Service.Search` still rejects empty queries at this point).
- [x] 2.2 Run `go test ./internal/service/... -run TestSearch` and confirm `TestSearchAllowsEmptyQuery` fails with the `query is required` error.
- [x] 2.3 In `apps/api/internal/service/service.go`, delete the `if query == "" { return nil, "", invalid(...) }` guard from `Service.Search`, add an `entityType string` parameter, and pass it straight through to `SearchRepo.Search` per design.md D3.
- [x] 2.4 Run `go test ./internal/service/... -run TestSearch` and confirm all pass.

## 3. MCP tool layer: optional query, entityType input, updated description

- [x] 3.1 Write a failing test `TestMCPSearchBrowsesWithoutQuery` in `apps/api/internal/mcp_test/mcp_scenarios_test.go`: create a project via `upsert_test_case`/`upsert_test_suite`, call `search` with no `query` and `entityType: "suite"`, assert the response's `results` contains only the suite and `nextCursor` behavior matches existing pagination tests.
- [x] 3.2 Run the new test and confirm it fails (compile error: `SearchInput` has no `EntityType` field yet, `Query` is still required by validation if any).
- [x] 3.3 In `apps/api/internal/mcp/read_tools.go`: make `SearchInput.Query` `omitempty` and update its jsonschema doc; add `EntityType string` with jsonschema `"one of case, suite, run, project, release, testPlan; omit for no filter"`; validate `EntityType` against that 6-value enum per design.md D4, returning a validation error for anything else; pass `in.Query, in.EntityType` through to `svc.Search`. Update the `search` tool's registered `Description` (in `registerReadTools`) to mention browsing with an empty query.
- [x] 3.4 Run `go test ./internal/mcp_test/...` and confirm the new test passes and no existing MCP scenario test regressed.

## 4. Verification, docs, and Sample Project check

- [x] 4.1 Run `make lint-api` and fix any issues.
- [x] 4.2 Run `make coverage-api` and confirm the ≥80% gate still passes.
- [x] 4.3 Update `docs/mcp-server.md`'s `search` row to describe browse mode (empty query lists by recency) and the `entityType` filter, citing `(add-mcp-search-browse-mode)`.
- [x] 4.4 Check the Sample Project (`apps/api/internal/sampledata/seed.go`): confirm it already has enough cases/suites/runs across at least one project that browsing (with and without `entityType`) demonstrates something meaningful; no seed change expected, but verify rather than assume.
- [x] 4.5 Deploy locally (`docker-compose`) and manually call `search` via an MCP client (or REST-equivalent smoke test) with an empty query and with `entityType` set, confirming real output before calling this done.
