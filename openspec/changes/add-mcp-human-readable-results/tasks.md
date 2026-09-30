## 1. Helper and write_tools.go handlers

- [x] 1.1 Write a failing test `TestMCPUpsertTestCaseResultHasReadableSummary` in `apps/api/internal/mcp_test/mcp_scenarios_test.go`: call `upsert_test_case` to create a case via `session.CallTool` directly (not `callTool`, since the assertion is on `result.Content`, not `StructuredContent`), assert `contentText(result)` contains the case's key and title.
- [x] 1.2 Run the test, confirm it fails (content is still the raw JSON dump).
- [x] 1.3 Add `func textResult(format string, args ...any) *sdkmcp.CallToolResult` to `apps/api/internal/mcp/write_tools.go` per design.md D1.
- [x] 1.4 Update `upsertTestCase`'s create and edit success return paths to return `textResult(...)` per design.md D2 instead of `nil`, for both the fresh-create and idempotency-replay branches (design.md D3: same line either way).
- [x] 1.5 Run the test, confirm it passes.
- [x] 1.6 Write a failing test `TestMCPUpsertStepGroupResultHasReadableSummary`: create a step group, assert `contentText(result)` contains its key and name.
- [x] 1.7 Update `upsertStepGroup`'s two success paths per design.md D2. Run the test, confirm it passes.
- [x] 1.8 Write a failing test `TestMCPUpsertTestSuiteResultHasReadableSummary`: create a suite, assert `contentText(result)` contains its key and name.
- [x] 1.9 Update `upsertTestSuite`'s two success paths per design.md D2. Run the test, confirm it passes.
- [x] 1.10 Write a failing test `TestMCPUpdateSuiteMembershipResultHasReadableSummary`: add a case to a suite, assert `contentText(result)` contains the case key and suite key.
- [x] 1.11 Update `updateSuiteMembership`'s success path per design.md D2. Run the test, confirm it passes.
- [x] 1.12 Write a failing test `TestMCPBulkAddCasesResultHasReadableSummary`: call `bulk_add_cases` with 2 cases, assert `contentText(result)` contains the count and project key.
- [x] 1.13 Update `bulkAddCases`'s success path (both fresh and idempotency-replay branches) per design.md D2/D3. Run the test, confirm it passes.
- [x] 1.14 Write a failing test `TestMCPCreateTestRunResultHasReadableSummary`: create a run, assert `contentText(result)` contains the run key and name.
- [x] 1.15 Update `createTestRun`'s success path (both branches) per design.md D2/D3. Run the test, confirm it passes.
- [x] 1.16 Write a failing test `TestMCPRecordResultResultHasReadableSummary`: record a result, assert `contentText(result)` contains the verdict, case key, and run key.
- [x] 1.17 Update `recordResult`'s success path per design.md D2. Run the test, confirm it passes.
- [x] 1.18 Write a failing test `TestMCPUpdateRunItemStatusResultHasReadableSummary`: update a run item's status, assert `contentText(result)` contains the case key, run key, and status.
- [x] 1.19 Update `updateRunItemStatus`'s success path per design.md D2. Run the test, confirm it passes.

## 2. read_tools.go handlers

- [x] 2.1 Write a failing test `TestMCPSearchResultHasReadableSummary`: search with a query matching one result, assert `contentText(result)` contains the match count and the query text.
- [x] 2.2 Update `search`'s success path per design.md D2. Run the test, confirm it passes.
- [x] 2.3 Write a failing test `TestMCPGetDetailsResultHasReadableSummary`: fetch a case via `get_details`, assert `contentText(result)` contains the entity type and key.
- [x] 2.4 Update `getDetails`'s success path per design.md D2. Run the test, confirm it passes.
- [x] 2.5 Write a failing test `TestMCPGetRunProgressResultHasReadableSummary`: record one passing result in a 1-case run, call `get_run_progress`, assert `contentText(result)` contains the run key and the pass/total counts.
- [x] 2.6 Update `getRunProgress`'s success path per design.md D2. Run the test, confirm it passes.
- [x] 2.7 Write a failing test `TestMCPListProjectsResultHasReadableSummary`: call `list_projects`, assert `contentText(result)` contains the project count.
- [x] 2.8 Update `listProjects`'s success path per design.md D2. Run the test, confirm it passes.

## 3. Full verification

- [x] 3.1 Run `go build ./... && go test ./...` in `apps/api`, confirm 100% pass, no regressions.
- [x] 3.2 Run `make coverage-api`, confirm the ≥80% gate still passes.
- [x] 3.3 Run `make lint-api`, confirm clean.
