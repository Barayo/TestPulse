## 1. Tool implementation

- [x] 1.1 Write a failing test `TestMCPUpdateSuiteMembershipAddCase` in `apps/api/internal/mcp_test/mcp_scenarios_test.go`: create a suite and a case in the same project, call `update_suite_membership` with `action: "add"`, assert the response's membership list includes the case's key.
- [x] 1.2 Write a failing test `TestMCPUpdateSuiteMembershipRemoveCase`: add a case to a suite, then call `update_suite_membership` with `action: "remove"`, assert the response's membership list no longer includes the case's key.
- [x] 1.3 Write a failing test `TestMCPUpdateSuiteMembershipAddIsIdempotent`: call `update_suite_membership` with `action: "add"` twice for the same case, assert the second call succeeds with no error and membership contains the case exactly once.
- [x] 1.4 Write a failing test `TestMCPUpdateSuiteMembershipRemoveNonMemberIsNoop`: call `update_suite_membership` with `action: "remove"` for a case never added to the suite, assert the call succeeds with no error.
- [x] 1.5 Write a failing test `TestMCPUpdateSuiteMembershipDeniedWithoutPermission`: call `update_suite_membership` as an actor without `PermSuiteEditMembership` on the suite's project, assert a permission error and unchanged membership.
- [x] 1.6 Write a failing test `TestMCPUpdateSuiteMembershipRejectsCrossProjectCase`: call `update_suite_membership` with `action: "add"` for a suite and case in different projects, assert a validation error mentioning the cross-project mismatch.
- [x] 1.7 Run the new tests, confirm they fail (tool doesn't exist yet).
- [x] 1.8 Implement `UpdateSuiteMembershipInput` (`SuiteKey`, `CaseKey`, `Action` with a jsonschema enum of `"add"`/`"remove"`) and its handler in `apps/api/internal/mcp/write_tools.go`, following `upsertTestSuite`'s exact structure (design.md Context): resolve `SuiteKey`→ID via `svc.SuiteIDByKey`, resolve project ID via `svc.ProjectIDForSuite`, `svc.Authorize(ctx, domain.PermSuiteEditMembership, projectID)`, resolve `CaseKey`→ID, branch on `Action` to call `svc.AddCaseToSuite`/`svc.RemoveCaseFromSuite`, then re-fetch the suite via `svc.GetSuite` and map `CaseIDs`→case keys for the result (design.md D3).
- [x] 1.9 Register the new tool in `registerWriteTools` (write_tools.go:53-89) as `update_suite_membership`.
- [x] 1.10 Run the tests, confirm they pass.

## 2. Documentation

- [x] 2.1 Add `update_suite_membership` to `docs/mcp-server.md`'s tool reference table, and correct its "Twelve coarse-grained, hybrid tools" prose (now accurate at 12) and its table to include the tool — also verify `upsert_step_group`'s existing row is present (it was previously missing from the tool-count discrepancy this change fixes).
- [x] 2.2 Correct `ROADMAP.md`'s MCP tool surface line (currently "~11" with a stale name list missing `upsert_step_group`) to list all 12 current tool names accurately, including `update_suite_membership`.

## 3. Full verification

- [x] 3.1 Run `go build ./... && go test ./...` in `apps/api`, confirm 100% pass, no regressions.
- [x] 3.2 Run `make coverage-api`, confirm the ≥80% gate still passes.
- [x] 3.3 Run `make lint-api`, confirm clean.
