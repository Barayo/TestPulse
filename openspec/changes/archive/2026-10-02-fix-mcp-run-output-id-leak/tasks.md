## 1. RunOutput type

- [x] 1.1 Write a failing test in `apps/api/internal/mcp_test/mcp_scenarios_test.go` (match existing conventions in that file): `create_test_run`'s structured result does not include `id` or `projectId` keys, and includes `key`/`projectKey`/`name`/`status`/`createdAt` with the expected values.
- [x] 1.2 Run the test, confirm it fails (currently leaks `id`/`projectId`).
- [x] 1.3 Add `RunOutput` type to `apps/api/internal/mcp/write_tools.go`, mirroring `domain.Run` with `ID`/`ProjectID` dropped (`ProjectKey` already present and sufficient), and a `toRunOutput(r domain.Run) RunOutput` converter — same shape/placement convention as `toReleaseOutput`/`toTestPlanOutput` in `read_tools.go`.
- [x] 1.4 Run the test, confirm it passes.

## 2. create_test_run

- [x] 2.1 Change `createTestRun`'s return type from `sdkmcp.ToolHandlerFor[CreateTestRunInput, domain.Run]` to `sdkmcp.ToolHandlerFor[CreateTestRunInput, RunOutput]`. Update every `domain.Run{}` zero-value return to `RunOutput{}`.
- [x] 2.2 Convert `run` (the `domain.Run` from `svc.CreateRun`) to `RunOutput` via `toRunOutput` immediately after creation; use the converted value for both the idempotency-cache save (`saveIdempotentResult`) and the final return.
- [x] 2.3 Update the idempotency-cache-hit branch's generic type parameter from `idempotentResult[domain.Run]` to `idempotentResult[RunOutput]`.
- [x] 2.4 Run the task-1 test plus the existing idempotency test for `create_test_run`, confirm both pass. Also found and fixed a collateral break: `TestMCPCreateTestRunFromSuiteAndTestPlan` relied on the MCP output's now-removed raw `run.ID` to call `svc.RunItems` directly — updated it to resolve the ID via `svc.RunIDByKey(ctx, run.Key)` instead, the same way any real caller would.

## 3. get_details

- [x] 3.1 Write a failing test: `get_details` with `entityType: "run"` does not include `id` or `projectId` keys in its structured result, matching `create_test_run`'s shape.
- [x] 3.2 Run the test, confirm it fails (`getDetails`'s `default` branch passes `domain.Run` through unconverted).
- [x] 3.3 Add a `case domain.Run:` branch to `getDetails` in `apps/api/internal/mcp/read_tools.go`, converting via `toRunOutput` before returning — same pattern as the existing `domain.TestCase`/`domain.Release`/`domain.TestPlan` branches.
- [x] 3.4 Run the test, confirm it passes.

## 4. Verification

- [x] 4.1 Run `make lint-api coverage-api` — both pass, 82.7% coverage.
- [x] 4.2 Ran the full `mcp_test` package — all pass, confirming no other MCP scenario regressed.
