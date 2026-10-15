## 1. Migration + domain + contract

- [x] 1.1 Add migration `apps/api/internal/db/migrations/00028_run_configuration.sql`:
  `ALTER TABLE test_runs ADD COLUMN configuration text;` (nullable, no
  backfill).
- [x] 1.2 Add `Configuration string` (`json:"configuration,omitempty"`)
  to `domain.Run` in `apps/api/internal/domain/domain.go`.
- [x] 1.3 Add `configuration` to the `Run` schema in
  `packages/shared/openapi.yaml` (nullable string, same style as
  `suiteKey`/`testPlanKey`), and to the create-run request body schema.
  Run `make generate` and commit the regenerated TS client/API docs
  embed alongside.

## 2. CreateRun carries Configuration through (TDD)

- [x] 2.1 Write a failing Go test in `apps/api/internal/service/service_test.go`
  (or sibling test file) asserting `CreateRun` with
  `RunInput{Configuration: "Chrome"}` produces a run whose
  `Configuration` field equals `"Chrome"`. Run the test, confirm it
  fails (field doesn't exist yet / is empty).
- [x] 2.2 Add `Configuration string` to `service.RunInput`
  (`service.go`), thread it through `CreateRun` into the store layer
  (`store.CreateWithSpecs`/`createWithSpecs` in `store/runs.go` — add a
  `configuration` parameter and column to the INSERT), and into the
  row-scanning code that builds `domain.Run` from a `test_runs` row
  (wherever `Run.Name`/`SuiteKey` are currently scanned).
- [x] 2.3 Run the test from 2.1, confirm it passes. Run the full
  `apps/api/internal/service` and `apps/api/internal/store` test
  suites, confirm nothing else broke.
- [x] 2.4 Update `handlers.go`'s `createRun` to read `configuration`
  from the decoded request body and pass it into `service.RunInput`.
  Add a handler-level test (`handlers_test.go`, mirroring the existing
  `createRun` test) asserting a run created with `"configuration":
  "Firefox"` in the POST body round-trips that value in the response.
- [x] 2.5 Commit: `feat(api): add optional configuration label to runs`.

## 3. Coverage matrix endpoint (TDD)

- [x] 3.1 Write a failing store-layer test for a new
  `RunRepo.ItemsByRunIDs(ctx, runIDs []string) ([]domain.RunItem, error)`
  method (mirrors the existing `Items(ctx, runID, assigneeID)` but
  takes multiple run IDs via `WHERE run_id = ANY($1)`) — assert it
  returns items from all of 2+ given runs in one call. Confirm it fails
  (method doesn't exist).
- [x] 3.2 Implement `ItemsByRunIDs` in `apps/api/internal/store/runs.go`,
  reusing the existing row-scanning logic from `Items`. Run the test
  from 3.1, confirm it passes.
- [x] 3.3 Write a failing service-layer test for a new
  `Service.CoverageMatrix(ctx, testPlanID string) (domain.CoverageMatrix, error)`
  — define `domain.CoverageMatrix` (configurations list with
  runKey/label, cases list with caseKey/title/cells map keyed by
  runKey to `{runItemKey, status}`). Test setup: a Test Plan with 2
  runs (one with `Configuration: "Chrome"`, one with no configuration),
  overlapping but not identical case sets. Assert: both runs appear as
  columns (one labeled by its configuration, one by its name), the
  union of cases appears as rows, and the case missing from one run's
  items is absent from that run's `cells` entry. Confirm it fails
  (method doesn't exist).
- [x] 3.4 Implement `Service.CoverageMatrix` in `service.go`: call
  `ListRunsByTestPlan`, collect run IDs, call `store.Runs.ItemsByRunIDs`
  once, pivot in memory into `domain.CoverageMatrix`. Run the test from
  3.3, confirm it passes.
- [x] 3.5 Add `GET /plans/{planKey}/coverage-matrix` to `handlers.go`
  (same `PermRead`/`projectIDFromTestPlan` middleware as the existing
  `/plans/{planKey}/rollup` route) and `packages/shared/openapi.yaml`.
  Add a handler-level test. Run `make generate`.
- [x] 3.6 Commit: `feat(api): add Test Plan coverage matrix endpoint`.

## 4. NewRunPage: configuration input (TDD)

- [x] 4.1 Write a failing Vitest test in `NewRunPage.test.tsx` asserting
  that typing a value into a new "Configuration" input and submitting
  sends `configuration` in the `POST /api/v1/projects/{projectKey}/runs`
  body, and that leaving it blank omits the key entirely (matching the
  existing `suiteKey`/`testPlanKey` omit-when-empty pattern). Confirm
  it fails (input doesn't exist).
- [x] 4.2 Add the `Configuration` input to `NewRunPage.tsx`'s form grid,
  wire it into `handleCreateRun`'s request body with the same
  `...(x ? {...} : {})` spread pattern already used for
  `suiteKey`/`testPlanKey`. Run the test from 4.1, confirm it passes.
- [x] 4.3 Commit: `feat(web): add configuration field to new-run form`.

## 5. TestPlanDetailPage: Coverage Matrix section (TDD)

- [x] 5.1 Write a failing Vitest test in `TestPlanDetailPage.test.tsx`
  asserting: given a plan with 2+ runs and a mocked
  `GET /api/v1/plans/{planKey}/coverage-matrix` response, the page
  renders a "Coverage Matrix" section with the expected run-column
  labels, case rows, status badges for filled cells, and a dash for a
  gap cell. Confirm it fails (section doesn't exist).
- [x] 5.2 Implement the Coverage Matrix card per the validated Pepe mock
  (bea10112-1b96-46d7-a5c2-f4a76ee3d2bf): full-width card below the
  existing plan-grid, sticky first column + `overflow-x-auto`, cells
  using the existing `StatusBadge` component linked to the run item,
  gap cells as a plain `—` (no badge/link), a neutral gap-count chip
  and muted meta-line near the card title, dedicated empty-state when
  the plan has runs but no recorded items, rendered only when the plan
  has ≥1 run. Run the test from 5.1, confirm it passes. (Column headers
  carry only `label`, linked to the run — the mock's run-name sub-line
  and open/closed badge per column aren't representable with the
  finalized `CoverageMatrixConfiguration{runKey,label}` contract, so
  they were dropped rather than widening the API past design.md D3.)
- [x] 5.3 Start the dev stack and manually click through the real page
  against seeded data (created a second, differently-configured run on
  the Sample Project's existing "iOS" test plan via the real UI) to
  confirm the mock translated correctly to the real fonts/icons/spacing
  Pepe's sandboxed mock couldn't render — matrix, gap chip, meta line,
  gap dashes, and cell→run-item navigation all verified working.
- [x] 5.4 Commit: `feat(web): add coverage matrix to Test Plan detail page`.

## 6. Sample Project showcase

- [x] 6.1 In `apps/api/internal/sampledata/seed.go`, add a Test Plan
  with 3 runs tagged `Configuration` "Chrome"/"Firefox"/"iOS Safari",
  sharing most but not all cases, with a realistic pass/fail/skip mix
  and at least one genuine coverage gap (a case present in two of the
  three runs' item lists but not the third).
- [x] 6.2 Add/extend a `seed_test.go` assertion confirming the new Test
  Plan and its runs' configurations exist after seeding.
- [x] 6.3 Commit: `feat(sampledata): showcase run configurations and coverage matrix`.

## 7. MCP agent parity (discovered while writing docs)

- [x] 7.0a `create_test_run`'s MCP tool (`internal/mcp/write_tools.go`)
  had no `configuration` field at all — only the REST/web path got one
  in task groups 1-2, leaving agents unable to set or see it, against
  CLAUDE.md's standing "every capability treats actor as human-or-
  agent" rule. Write a failing MCP scenario test
  (`TestMCPCreateTestRunWithConfiguration`) asserting a `configuration`
  argument round-trips into the created run. Confirm it fails (unknown
  property rejected by the tool's input schema).
- [x] 7.0b Add `Configuration string` to `CreateTestRunInput`, thread it
  into `service.RunInput`, and add `Configuration *string` to
  `RunOutput`/`toRunOutput` (shared by `create_test_run` and
  `get_details`). Run the test from 7.0a, confirm it passes; run the
  full `internal/mcp_test` suite, confirm nothing else broke.
- [x] 7.0c Commit: `feat(mcp): add configuration to create_test_run`.

## 8. Docs

- [x] 8.1 Update relevant `docs/` pages describing Test Plans/Runs to
  mention the new `configuration` field and the Coverage Matrix
  (`docs/test-management.md`, `docs/api.md`'s REST endpoint table, and
  `docs/mcp-server.md`'s `create_test_run` row — covering all three
  surfaces, not just the web UI).
- [x] 8.2 Commit: `docs: document run configurations and coverage matrix`.

## 9. Spec sync & archive

- [x] 9.1 Verify `openspec validate --changes add-run-configurations --strict` passes.
- [x] 9.2 Run `/opsx:archive add-run-configurations`, creating the new
  `run-configurations` spec under `openspec/specs/`.
