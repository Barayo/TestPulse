## 1. Migration

- [x] 1.1 Write a new incremental migration
  (`apps/api/internal/db/migrations/`) creating
  `test_run_item_step_states (run_item_id, step_index, verdict, updated_at)`
  with PK `(run_item_id, step_index)`, FK `run_item_id` →
  `test_run_items(id)` `ON DELETE CASCADE`, and a `verdict` CHECK constraint
  matching the same 4 values as `test_run_results.verdict`.
- [x] 1.2 In the same migration, create
  `test_run_result_steps (result_id, step_index, verdict)` with PK
  `(result_id, step_index)`, FK `result_id` → `test_run_results(id)`
  `ON DELETE CASCADE`, and the same `verdict` CHECK constraint. Write the
  migration's down section dropping both tables.
- [x] 1.3 Run `make test-db-up` (if not already running) and
  `TESTPULSE_TEST_DATABASE_URL=... go test ./internal/db/...` to confirm
  the migration applies and reverses cleanly. (00015_step_level_results.sql
  applies cleanly to version 15; `TestMigrateOnEmptyDatabaseReachesCurrent`,
  `TestMigrateIsIdempotentOnRestart`, `TestReadyWhenMigratedAndReachable`,
  `TestMigrateWithOptionsAllowMissingMatchesNormalMigrateWhenNoGapExists`
  all pass.)

## 2. Domain types

- [x] 2.1 Add `domain.StepResult { StepIndex int; Verdict Verdict }` to
  `apps/api/internal/domain/domain.go`, with a `Validate` method rejecting
  a negative `StepIndex` and an invalid `Verdict` (via the existing
  `ParseVerdict`).
- [x] 2.2 Add `StepStates []StepResult` to `domain.RunItem` and
  `StepResults []StepResult` to `domain.Result`, both `json:"...,omitempty"`.
- [x] 2.3 Add `StepResults []StepResult` to `domain.NewResult`,
  `json:"stepResults,omitempty"`, with no requirement that it be present.
  (Also validated in `NewResult.Validate()`, delegating to
  `StepResult.Validate()` per entry.)
- [x] 2.4 Write `domain` package tests for `StepResult.Validate` (negative
  index rejected, invalid verdict rejected, valid input accepted) in
  `apps/api/internal/domain/domain_test.go`. (`TestStepResultValidation`
  passes; full `go test ./internal/domain/...` green.)

## 3. Store layer

- [x] 3.1 Write a failing store test asserting that upserting the same
  `(run_item_id, step_index)` twice via a new
  `store.RunItems.SetStepState(ctx, runItemID string, stepIndex int, verdict domain.Verdict) (domain.StepResult, error)`
  replaces the prior verdict rather than erroring or duplicating a row.
  Implement `SetStepState` in `apps/api/internal/store/run_items.go` (or
  the file already holding run-item queries) to make it pass.
  **Deviation**: this codebase has no separate `RunItems`/`Results` store
  types — everything run/item/result-related lives on the single
  `*store.RunRepo` (exposed as `store.Runs`). Implemented as
  `RunRepo.SetStepState` in a new `internal/store/step_results.go`
  (`TestSetStepStateUpsertsRatherThanDuplicates` passes).
- [x] 3.2 Write a failing store test for a new
  `store.RunItems.StepStates(ctx, runItemID string) ([]domain.StepResult, error)`
  returning every currently-marked step for a run item, ordered by
  `step_index`, empty slice when none are marked. Implement it.
  (`RunRepo.StepStates`; `TestStepStatesOrderedAndEmptyWhenNoneMarked` passes.)
- [x] 3.3 Write a failing store test confirming
  `test_run_item_step_states` rows are deleted when their run item is
  deleted (cascade). Confirm it passes against the migration from Task 1.
  (`TestStepStatesCascadeDeletedWithRun`, via `s.Runs.Delete(runID)`.)
- [x] 3.4 Write a failing store test for a new
  `store.Results.CreateWithSteps(ctx, runItemID string, res domain.NewResult, stepResults []domain.StepResult, actorKind domain.ResultActorKind, actorRefID string) (domain.Result, error)`
  (or extend the existing result-creation function) that, in one
  transaction, creates the `Result` row and one `test_run_result_steps`
  row per entry in `stepResults`. Implement it, reusing the existing
  result-creation transaction rather than adding a second one.
  **Deviation**: extended the existing `RunRepo.AppendResult` directly
  instead of adding a new method — it already takes `res domain.NewResult`,
  which now carries `StepResults` itself, so no new parameter/method was
  needed. Steps are sorted by index and inserted in the same transaction
  as the `Result` row. (`TestAppendResultSnapshotsSuppliedStepResults`
  passes.)
- [x] 3.5 Write a failing store test confirming a `Result` fetched via the
  existing result-listing query (used by `GET` run item detail) includes
  its `StepResults`, populated via a join, ordered by `step_index`.
  Implement the join. (`Results()` now batch-joins via
  `stepResultsByResults`; `TestAppendResultWithoutStepResultsLeavesNoSnapshot`
  covers the empty case.)
- [x] 3.6 Write a failing store test confirming `test_run_result_steps`
  rows are deleted when their parent `Result`'s run item is deleted
  (cascade, via `Result` → run item, or directly if `test_run_results`
  itself cascades from run item deletion already — check the existing FK
  before adding a redundant one). (`test_run_results.run_item_id` already
  cascades from `test_run_items`, which cascades from `test_runs` — so
  `test_run_result_steps.result_id → test_run_results.id ON DELETE CASCADE`
  chains all the way through; `TestResultStepSnapshotCascadeDeletedWithRun`
  confirms `Delete(runID)` succeeds with no FK violation.)
  Also added, needed for task 4's bounds-checking: `RunRepo.ItemStepCount`
  and wired `RunItem.StepStates` into `Items`/`ItemsPage` via a new
  `stepStatesByItems` batch join (`TestItemsIncludesLiveStepStates`,
  `TestItemStepCountReflectsPinnedContent`). Full `go test ./internal/store/...`
  green (no regressions).

## 4. Service layer

- [x] 4.1 Write a failing service test:
  `s.SetStepResult(ctx, runItemID string, stepIndex int, verdict domain.Verdict) (domain.StepResult, error)`
  rejects a `stepIndex` outside the bounds of the run item's pinned
  `content.steps` length with a `ValidationError`, without writing
  anything. Implement `SetStepResult` in
  `apps/api/internal/service/service.go`, fetching the run item's pinned
  content to check bounds before calling `store.RunItems.SetStepState`.
  **Deviation**: bounds-checking uses the new `store.Runs.ItemStepCount`
  (a targeted count query) rather than fetching the full pinned content —
  cheaper, and the service only ever needs the count. Also gated
  `SetStepResult` behind `checkAssigneeRestriction`, the same gate
  `RecordResult`/`UpdateItem` already use — not explicitly called out in
  design.md, but marking a step is the same execution surface as
  recording a verdict or changing status, so leaving it ungated would be
  an inconsistent gap. (`TestSetStepResultRejectsOutOfBoundsIndex` passes.)
- [x] 4.2 Write a failing service test confirming a valid `SetStepResult`
  call persists and is visible via a subsequent
  `store.RunItems.StepStates` read. Confirm it passes.
  (`TestSetStepResultPersistsAndIsReadable`, via `RunItem.StepStates`.)
- [x] 4.3 Write a failing service test: `RecordResult` called with
  `NewResult.StepResults` empty snapshots whatever is currently in
  `test_run_item_step_states` for that run item into the new `Result` (the
  interactive-UI path). Update `RecordResult` to read current step state
  when `StepResults` is empty, and pass it through to
  `store.Results.CreateWithSteps`.
  **Deviation**: no separate `CreateWithSteps` method exists (see 3.4) —
  `RecordResult` sets `res.StepResults = live` before calling the existing
  `AppendResult`, which now honors whatever `NewResult.StepResults` holds.
  (`TestRecordResultSnapshotsCurrentLiveStateWhenNotSupplied` passes.)
- [x] 4.4 Write a failing service test: `RecordResult` called with
  `NewResult.StepResults` non-empty uses that array verbatim as the new
  `Result`'s snapshot AND upserts each entry into
  `test_run_item_step_states` (so a subsequent `StepStates` read reflects
  it). Implement this sync.
  (`TestRecordResultWithSuppliedStepResultsSyncsLiveState` passes; bounds-
  checked via `checkStepIndicesInBounds` before `AppendResult` runs.)
- [x] 4.5 Write a failing service test confirming step marks are
  unaffected by recording an overall verdict when `NewResult.StepResults`
  is empty (carry-forward — the existing `test_run_item_step_states` rows
  are untouched, not cleared). Confirm it passes given tasks 4.3–4.4's
  implementation (no separate reset logic should exist).
  (`TestStepMarksCarryForwardAfterRecordingOverallVerdict` passes; full
  `go test ./internal/service/...` green, see task 5 notes for the run.)

## 5. API contract & handlers

- [x] 5.1 Add `stepResults` to the `NewResult` schema and a new
  `StepResult` schema (`stepIndex`, `verdict`) to
  `packages/shared/openapi.yaml`; add `stepStates` to `RunItem` and
  `stepResults` to `Result`. Add a new
  `PUT /api/v1/run-items/{itemId}/steps/{stepIndex}` path, body
  `{ verdict }`, responses `200` (returns the updated `StepResult`), `400`
  (out-of-bounds index or invalid verdict), `403`
  (missing `runRecordResult`), `404` (unknown run item).
  **Deviation**: the path is `/api/v1/items/{itemId}/steps/{stepIndex}`,
  not `/api/v1/run-items/...` as drafted in the proposal — every existing
  sibling endpoint (results, attachments, status, jira-link) already lives
  under `/api/v1/items/{itemId}/...`, not `/run-items/...`; matched the
  real convention instead of introducing a new one.
- [x] 5.2 Run `make generate` and commit the regenerated
  `packages/shared/src/api.ts`; confirm `make build` shows no drift.
  (Regenerated cleanly — 64-line additive diff, no unexpected changes.)
- [x] 5.3 Write a failing handler test for the new endpoint: missing
  `runRecordResult` permission → `403`; out-of-bounds `stepIndex` → `400`;
  valid request → `200` with the updated `StepResult` body. Wire the route
  in `apps/api/internal/server` (handler + router registration), reusing
  the existing `runRecordResult` permission check pattern from the
  verdict-recording handler. Confirm the test passes.
  (`internal/server/step_results_api_test.go`:
  `TestScenario_SetStepResultUpdatesLiveStepStates`,
  `TestScenario_SetStepResultRejectsOutOfBoundsIndexWith400`,
  `TestScenario_SetStepResultRequiresRunRecordResultPermission` — all pass.)
- [x] 5.4 Write a failing handler test confirming
  `POST .../run-items/{itemId}/results` accepts an optional `stepResults`
  body field end-to-end (handler → service → store) and that the response
  includes it. Confirm it passes (should already work once Task 4.3–4.4
  are wired to the existing handler).
  (`TestScenario_RecordResultAcceptsStepResultsField` passes unchanged —
  confirms the existing `recordResult` handler needed no code changes,
  only the schema/service/store layers. Full `go test ./internal/server/...`
  green; `go vet ./...` and `golangci-lint run` both clean.)

## 6. Frontend: ExecutionStepsList component

- [x] 6.1 Create `apps/web/src/components/ExecutionStepsList.tsx`: takes
  `steps: Step[]`, `stepStates: StepResult[]`, `onMark: (index: number, verdict: Verdict) => void`.
  Renders the same numbered-step layout `CaseStepsList`'s read-only mode
  uses, with a compact `P F B S` segmented-pill control per step (per the
  approved Pepe mock: `rounded-full bg-muted/70` track, letters matching
  the page's existing keyboard-shortcut vocabulary, color tokens reused
  verbatim from `CaseStepsList`'s step-number badge / `StatusBadge`'s
  destructive tint / the existing "stale"-badge secondary tint — no new
  colors or icons). Fetched Pepe's actual mock markup (WebFetch on the
  Artifact URL) to pull exact pixel/class decisions (`gap-0.5`/`p-0.5`
  track, `size-6` buttons, `text-[11px] font-extrabold font-mono`,
  `shadow-sm` on the active segment) rather than re-deriving from the
  text summary alone.
- [x] 6.2 Write `ExecutionStepsList.test.tsx`: clicking a letter button
  calls `onMark` with the right index/verdict; the currently-marked
  verdict renders with its active tint; an unmarked step shows all 4
  letters muted; component renders nothing step-related for an empty
  `steps` array (defer to the existing empty-state, matching
  `CaseStepsList`). (5/5 pass.)

## 7. Frontend: RunItemDetailPage integration

- [x] 7.1 In `apps/web/src/pages/RunItemDetailPage.tsx`, render
  `ExecutionStepsList` instead of `CaseContentView` when
  `item.content.format` implies discrete steps, wiring `onMark` to a new
  `markStep(index, verdict)` function that calls the Task 5.1 endpoint and
  updates local `stepStates` state on success (mirroring the existing
  `recordVerdict` function's API-call-then-local-update shape). Leave
  Gherkin/text-format rendering (`CaseContentView`) untouched.
  **Deviation**: `markStep` updates `item.stepStates` optimistically from
  the endpoint's own response (merge-and-sort by index) rather than a full
  items-list refetch like `recordVerdict` does — appropriate here since
  this fires once per click while working through a case, and the
  response already contains everything needed. Also added the established
  error-surfacing pattern (`response.ok` check + inline error message) per
  this codebase's standing convention — not explicitly called out in
  design.md, but the same discipline every other mutating call in this
  file already follows.
- [x] 7.2 Write `RunItemDetailPage.test.tsx` tests: marking a step calls
  the new endpoint and updates the shown mark; marking a step does not
  call `recordVerdict` or change the item's overall status; the overall
  verdict buttons and keyboard shortcuts behave exactly as before
  (regression coverage, not new behavior).
  (New `describe('step-level results (add-step-level-results)')` block;
  full file 70/70 pass, confirming no regression to the existing 65
  tests.)
- [x] 7.3 Add the per-result step-snapshot summary to the existing results
  history list: `<details>/<summary>` (matching
  `CaseSidebarSection`'s disclosure pattern) showing
  `"{marked}/{total} steps marked"` plus `" · N failed"` /
  `" · N failed"` (blocked) when count > 0, omitted entirely when a
  result's `stepResults` is empty. Expanded state lists each marked step's
  verdict (`StatusBadge`-style dot+label) and an em-dash for unmarked
  steps.
  **Deviation**: fixed a copy bug carried over from the proposal/design
  text (both failed and blocked counts were written as "N failed") —
  implemented as "N failed" and "N blocked" as distinct clauses, which is
  what the scenario text and Pepe's own rendered mock actually show.
  New `apps/web/src/components/StepSnapshotSummary.tsx`.
- [x] 7.4 Write `RunItemDetailPage.test.tsx` tests for the history summary:
  present with correct counts when a result has marked steps; absent
  entirely when a result has none; expanding shows per-step detail
  matching that result's snapshot, not the run item's current live state.
  (5 new tests, all pass; `StepSnapshotSummary.test.tsx` unit tests also
  pass 5/5. `tsc -b` clean.)

## 8. E2E

- [x] 8.1 Add a scenario to `apps/web/e2e/test-execution.spec.ts` (or a new
  `apps/web/e2e/step-level-results.spec.ts` if the existing file is
  already large) covering: mark a few steps, record an overall verdict,
  confirm the history entry's step summary; retest and re-mark only one
  step, confirm the other marks carried forward and the new history
  entry's snapshot differs from the first. Name the test after the
  `step-level-results` spec's requirement/scenario names.
  (New `apps/web/e2e/step-level-results.spec.ts` — `test-execution.spec.ts`
  is already 584 lines. Verified against a freshly rebuilt local
  docker-compose stack: `docker compose ... up --build -d --wait` then
  `npx playwright test e2e/step-level-results.spec.ts` — 1 passed.)

## 9. Docs

- [x] 9.1 Update `docs/test-management.md`'s execution section: document
  per-step marking, that it's independent of the overall verdict, that
  marks carry forward across retests, and that each recorded result keeps
  its own immutable step snapshot in the results history.
  (New "### Step-level results" subsection, inserted right after the run
  execution board's main bullet list, before "### Assigning items".)

## 10. Sample Project showcase

- [x] 10.1 Update `apps/api/internal/sampledata/seed.go` so at least one
  seeded run item has a mix of marked step verdicts (at least one `pass`,
  at least one `failed`) and its most recent result carries a matching
  step snapshot — visible in the showroom without any manual setup, per
  the `sample-data` capability's updated requirement.
  Expanded the "User can log in with valid credentials" case from 1 to 3
  realistic steps, then marked step 0 pass / step 1 failed on its
  "Release 1.1.1 hotfix verification" run item before re-recording that
  item's (pre-existing) timed result — reuses the same run-comparison
  showcase item rather than adding a new one, and the narrative lines up
  (the item already "genuinely regresses" in that comparison).
- [x] 10.2 Update `apps/api/internal/sampledata/seed_test.go` to assert
  the new scenario (mirroring the existing assertions for pass rate,
  JuUnit import, etc.).
  New `TestSeedContentDemonstratesStepLevelResults`; full
  `go test ./internal/sampledata/...` green (no regression from the step
  count change).

## 11. Final verification

- [x] 11.1 Run `make coverage-api` and `make coverage-web`, confirm both
  stay at or above their 80% gates.
  (Backend 81.6% — one run showed a transient store-package failure under
  full `make coverage-api`, but two subsequent full reruns of
  `go test -coverpkg=./internal/... ./internal/...` were clean; isolating
  `./internal/store/...` alone also passed clean — a resource-contention
  flake against the shared local test Postgres, not a real regression.
  Web: 91.02/83.71/89.02/93.59% (statements/branches/functions/lines).)
- [x] 11.2 Run `make lint` and `make build` clean.
  (`go vet ./...` and `golangci-lint run`: 0 issues. `tsc -b`: clean.
  `oxlint`: only pre-existing warnings, no new ones. `make build`: Go
  binary + `vite build` both succeed, no contract drift.)
- [x] 11.3 Deploy locally (`docker-compose`) and manually click through:
  mark steps on a run item, record a verdict, retest, confirm the history
  summary — per this project's standing "always deploy locally to
  validate" practice.
  Full `docker compose down -v && up --build -d --wait` (fresh DB, so the
  updated seed.go actually reseeds). Verified in a real logged-in browser
  session against the Sample Project: (1) the seeded "User can log in
  with valid credentials" item on the closed hotfix run shows step 1
  marked Pass, step 2 marked Fail (both correctly tinted), and its most
  recent history entry's "2/3 steps marked · 1 failed" summary expands to
  show Step 1: Pass, Step 2: Failed, Step 3: — (em-dash); (2) on the open
  "Nightly — main" run, clicking P then F on two steps updated their tint
  immediately, and reloading the page confirmed both marks persisted
  server-side (not just local UI state).
