## 1. Batched project-key lookup

- [x] 1.1 Write a failing test `TestProjectRepoKeysByIDsReturnsKeysForGivenIDs` in `apps/api/internal/store/projects_test.go`: create 3 projects, call the new method with 2 of their IDs plus one unknown ID, assert the returned map has exactly the 2 known IDs mapped to their correct keys and the unknown ID absent (not an error).
- [x] 1.2 Run the test, confirm it fails (method doesn't exist).
- [x] 1.3 Implement `ProjectRepo.KeysByIDs(ctx, ids []string) (map[string]string, error)` in `apps/api/internal/store/projects.go`: one `SELECT id, key FROM projects WHERE id = ANY($1)` query; return an empty map (not an error) for an empty `ids` slice, without querying.
- [x] 1.4 Run the test, confirm it passes.
- [x] 1.5 Implement `Service.ProjectKeysByIDs(ctx, ids []string) (map[string]string, error)` in `apps/api/internal/service/service.go` as a thin passthrough to the store method.

## 2. TestCaseOutput (upsert_test_case, bulk_add_cases)

- [x] 2.1 Write a failing test `TestMCPUpsertTestCaseOutputHasNoRawProjectOrFolderID` in `apps/api/internal/mcp_test/mcp_scenarios_test.go`: create a case via `upsert_test_case`, decode the raw tool result JSON (not into `domain.TestCase`) into a `map[string]any`, assert the map has a `projectKey` key with the project's real key as its value, and does NOT have `projectId` or `folderId` keys.
- [x] 2.2 Run the test, confirm it fails (fields are still present under their old names).
- [x] 2.3 Add `TestCaseOutput` to `apps/api/internal/mcp/write_tools.go` per design.md D2's table, plus a `toTestCaseOutput(c domain.TestCase, projectKey string) TestCaseOutput` helper.
- [x] 2.4 Update `upsertTestCase`'s handler return type and both its create/edit return paths to build `TestCaseOutput` (project key is already resolved in-handler for the create path via `ProjectIDByKey`'s input `in.ProjectKey`; for the edit path, resolve it via the already-fetched `projectID` and a new `svc.ProjectKeysByIDs` single-ID call, or a direct `svc.GetProject(ctx, projectID).Key` — either is fine, no batching needed for a single case).
- [x] 2.5 Run the test, confirm it passes.
- [x] 2.6 Update `BulkAddCasesOutput.Cases` from `[]domain.TestCase` to `[]TestCaseOutput`; update `bulkAddCases`'s handler to map each created case through `toTestCaseOutput` using the batch's single already-resolved project key.
- [x] 2.7 Write a failing test `TestMCPBulkAddCasesOutputHasNoRawProjectOrFolderID`: call `bulk_add_cases`, decode the raw result into `map[string]any`, assert each entry in `cases` has `projectKey` and lacks `projectId`/`folderId`.
- [x] 2.8 Run the test, confirm it fails, then passes once 2.6 is in place (2.6 and 2.7 land together since they're one call site).

## 3. StepGroupOutput (upsert_step_group)

- [x] 3.1 Write a failing test `TestMCPUpsertStepGroupOutputHasNoRawProjectID`: create a step group via `upsert_step_group`, decode the raw result into `map[string]any`, assert `projectKey` is present and `projectId` is absent.
- [x] 3.2 Run the test, confirm it fails.
- [x] 3.3 Add `StepGroupOutput` per design.md D2, update `upsertStepGroup`'s handler return type and both its create/edit paths.
- [x] 3.4 Run the test, confirm it passes.

## 4. SuiteOutput (upsert_test_suite, update_suite_membership)

- [x] 4.1 Write a failing test `TestMCPUpsertTestSuiteOutputHasNoRawIDs`: create a suite via `upsert_test_suite`, decode the raw result into `map[string]any`, assert `projectKey` and `caseKeys` are present and `projectId`/`caseIds` are absent.
- [x] 4.2 Run the test, confirm it fails.
- [x] 4.3 Rename/expand `UpdateSuiteMembershipOutput` to `SuiteOutput` per design.md D2's table (adds `Name`, `PassRate`, `LastRunAt`); add a `toSuiteOutput(s domain.Suite, svc *service.Service, ctx context.Context) (SuiteOutput, error)` helper that resolves the project key and maps `CaseIDs`→`CaseKeys` via `svc.GetCase` per ID (same approach `updateSuiteMembership` already uses).
- [x] 4.4 Update `upsertTestSuite`'s handler return type to `SuiteOutput`, converting via the new helper on both its create and rename paths.
- [x] 4.5 Update `updateSuiteMembership`'s handler return type from `UpdateSuiteMembershipOutput` to `SuiteOutput`, using the same helper (replacing its own inline conversion logic).
- [x] 4.6 Update the tool registration for `update_suite_membership` if its output type name is referenced there; update all existing `mcp_test` references to `mcp.UpdateSuiteMembershipOutput` (from `add-mcp-suite-membership-tool`) to `mcp.SuiteOutput`.
- [x] 4.7 Run the test, confirm it passes; run the full `TestMCPUpdateSuiteMembership*` suite from `add-mcp-suite-membership-tool`, confirm all still pass against the renamed type.

## 5. ResultOutput (record_result)

- [x] 5.1 Write a failing test `TestMCPRecordResultOutputHasRunAndCaseKeyNotRunItemID`: call `record_result`, decode the raw result into `map[string]any`, assert `runKey` and `caseKey` are present and match the call's inputs, and `runItemId` is absent.
- [x] 5.2 Run the test, confirm it fails.
- [x] 5.3 Add `ResultOutput` per design.md D2/D5; update `recordResult`'s handler return type, attaching `in.RunKey`/`in.CaseKey` (already available in-handler, no new lookup) onto the returned value.
- [x] 5.4 Run the test, confirm it passes.

## 6. SearchResultOutput (search) — batched project-key resolution

- [x] 6.1 Write a failing test `TestMCPSearchOutputHasNoRawProjectID`: create 2 projects each with a matching case, search across both (unscoped token), decode the raw result into `map[string]any`, assert every entry in `results` has `projectKey` (matching one of the two real project keys) and lacks `projectId`.
- [x] 6.2 Run the test, confirm it fails.
- [x] 6.3 Add `SearchResultOutput` per design.md D2; update `SearchOutput.Results` from `[]domain.SearchResult` to `[]SearchResultOutput`; update `search`'s handler to collect distinct `ProjectID`s from `svc.Search`'s results, call `svc.ProjectKeysByIDs` once (design.md D3), then map each result through the returned map.
- [x] 6.4 Update the existing `TestMCPSearchFindsMatchesAndRespectsProjectScoping` (mcp_scenarios_test.go:826, currently asserts `results[0].ProjectID != visible.ID`) to assert `results[0].ProjectKey != visible.Key` instead (design.md Risks).
- [x] 6.5 Run the tests, confirm they pass.

## 7. get_details: Release/TestPlan output types + type-switch conversion

- [x] 7.1 Write a failing test `TestMCPGetDetailsReleaseHasNoRawProjectID`: create a release via `svc.CreateRelease` (or the equivalent service call), fetch it via `get_details` with `entityType: "release"`, decode the raw result into `map[string]any`, assert `projectKey` is present and `projectId` is absent.
- [x] 7.2 Write a failing test `TestMCPGetDetailsTestPlanHasNoRawProjectOrReleaseID`: create a test plan, fetch it via `get_details` with `entityType: "testPlan"`, assert `projectKey` and `releaseKey` are present and `projectId`/`releaseId` are absent.
- [x] 7.3 Run the tests, confirm they fail.
- [x] 7.4 Add `ReleaseOutput`/`TestPlanOutput` per design.md D2.
- [x] 7.5 Update `getDetails`'s handler (read_tools.go) to type-switch on `Service.GetDetails`'s result: `domain.TestCase`→`TestCaseOutput`, `domain.Suite`→`SuiteOutput`, `domain.StepGroup`→`StepGroupOutput` (if reachable via get_details — verify; if not reachable, skip), `domain.Release`→`ReleaseOutput`, `domain.TestPlan`→`TestPlanOutput`; `domain.Run`/`domain.Project` pass through unchanged (already clean per design.md Context).
- [x] 7.6 Run the tests, confirm they pass; run the existing `TestMCPGetDetailsFetchesEveryEntityType` and `TestMCPGetDetailsFetchesByEntityTypeAndKey`, confirm they still pass against the converted output values.

## 8. Documentation

- [x] 8.1 Add a short note to `docs/mcp-server.md`'s Tools section: every tool's output identifies related entities by key, never by internal ID — if you need an entity's key from another tool's result, it's already there under a `*Key` field.

## 9. Full verification

- [x] 9.1 Run `go build ./... && go test ./...` in `apps/api`, confirm 100% pass, no regressions.
- [x] 9.2 Run `make coverage-api`, confirm the ≥80% gate still passes.
- [x] 9.3 Run `make lint-api`, confirm clean.
