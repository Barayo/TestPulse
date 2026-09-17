## 1. `xrayclient`: shared interface + Cloud implementation

- [x] 1.1 Write failing tests for `NewCloud` authenticating against a fake `httptest.Server` standing in for `POST /api/v2/authenticate` (success returns a usable client; a non-200 response returns a clear, wrapped error) in `tools/import-connector/internal/xrayclient/cloud_test.go`.
- [x] 1.2 Implement `Client` interface (`ListFolders`, `ListTests`, `GetTestSteps`) and `NewCloud(ctx, baseHost, clientID, clientSecret, projectKey string) (Client, error)` in `tools/import-connector/internal/xrayclient/cloud.go`, carrying the returned bearer token as `Authorization: Bearer` on later calls. Confirm tests from 1.1 pass.
- [x] 1.3 Write failing tests for `ListFolders` issuing a `getFolder` GraphQL query against a fake server returning a fixture response (folder name, path, nested folders) built from Xray's documented GraphQL schema shape.
- [x] 1.4 Implement `ListFolders` on the Cloud client. Confirm tests pass.
- [x] 1.5 Write failing tests for `ListTests` issuing a `getTests` GraphQL query with `jira(fields: ["summary", "description"])` plus Xray-native fields (`testType`, `steps`), paginating via the `limit` argument across a fixture with more than one page.
- [x] 1.6 Implement `ListTests` on the Cloud client, including the pagination loop. Confirm tests pass.
- [x] 1.7 Write failing tests for `GetTestSteps` (Manual-type tests return structured steps from the same `getTests` response; Cucumber/Generic-type tests return the script/definition text with no steps).
- [x] 1.8 Implement step extraction on the Cloud client per D-X5. Confirm tests pass.
- [x] 1.9 Run `go test ./tools/import-connector/internal/xrayclient/...` and confirm full pass; check coverage is in line with sibling client packages (80.8-85.9% range) before moving on.

## 2. `xrayclient`: Server/Data Center implementation

- [x] 2.1 Write failing tests for `NewServer(ctx, siteURL, personalAccessToken, projectKey string) (Client, error)` validating the PAT is carried as `Authorization: Bearer` on later calls, against a fake `httptest.Server`.
- [x] 2.2 Implement `NewServer` in `tools/import-connector/internal/xrayclient/server.go`. Confirm tests pass.
- [x] 2.3 Write failing tests for `ListFolders` calling `GET /rest/raven/1.0/api/testrepository/{projectKey}/folders` against a fixture response.
- [x] 2.4 Implement `ListFolders` on the Server client. Confirm tests pass.
- [x] 2.5 Write failing tests for `ListTests` calling `GET /rest/raven/1.0/api/testrepository/{projectKey}/folders/{folderId}/tests` (with `allDescendants` where relevant) plus a per-test `GET /rest/api/2/issue/{testIssueKey}` call for summary/description, against fixture responses for both endpoints.
- [x] 2.6 Implement `ListTests` on the Server client, combining both calls per test. Confirm tests pass.
- [x] 2.7 Write failing tests for `GetTestSteps` calling `GET /rest/raven/1.0/api/test/{testIssueKey}/step` for Manual-type tests, and falling back to the Jira issue's script/definition field for Cucumber/Generic types, against fixture responses.
- [x] 2.8 Implement step extraction on the Server client per D-X5. Confirm tests pass.
- [x] 2.9 Run `go test ./tools/import-connector/internal/xrayclient/...` and confirm full pass; check coverage is in line with sibling client packages before moving on.

## 3. `internal/importer`: Xray mapping branch

- [x] 3.1 Write failing tests for `BuildXrayPlan` mapping a nested Test Repository folder fixture (from a fake `XrayReader`) to a nested `casePlan` folder tree, in `tools/import-connector/internal/importer/importer_test.go`.
- [x] 3.2 Add the `XrayReader` interface and implement `toXrayCasePlan`/`BuildXrayPlan` folder-tree mapping (D-X4) in `tools/import-connector/internal/importer/importer.go`. Confirm tests pass.
- [x] 3.3 Write failing tests for Manual-type test steps mapping to `casePlan` steps in order, and Cucumber/Generic-type tests mapping their script text to `Description` with an empty steps list (D-X5).
- [x] 3.4 Implement step mapping in `BuildXrayPlan`. Confirm tests pass.
- [x] 3.5 Write failing tests for custom-field mapping: a string-valued field becomes a reused `text` custom field; a non-string-valued field, and each Xray-native execution/automation field, is dropped and named individually in `plan.Unmapped` (D-X6).
- [x] 3.6 Implement custom-field mapping in `BuildXrayPlan`. Confirm tests pass.
- [x] 3.7 Write a failing test for `RunXray` in dry-run mode making zero `testpulseclient` write calls, reusing the existing fake-writer test harness.
- [x] 3.8 Implement `RunXray`. Confirm tests pass.
- [x] 3.9 Run `go test ./tools/import-connector/internal/importer/...` and confirm full pass.

## 4. `internal/poller` and `cmd/import-connector`: wire the `xray` source

- [x] 4.1 Write failing tests in `tools/import-connector/internal/poller/poller_test.go` for a claimed `xray` job: dry-run success, real-run success, missing-credentials error, and login-failure error for both `mode: "cloud"` and `mode: "server"` — add `fakeXray`/`newFakeXray`/`claimedXrayJob` test fixtures.
- [x] 4.2 Implement `NewXrayCloudClient`/`NewXrayServerClient` function types, thread them through `Once`/`runClaimedJob`, and add `runXrayJob` with `mode`-based constructor selection and credential resolution (`mode`, `clientId`/`clientSecret` or `siteUrl`/`personalAccessToken`, `projectKey`) in `tools/import-connector/internal/poller/poller.go`. Confirm tests pass.
- [x] 4.3 Wire `newXrayCloud`/`newXrayServer` in `tools/import-connector/cmd/import-connector/main.go`.
- [x] 4.4 Run `go test ./tools/import-connector/...` and confirm the full module passes.

## 5. Web: Connect screen with Cloud/Server toggle

- [x] 5.1 Write a failing test in `apps/web/src/pages/ProjectsPage.test.tsx` asserting "Import from Xray" appears as a sixth source entry linking to `/projects/import/xray`.
- [x] 5.2 Add the Xray entry to `apps/web/src/pages/ProjectsPage.tsx`. Confirm the test passes.
- [x] 5.3 Write failing tests in `apps/web/src/pages/ImportProjectPage.test.tsx` for the Xray Connect screen: the Cloud/Server mode toggle defaults to Cloud, switching modes swaps the visible credential fields, and "Preview import" stays disabled until every required field for the active mode (plus project name) is filled.
- [x] 5.4 Extend `Source`/`SOURCE_LABEL`, add `xrayMode`/`xrayClientId`/`xraySecret`/`xraySiteUrl`/`xrayPat`/`xrayProjectKey` state, `canSubmitConnect`, `credentialsBody()` (mode-dependent shape), and the Connect-screen mode toggle + field sets in `apps/web/src/pages/ImportProjectPage.tsx`. Confirm tests pass.
- [x] 5.5 Run `npm test --workspace apps/web -- ImportProjectPage ProjectsPage` (or the project's equivalent web test command) and confirm full pass.

## 6. E2E, deploy config, docs, and Sample Project showcase

- [x] 6.1 Add Xray scenarios (both Cloud and Server modes: menu entry, route navigation, mode toggle, Connect form validation) to `apps/web/e2e/import-connector.spec.ts`, titled with their requirement/scenario names per this project's BDD convention.
- [x] 6.2 Update `deploy/compose/docker-compose.yml`'s `import-connector` service comment and `deploy/helm/testpulse/values.yaml`'s `importConnector.source` comment to include `xray` alongside the existing four sources.
- [x] 6.3 Add an "Xray importer" section to `docs/integrations.md` covering both modes, the PAT-only decision (D-X2), and the stated custom-field limitation (D-X6), following the structure of the existing TestRail/Qase/Zephyr Scale/Kiwi TCMS sections.
- [x] 6.4 Update `apps/api/internal/sampledata/seed.go` (and `seed_test.go`) so the Sample Project's content demonstrates the Xray import capability, per CLAUDE.md's standing Sample-Project-showcase rule.
- [x] 6.5 Run `make coverage-api` and `make coverage-web` and confirm both remain at or above their 80% gates.

## 7. Verification

- [x] 7.1 Deploy locally via `docker compose -f deploy/compose/docker-compose.yml --profile import-connector up` and, in a real browser, click through the full Xray Connect flow for both Cloud and Server modes. Confirmed live: entry point navigation, heading, description, mode toggle, all Cloud fields, help text, and trademark disclaimer render correctly. The Server-mode field swap itself couldn't be confirmed by an actual click due to a `claude-in-chrome` tooling fault this session (`Cannot access a chrome-extension:// URL of different extension`, reproduced across 3 fresh tabs, affecting click/screenshot/JS-eval alike — a tooling artifact, not app behavior) — per user decision, this is covered instead by the 38 passing Vitest tests (`ImportProjectPage.test.tsx`), which assert the exact same mode-toggle-swap behavior via React Testing Library.
- [x] 7.2 Ran the real `import-connector` binary against a dry-run job for both modes pointed at a real-but-wrong endpoint (fake client_id/secret for Cloud; TestPulse's own app as the site URL for Server) via direct API calls (browser UI submission blocked by the same tooling fault as 7.1). Both reached `status: "failed"` cleanly with clear, distinguishable errors: Cloud got a genuine `401 Unauthorized` from Xray Cloud's real authenticate endpoint; Server got a clear JSON-decode error after TestPulse's own app returned HTML instead of the expected Raven API response. No hang, no crash — the real-network verification pattern established by Zephyr Scale and Kiwi TCMS, since no live Xray account is available.
- [x] 7.3 Run `make lint` and confirm it passes.
