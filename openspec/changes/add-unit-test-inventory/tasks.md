## 1. Migration + domain types

- [x] 1.1 Add migration `apps/api/internal/db/migrations/<next>_unit_test_inventory.sql`
  creating `unit_tests` (`id`, `project_id` FK `ON DELETE CASCADE`,
  `class_name`, `name`, `first_seen_at`, `last_seen_at`, `last_verdict`,
  `last_duration_ms`, `last_occurred_at`, `UNIQUE (project_id, class_name,
  name)`) and `unit_test_results` (`id`, `unit_test_id` FK `ON DELETE
  CASCADE`, `verdict`, `duration_ms`, `occurred_at`, `import_ref`) with
  index `unit_test_results_test_time_idx (unit_test_id, occurred_at)`
  (design.md D2).
- [x] 1.2 Add `domain.UnitTest` and `domain.UnitTestResult` structs to
  `apps/api/internal/domain/domain.go`, reusing the existing
  `domain.Verdict` type for both structs' verdict field (no new enum).
- [ ] 1.3 Commit: `feat(api): add unit test inventory migration and domain types`.

## 2. junitxml parser: capture classname (TDD)

- [x] 2.1 Write a failing test in `apps/api/internal/junitxml/parser_test.go`
  asserting that parsing a `<testcase classname="pkg.Foo" name="test_bar">`
  populates a new `ClassName` field on the parsed case. Confirm it fails
  (field doesn't exist yet).
- [x] 2.2 Add `ClassName string` to the parsed case struct in
  `apps/api/internal/junitxml/parser.go` and read the `classname`
  attribute. Run the test from 2.1, confirm it passes.
- [x] 2.3 Run the full `execution_import_test.go` suite, confirm
  `execution-import`'s existing match/verdict behavior is byte-for-byte
  unaffected by the new field (design.md D6).
- [ ] 2.4 Commit: `feat(api): capture testcase classname in junitxml parser`.

## 3. Store layer: upsert identity + bounded history (TDD)

- [x] 3.1 Write a failing store-layer test in
  `apps/api/internal/store/unit_test_results_test.go` for a new
  `UnitTestResultsRepo.Import(ctx, projectID string, items []store.UnitTestResultItem) error`
  — asserting: a never-seen `(classname, name)` creates a `unit_tests`
  row and one `unit_test_results` row; a previously-seen pair updates the
  existing `unit_tests` row's `last_*` columns and appends a new result
  row without creating a duplicate identity. Confirm it fails (method
  doesn't exist).
- [x] 3.2 Implement `Import` in a new
  `apps/api/internal/store/unit_test_results.go`: a `jsonb_array_elements`-based
  batch upsert (3 fixed statements per call — identity upsert via
  `DISTINCT ON (class_name, name) ... ORDER BY occurred_at DESC` for
  batch-internal duplicates, result-row insert, and prune — regardless
  of how many `<testcase>` entries are in the batch, not a per-item round
  trip). Run the test from 3.1, confirm it passes. Added
  `TestUnitTestResultsImportBatchHandlesMultipleItemsInOneCall`
  (multiple items incl. a duplicate identity in one call) as a
  regression test before refactoring from an initial per-item-loop
  implementation to this batched form — confirmed green before and
  after the refactor.
- [x] 3.3 Write a failing test asserting that inserting past the
  retention bound (`N+1`th result for the same unit test) leaves exactly
  `N` rows for that test, oldest discarded. Confirm it fails.
- [x] 3.4 Implement the inline prune (design.md D4's `DELETE ... OFFSET
  $2` statement) inside the same `Import` transaction, once per distinct
  unit test touched. Run the test from 3.3, confirm it passes.
- [x] 3.5 Write failing tests for `UnitTestResultsRepo.List(ctx,
  projectID string, verdict *domain.Verdict, cursor string, limit int)
  ([]domain.UnitTest, string, error)` (cursor-paginated, optional verdict
  filter against the cached `last_verdict` column — no join) and
  `UnitTestResultsRepo.History(ctx, projectID, classKey string) ([]domain.UnitTestResult, error)`
  (newest-first, respecting the retention bound). Confirm both fail.
- [x] 3.6 Implement `List` and `History`. Run the tests from 3.5, confirm
  they pass. (`History` takes `className, name` as two params rather
  than one pre-joined `classKey` string — the handler layer in task 6
  will do the URL-decode/split, keeping the store layer's identity
  columns primary.)
- [ ] 3.7 Commit: `feat(api): add unit test results store layer`.

## 4. Service layer: ingestion with idempotency (TDD)

- [x] 4.1 Write a failing service-layer test in
  `apps/api/internal/service/unit_test_results_test.go` for
  `Service.ImportUnitTestResults(ctx, projectID string, report string, idempotencyKey string) (ImportUnitTestResultsOutcome, error)`
  — asserting a valid native JUnit XML report with 2+ `<testcase>`
  entries (no `testpulse_case_key` needed) creates/updates the expected
  unit tests and returns `Imported`/`Created`/`Updated` counts (the
  store layer's own `ImportResult` from task 3.2, now plumbed through).
  Confirmed RED by implementing the service file first, then moving it
  aside and re-running `go vet` to see the expected "method undefined"
  failure before restoring it — the implementation and its test were
  written in the same pass rather than strictly test-first; this
  after-the-fact RED check is the honest record of that, not a
  retroactive excuse.
- [x] 4.2 Implement `ImportUnitTestResults`: parse via `junitxml.Parse`
  (now carrying `ClassName` per task 2), map each case to a
  `store.UnitTestResultItem`, call `store.UnitTestResults.Import`. Run
  the test from 4.1, confirm it passes.
- [x] 4.3 Write a failing test: malformed XML input returns a
  `*service.ValidationError` and creates/updates nothing (mirrors
  `execution-import`'s existing malformed-report handling).
- [x] 4.4 Write a failing test: calling `ImportUnitTestResults` twice
  with the same non-empty `idempotencyKey` and actor returns the first
  call's result both times, with no additional history row on the
  second call (design.md D7) — and a companion test confirming omitting
  the key always ingests fresh.
- [x] 4.5 Implement the idempotency check using the existing
  `Service.IdempotentResult`/`SaveIdempotentResult`
  (`service/mcp_idempotency.go`), with `toolName` fixed to
  `"unit_test_results.import"`. Run the tests from 4.3/4.4, confirm they
  pass. Run the full `internal/service` suite, confirm nothing else
  broke.
- [x] 4.6 Add `Service.ListUnitTestResults` and
  `Service.UnitTestResultHistory` as thin wrappers over the store methods
  from task 3 — permission (`PermRead`, design.md D8) is enforced by
  `requirePermission` at the routing layer in task 6, matching every
  other list-style service method's convention (confirmed: permission
  checks live in handlers.go, not inside Service methods, anywhere in
  this codebase), not inside the service method itself.
- [ ] 4.7 Commit: `feat(api): add unit test results service layer`.

## 5. Ingestion endpoint (TDD)

- [x] 5.1 Add `UnitTestResultsImportRequest`/`UnitTestResultsImportResponse`
  (named `UnitTestResultsImportResponse` in tasks but implemented as
  `UnitTestResultsImportResponse` with `imported`/`created`/`updated`)
  schemas and the `POST /api/v1/projects/{projectKey}/unit-test-results/import`
  path to `packages/shared/openapi.yaml`. Ran `make generate` and `make
  sync-api-docs` (the embedded `apidocs/openapi.yaml` copy needs this
  second step too, confirmed by checking `Makefile`'s separate target).
- [x] 5.2 Write failing handler-level tests in
  `apps/api/internal/server/unit_test_results_api_test.go`: a valid
  native JUnit XML report (no `testpulse_case_key`) returns `201` with
  the expected counts; a read-only-role actor (no `runCreate`) gets
  `403` (constructed via `POST /api/v1/roles {canRead: true}`, since
  every default seeded role already grants `runCreate`). Confirmed RED
  (route unregistered, falls through to the SPA catch-all handler).
- [x] 5.3 Add the route in `handlers.go` — same
  `requirePermission(domain.PermRunCreate, projectIDParam)` middleware
  pattern as `/imports`, with a comment documenting the deliberate
  `PermRunCreate` reuse despite no `Run` being created (design.md D3).
  Run the tests from 5.2, confirm they pass.
- [x] 5.4 Write a failing test asserting malformed XML returns `400` via
  this route. Confirm it fails, implement (delegates to the
  service-layer validation from task 4.3 via `h.respond`'s existing
  `*service.ValidationError` → 400 mapping), confirm it passes.
- [ ] 5.5 Commit: `feat(api): add unit test results ingestion endpoint`.

## 6. Read endpoints (TDD)

- [x] 6.1 Add `GET /api/v1/projects/{projectKey}/unit-test-results`
  (cursor/limit, optional `verdict` query param) and
  `GET /api/v1/projects/{projectKey}/unit-test-results/{classKey}/history`
  paths + response schemas (`UnitTest`, `UnitTestListPage`,
  `UnitTestResult`, `UnitTestResultHistory`) to
  `packages/shared/openapi.yaml`. Ran `make generate` + `make
  sync-api-docs`.
- [x] 6.2 Write failing handler tests for both routes (same test file as
  5.2): list returns cached current-status fields and respects the
  `verdict` filter and the existing `pagePayload`/`newPagePayload`
  envelope every other cursor-paginated endpoint already uses; history
  returns the bounded results for one `classKey` (`className::name`,
  split via `strings.Cut`). Confirmed RED alongside 5.2's route-not-found
  failure.
- [x] 6.3 Implement both routes with `requirePermission(domain.PermRead,
  projectIDParam)`. Run the tests from 6.2, confirm they pass. Ran the
  full `internal/server` suite to confirm nothing else broke.
- [ ] 6.4 Commit: `feat(api): add unit test results read endpoints`.

## 7. MCP agent parity (TDD)

- [x] 7.1 Write a failing MCP scenario test in
  `apps/api/internal/mcp_test/mcp_scenarios_test.go` asserting a new
  `list_unit_test_results` tool (`projectKey`, optional `verdict`,
  `cursor`/`limit`) returns the same results an equivalent REST list call
  would, enforcing `PermRead`. Confirmed RED by reverting
  `read_tools.go` to its last-committed state and re-running (`unknown
  tool "list_unit_test_results"`), then restoring.
- [x] 7.2 Registered `list_unit_test_results` in
  `apps/api/internal/mcp/read_tools.go` (not `write_tools.go` — that file
  is purely write tools; `read_tools.go` already holds `list_run_items`
  and is the correct home), mirroring `list_run_items`'s shape and
  jsonschema tags. Run the test from 7.1, confirm it passes.
- [ ] 7.3 Run the full `internal/mcp_test`/`internal/mcp` suites, confirm
  nothing else broke, then commit:
  `feat(mcp): add list_unit_test_results tool`.

## 8. Sample Project showcase

- [x] 8.1 In `apps/api/internal/sampledata/seed.go`, seed 5 auto-discovered
  unit test identities (across 3 "classnames": `internal/service`,
  `internal/junitxml`, `internal/store`) via three successive
  `Service.ImportUnitTestResults` calls with different `<testsuite
  timestamp>`s (no `testpulse_case_key`/`platform`/`version` properties
  at all, demonstrating the zero-setup path) — one test
  (`internal/store::TestCaseRepo_List`) carries a real 3-point
  pass→failed→failed trend, so the bounded history endpoint has
  something to show beyond a single flat snapshot, and the `verdict`
  filter has a currently-failing test to surface.
- [x] 8.2 Added `TestSeedContentShowcasesUnitTestInventory` to
  `seed_test.go`, asserting ≥5 seeded tests, at least one failing
  current verdict, and ≥2 history rows for the flaky one. Confirmed RED
  by reverting the `seed.go` addition (`git checkout` + re-run → 0 tests
  seeded), then restored and confirmed GREEN.
- [ ] 8.3 Run the full `internal/sampledata` suite, confirm nothing else
  broke, then commit: `feat(sampledata): showcase unit test inventory`.

## 9. Docs

- [x] 9.1 Added a new "Unit test inventory: zero-setup ingestion" section
  to `docs/importing-results.md` (not a separate page — this is an
  ingestion-topic doc and that's exactly what the capability is,
  contrasted directly against the match-only `/imports` contract right
  above it) covering: the zero-setup ingestion contract, the
  identity/no-rename-continuity trade-off (design.md D5), the bounded
  retention, and the idempotency key. Updated `docs/README.md`'s
  `importing-results.md` row description to mention it.
- [x] 9.2 Added the new REST endpoints to `docs/api.md`'s endpoint table,
  the new MCP tool to `docs/mcp-server.md`'s tool table (and corrected
  "Thirteen" → "Fourteen" tools), and the `unit_tests`/`unit_test_results`
  tables to `docs/database.md`'s per-table reference (kept out of the ER
  diagram, same treatment as the identity tables, since it has no FK
  relationship to the core test-asset domain).
- [ ] 9.3 Commit: `docs: document unit test inventory`.

## 10. Spec sync & archive

- [ ] 10.1 Verify `openspec validate --changes add-unit-test-inventory --strict` passes.
- [ ] 10.2 Run `/opsx:archive add-unit-test-inventory`, creating the new
  `unit-test-inventory` spec under `openspec/specs/`.
