## 1. Migration and domain model

- [x] 1.1 Add migration `apps/api/internal/db/migrations/00023_run_auto_archive.sql`: `ALTER TABLE test_runs ADD COLUMN archived boolean DEFAULT false NOT NULL;` and `ALTER TABLE instance_settings ADD COLUMN run_auto_archive_inactive_days integer DEFAULT 0 NOT NULL;`.
- [x] 1.2 Add `Archived bool` to `domain.Run` (`apps/api/internal/domain/domain.go`), and `RunAutoArchiveInactiveDays int` to `domain.InstanceSettings` plus `*int` to `InstanceSettingsUpdate`.
- [x] 1.3 Run `go build ./...`, confirm it still compiles (struct fields added, nothing consumes them yet).

## 2. Store layer

- [x] 2.1 Write a failing test `TestArchiveRunSetsArchivedFlag` in `apps/api/internal/store/store_test.go` (or a new `run_archive_test.go`) asserting `RunRepo.Archive(ctx, runID)` sets `archived = true`, readable via `Get`.
- [x] 2.2 Write a failing test `TestUnarchiveRunClearsArchivedFlag` asserting the inverse.
- [x] 2.3 Run the tests, confirm they fail (methods don't exist).
- [x] 2.4 Implement `RunRepo.Archive`/`Unarchive` in `apps/api/internal/store/runs.go`, mirroring `Close`/`Reopen`'s existing shape exactly. Add `archived` to the `SELECT`/`Scan` columns in `Get`, `List`, `ListPage`, and `ListByTestPlan` so every existing read path surfaces the new field.
- [x] 2.5 Run the tests, confirm they pass; run the full `store` package suite, confirm no regressions from the widened `SELECT`s.
- [x] 2.6 Write a failing test `TestListEligibleForAutoArchiveOnlyReturnsOldClosedNonArchivedRuns` covering: a closed run past the threshold (included), an open run past the threshold (excluded), a closed run within the threshold (excluded), an already-archived closed run past the threshold (excluded).
- [x] 2.7 Run the test, confirm it fails (method doesn't exist).
- [x] 2.8 Implement `RunRepo.ListEligibleForAutoArchive(ctx, days)`, mirroring `ListEligibleForRetention`'s shape (design.md D5).
- [x] 2.9 Run the test, confirm it passes.

## 3. Service layer: manual archive/unarchive

- [x] 3.1 Write a failing test `TestArchiveRunAudited` in `apps/api/internal/service/*_test.go` asserting `Service.ArchiveRun` sets the flag (via `GetRun`) and records an audit entry with action `"archive"`, entity type `"run"`.
- [x] 3.2 Write a failing test `TestUnarchiveRunAudited`, same shape for `"unarchive"`.
- [x] 3.3 Run the tests, confirm they fail.
- [x] 3.4 Implement `Service.ArchiveRun`/`UnarchiveRun` in `service.go`, mirroring `CloseRun`/`ReopenRun`'s shape (call the store method, then `s.audit(...)`) — no webhook dispatch (archiving isn't one of `add-run-notifications`' events; not in scope here).
- [x] 3.5 Run the tests, confirm they pass.

## 4. API routes

- [x] 4.1 Add `POST /api/v1/runs/{runKey}/archive` and `POST /api/v1/runs/{runKey}/unarchive` to `packages/shared/openapi.yaml`, mirroring `/close`/`/reopen`'s existing shape (operationIds `archiveRun`/`unarchiveRun`).
- [x] 4.2 Run `make generate`, confirm `git diff packages/shared/src` is empty or only reflects the expected new operations.
- [x] 4.3 Write a failing test `TestScenario_ArchiveRunRequiresManageProject` in `apps/api/internal/server/run_lifecycle_api_test.go` — a Contributor gets 403, a Project Admin gets 204 and the run moves to archived.
- [x] 4.4 Write a failing test `TestScenario_UnarchiveRunRequiresManageProject`, same shape.
- [x] 4.5 Run the tests, confirm they fail (404, no such route).
- [x] 4.6 Implement `h.archiveRun`/`h.unarchiveRun` in `handlers.go` (mirroring `closeRun`/`reopenRun`'s two-line shape) and register both routes in the `/runs/{runKey}` group, gated by `domain.PermManageProject` (design.md D3).
- [x] 4.7 Run the tests, confirm they pass.

## 5. RunAutoArchiveWorker

- [x] 5.1 Write a failing test `TestRunAutoArchiveWorkerNoopWhenThresholdIsZero` in a new `apps/api/internal/service/run_auto_archive_worker_test.go`, mirroring `TestProjectAutoArchiveWorkerNoopWhenThresholdIsZero`'s shape.
- [x] 5.2 Write a failing test `TestRunAutoArchiveWorkerArchivesOnlyEligibleRuns` — a closed run past the threshold gets archived; an open run past the threshold and a closed run within the threshold are both untouched.
- [x] 5.3 Write a failing test `TestRunAutoArchiveWorkerAuditsAsSystemActor` — asserts actor kind `system`, actor ID `"run-auto-archive-worker"` (design.md D4).
- [x] 5.4 Write a failing test `TestRunAutoArchiveWorkerLogsSweepFailure`, mirroring `TestProjectAutoArchiveWorkerLogsSweepFailure`'s pre-cancelled-context forcing pattern (add-service-request-logging precedent — every worker logs its tick failures).
- [x] 5.5 Run the tests, confirm they fail (worker doesn't exist).
- [x] 5.6 Implement `apps/api/internal/service/run_auto_archive_worker.go`: `RunAutoArchiveWorker` struct, `NewRunAutoArchiveWorker`, `Sweep`, `Run` — mirroring `ProjectAutoArchiveWorker`'s file shape exactly (design.md D4), including its `sweepAndLog`-style failure logging.
- [x] 5.7 Run the tests, confirm they pass.
- [x] 5.8 Wire `go service.NewRunAutoArchiveWorker(svc).Run(ctx)` in `apps/api/cmd/testpulse-api/main.go`, alongside the other three workers, with a comment matching their existing numbering/style.

## 6. Pepe UI design pass (standing rule — before any frontend code)

- [x] 6.1 Dispatch Pepe (Fable 5 subagent) for the Runs list archived-section treatment (mirroring `ProjectsPage.tsx`'s existing collapsed "Archived · N" pattern) and the run-detail archive/unarchive controls (mirroring the close/reopen buttons). Present the mock for user validation before starting task group 7.

## 7. Frontend

- [x] 7.1 Write a failing test in `apps/web/src/pages/RunsPage.test.tsx` asserting archived runs are excluded from the default (active) list and appear only in a collapsed "Archived" section, per Pepe's approved mock.
- [x] 7.2 Run the test, confirm it fails.
- [x] 7.3 Implement the `RunsPage.tsx` archived section, mirroring `ProjectsPage.tsx`'s `archivedExpanded` state/markup shape (design.md D6).
- [x] 7.4 Run the test, confirm it passes.
- [x] 7.5 Write a failing test in `apps/web/src/pages/RunPage.test.tsx` asserting an Archive/Unarchive button calls the corresponding endpoint and updates the displayed state, mirroring the existing close/reopen button tests.
- [x] 7.6 Run the test, confirm it fails.
- [x] 7.7 Implement the archive/unarchive buttons on `RunPage.tsx`, beside close/reopen, per Pepe's approved mock.
- [x] 7.8 Run the test, confirm it passes.
- [x] 7.9 Write a failing test in `apps/web/src/pages/InstanceSettingsPage.test.tsx` asserting a new "Run auto-archive" days field renders and saves, mirroring the existing `autoArchiveInactiveDays`/`runRetentionDays` field tests.
- [x] 7.10 Run the test, confirm it fails.
- [x] 7.11 Implement the new field on `InstanceSettingsPage.tsx`, mirroring the existing two fields' shape exactly.
- [x] 7.12 Run the test, confirm it passes.

## 8. Sample Project showcase

- [x] 8.1 Update `apps/api/internal/sampledata/seed.go` to include at least one already-archived run in the Sample Project, demonstrating the new archived section on first load (CLAUDE.md's standing showcase rule).
- [x] 8.2 Update `apps/api/internal/sampledata/seed_test.go` to assert the seeded archived run exists and is flagged correctly.
- [x] 8.3 Run the `sampledata` package tests, confirm they pass.

## 9. Documentation

- [x] 9.1 Update `docs/test-management.md`: add a "Run auto-archive" note beside the existing "Run retention" (`#run-retention`) section, and update the Roles description's `manageProject` scope line to mention run archive/unarchive.
- [x] 9.2 Update `docs/deployment.md`'s background-worker list to include `RunAutoArchiveWorker` alongside the other three.

## 10. Full verification

- [x] 10.1 Run `go build ./... && go test ./...` in `apps/api`, confirm 100% pass, no regressions.
- [x] 10.2 Run `make coverage-api`, confirm the ≥80% gate still passes.
- [x] 10.3 Run `make lint-api`, confirm clean.
- [x] 10.4 Run `npm -w web run typecheck && npm -w web run test:coverage`, confirm clean and the ≥80% gate still passes.
- [x] 10.5 Deploy locally (`docker compose down -v` + `up --build -d`) and manually verify in a real browser: archive a run from its detail page, confirm it moves to the Runs list's Archived section; unarchive it, confirm it returns; set `runAutoArchiveInactiveDays` on the Instance Settings page and confirm the value persists.
