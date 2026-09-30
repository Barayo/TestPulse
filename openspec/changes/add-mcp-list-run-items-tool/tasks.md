## 1. Tool implementation

- [x] 1.1 Write a failing test `TestMCPListRunItemsListsItems` in `apps/api/internal/mcp_test/mcp_scenarios_test.go`: create a run with 2 cases, call `list_run_items` with the run key, assert both items are returned with their case keys and current statuses, and the raw result has no `id`/`runId`/`caseId` fields.
- [x] 1.2 Write a failing test `TestMCPListRunItemsPaginatesWithCursor`: create a run with 3 cases, call `list_run_items` with `limit: 2`, assert 2 items and a non-empty `nextCursor` are returned, then call again with that cursor and assert the remaining 1 item is returned with `nextCursor` empty/absent.
- [x] 1.3 Write a failing test `TestMCPListRunItemsDeniedWithoutPermission`: call `list_run_items` as an actor without `PermRead` on the run's project, assert a permission error.
- [x] 1.4 Run the new tests, confirm they fail (tool doesn't exist yet).
- [x] 1.5 Implement `RunItemOutput`/`AssigneeOutput` types and `ListRunItemsInput`/`ListRunItemsOutput` in `apps/api/internal/mcp/read_tools.go` per design.md D3, plus the `list_run_items` handler following `getRunProgress`'s resolution/permission pattern (design.md D4), calling `svc.RunItemsPage` with a constant empty assignee filter (design.md D1) and wrapping the result per design.md D2's envelope shape.
- [x] 1.6 Register the new tool in `registerReadTools`.
- [x] 1.7 Add the result-text summary line per design.md D5.
- [x] 1.8 Run the tests, confirm they pass.

## 2. Documentation

- [x] 2.1 Add `list_run_items` to `docs/mcp-server.md`'s tool reference table, correcting the tool count to 13.
- [x] 2.2 Update `ROADMAP.md`'s MCP tool surface line to include `list_run_items` (13 tools).

## 3. Full verification

- [x] 3.1 Run `go build ./... && go test ./...` in `apps/api`, confirm 100% pass, no regressions.
- [x] 3.2 Run `make coverage-api`, confirm the ≥80% gate still passes.
- [x] 3.3 Run `make lint-api`, confirm clean.
