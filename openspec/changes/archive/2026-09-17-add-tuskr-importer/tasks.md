## 1. `tuskrclient`: paced client + read endpoints

- [x] 1.1 Write failing tests for a request pacer enforcing a minimum interval between outgoing calls (D-T4) in `tools/import-connector/internal/tuskrclient/client_test.go`.
- [x] 1.2 Implement the pacer and `New(tenantID, token string) *Client` in `tools/import-connector/internal/tuskrclient/client.go`, carrying the token as `Authorization: Bearer` and the tenant id in the URL path on every call. Confirm tests pass.
- [x] 1.3 Write failing tests for `ListTestSuites` decoding a paginated `{rows: [{id, name, sections: [{id, name}]}], meta: {total, pages}}` fixture response, paginating until every page is fetched.
- [x] 1.4 Implement `ListTestSuites` against a fake `httptest.Server`. Confirm tests pass.
- [x] 1.5 Write failing tests for `ListTestCases` decoding a paginated case-list fixture including a `customFields` map per case.
- [x] 1.6 Implement `ListTestCases`. Confirm tests pass.
- [x] 1.7 Write a failing test asserting a non-200 response from any endpoint returns a clear, wrapped error (not a panic or silent empty result).
- [x] 1.8 Implement the shared error-wrapping in the client's request helper. Confirm tests pass.
- [x] 1.9 Run `go test ./tools/import-connector/internal/tuskrclient/...` and confirm full pass; check coverage is in line with sibling client packages (80.8-87.3% range) before moving on.

## 2. `internal/importer`: Tuskr mapping branch

- [x] 2.1 Write failing tests for `BuildTuskrPlan` mapping a Test Suite/Section fixture (from a fake `TuskrReader`) to a nested `casePlan` folder tree (one level: Suite → Section, D-T2), in `tools/import-connector/internal/importer/importer_test.go`.
- [x] 2.2 Add the `TuskrReader` interface and implement `toTuskrCasePlan`/`BuildTuskrPlan` folder-tree mapping in `tools/import-connector/internal/importer/importer.go`. Confirm tests pass.
- [x] 2.3 Write failing tests for steps-shape detection (D-T3): a case with a custom field valued as an array of `{step, expectedResult}`-shaped entries maps to ordered `casePlan` steps and that field is excluded from the generic custom-field loop; a case with no such field has an empty steps list.
- [x] 2.4 Implement steps-shape detection in `toTuskrCasePlan`. Confirm tests pass.
- [x] 2.5 Write failing tests for generic custom-field mapping (D-T5): a string-valued field (other than the detected steps field) becomes a reused `text` custom field; a non-string-valued field is dropped and named individually in `plan.Unmapped`.
- [x] 2.6 Implement generic custom-field mapping. Confirm tests pass.
- [x] 2.7 Write a failing test for `RunTuskr` in dry-run mode making zero `testpulseclient` write calls, reusing the existing fake-writer test harness.
- [x] 2.8 Implement `RunTuskr`. Confirm tests pass.
- [x] 2.9 Run `go test ./tools/import-connector/internal/importer/...` and confirm full pass.

## 3. `internal/poller` and `cmd/import-connector`: wire the `tuskr` source

- [x] 3.1 Write failing tests in `tools/import-connector/internal/poller/poller_test.go` for a claimed `tuskr` job: dry-run success, real-run success, missing-credentials error, and connect-failure error — add `fakeTuskr`/`newFakeTuskr`/`claimedTuskrJob` test fixtures.
- [x] 3.2 Implement the `NewTuskrClient` function type, thread it through `Once`/`runClaimedJob`, and add `runTuskrJob` with credential resolution (`tenantId`, `personalAccessToken`, `projectId`) in `tools/import-connector/internal/poller/poller.go`. Confirm tests pass.
- [x] 3.3 Wire `newTuskr` in `tools/import-connector/cmd/import-connector/main.go`.
- [x] 3.4 Run `go test ./tools/import-connector/...` and confirm the full module passes.

## 4. Web: Connect screen

- [x] 4.1 Write a failing test in `apps/web/src/pages/ProjectsPage.test.tsx` asserting "Import from Tuskr" appears as a seventh source entry linking to `/projects/import/tuskr`.
- [x] 4.2 Add the Tuskr entry to `apps/web/src/pages/ProjectsPage.tsx`. Confirm the test passes.
- [x] 4.3 Write failing tests in `apps/web/src/pages/ImportProjectPage.test.tsx` for the Tuskr Connect screen: tenant ID/Personal Access Token/project ID fields render, and "Preview import" stays disabled until every required field (plus project name) is filled.
- [x] 4.4 Extend `Source`/`SOURCE_LABEL`, add `tuskrTenantId`/`tuskrToken`/`tuskrProjectId` state, `canSubmitConnect`, `credentialsBody()`, and the Connect-screen field set in `apps/web/src/pages/ImportProjectPage.tsx`. Confirm tests pass.
- [x] 4.5 Run the web test suite for the touched files and confirm full pass.

## 5. E2E, deploy config, docs, and Sample Project showcase

- [x] 5.1 Add Tuskr scenarios (menu entry, route navigation, Connect form validation, trademark disclosure) to `apps/web/e2e/import-connector.spec.ts`, titled with their requirement/scenario names per this project's BDD convention.
- [x] 5.2 Update `deploy/compose/docker-compose.yml`'s `import-connector` service comment and `deploy/helm/testpulse/values.yaml`'s `importConnector.source` comment to include `tuskr` alongside the existing five sources.
- [x] 5.3 Add a "Tuskr importer" section to `docs/integrations.md` covering the rate-limit pacing (D-T4), the steps-shape-detection limitation (D-T3), and the missing-field-definitions limitation (D-T5), following the structure of the existing sections; note this closes out the structural-importer family.
- [x] 5.4 Confirm (stated explicitly, not silently skipped) whether `apps/api/internal/sampledata/seed.go`/`seed_test.go` need updating — expected to be correctly exempt under the same precedent every prior importer documented (a live import can't be seeded without a real account), but verify with `git diff --stat` against both files before concluding so.
- [x] 5.5 Run `make coverage-api` and `make coverage-web` and confirm both remain at or above their 80% gates.

## 6. Verification

- [x] 6.1 Deployed locally, clicked through the full Tuskr Connect flow in a real browser: heading, description, tenant ID/PAT/project ID fields, help text, and trademark disclaimer all confirmed live; submitted the form and confirmed it creates the target project and surfaces the (expected, encryption-key-related) error cleanly in the UI.
- [x] 6.2 Ran the real `import-connector` binary against a dry-run job with fake tenant id/token credentials via the real API. Reached `status: "failed"` cleanly with `"listing Tuskr test suites: tuskr test-suite returned 401 Unauthorized"` — a genuine 401 from Tuskr's real live API (api.tuskr.live), no hang or crash — the real-network verification pattern established by Zephyr Scale, Kiwi TCMS, and Xray, since no live Tuskr account is available.
- [x] 6.3 Run `make lint` and confirm it passes.
