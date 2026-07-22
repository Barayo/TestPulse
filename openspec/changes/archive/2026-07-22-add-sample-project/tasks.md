## 1. Migration and domain

- [x] 1.1 Amend `00002_core_domain.sql`: add `is_sample boolean NOT NULL DEFAULT false` to `projects`; check/update the `-- +goose Down` section if it lists columns explicitly
- [x] 1.2 `domain.Project` gains `IsSample bool` (`json:"isSample"`)

## 2. Store layer (test-first)

- [x] 2.1 Write failing store tests: `Projects.Create` defaults `is_sample` to `false`; a new `Projects.MarkSample(ctx, id)` sets it `true`; `Get`/`List`/`ListForMember` all reflect the flag
- [x] 2.2 Add `is_sample` to the `Get`/`List`/`ListForMember`/`Create` select/scan lists; implement `MarkSample`. Confirm green

## 3. Service layer (test-first)

- [x] 3.1 Write failing service tests: `HasAnyProject` returns `false` on an empty instance and `true` once any project exists; `MarkSample` marks a project and is reflected by `GetProject`
- [x] 3.2 Implement `Service.HasAnyProject(ctx) (bool, error)` and `Service.MarkSample(ctx, projectID) error`. Confirm green

## 4. Contract

- [x] 4.1 `packages/shared/openapi.yaml`: `Project` schema gains `isSample` (required, boolean). `make generate`, confirm no drift

## 5. Extract `sampledata` package (test-first)

- [x] 5.1 Create `apps/api/internal/sampledata` with the generic builders extracted from `cmd/seed-demo/main.go` (`rootFolder`, `folder`, `caseWithSteps`, `filler`, `suite`, `runWithVerdicts`, `actors`), exported
- [x] 5.2 Refactor `cmd/seed-demo/main.go` to import these from `sampledata` instead of defining its own copies; `make build` and manually run `make seed-demo` against a scratch DB to confirm its two demo projects still seed correctly (unchanged content)

## 6. Sample Project content (test-first)

- [x] 6.1 Write a failing integration test for `sampledata.Seed(ctx, svc)` (real DB, real service layer, an admin user already bootstrapped in the test setup): exactly one project created, `IsSample` true, named "Sample Project"
- [x] 6.2 Extend the test: the project has multiple sections with cases carrying varied priority/tags/platform/testType/automated; at least two suites; at least one case with `currentVersion > 1`
- [x] 6.3 Extend the test: an open run with recorded (mixed) verdicts exists; a closed run exists (created then closed via `CloseRun`)
- [x] 6.4 Extend the test: a run created via `Import` exists, with a report containing at least one case key that doesn't match any seeded case (so the import result includes an unmatched entry)
- [x] 6.5 Implement `sampledata.Seed`: builds the content asserted above, using the bootstrap admin (looked up via the service) as the actor wrapped into context via `domain.WithActor` for calls that need one (e.g. `Import`). Confirm green

## 7. Startup wiring (test-first)

- [x] 7.1 Write a failing test (or extend an existing startup/integration test) asserting: on an empty database, `HasAnyProject` is false and after the seeding step runs, exactly one project (the Sample Project) exists; on a non-empty database, seeding is skipped
      (Implemented as: extracted `seedSampleProjectIfEmpty(ctx, logger, svc)` in `cmd/testpulse-api`, directly unit-testable via `testutil.Pool` without needing `config.Load`/`db.Connect`'s real env vars — `run()` itself stays untested, matching this codebase's existing precedent of not unit-testing `main.go`'s orchestration lines, e.g. `BootstrapAdmin`'s own call site.)
- [x] 7.2 Wire `cmd/testpulse-api/main.go`'s `run()`: after `BootstrapAdmin`, call `svc.HasAnyProject(ctx)`; if false, call `sampledata.Seed(ctx, svc)` and log a warning (not fatal) on error, matching `CleanupExpiredSessions`'s error handling. Confirm green

## 8. Web UI (test-first)

- [x] 8.1 Write failing component tests: the project list (expanded and compact view) shows a "Sample" badge next to a project's name when `project.isSample` is true, and no badge otherwise
- [x] 8.2 Implement the badge in the project list component(s). Confirm green
- [x] 8.3 If the project landing page also displays project identity/name prominently, add the same badge there with its own failing-then-passing test
      (Evaluated: the landing page only shows the project name in the breadcrumb, no dedicated heading/card — skipped, a badge doesn't fit a breadcrumb segment and isn't this codebase's pattern anywhere else.)

## 9. Docs

- [x] 9.1 `docs/database.md`: document the new `projects.is_sample` column
- [x] 9.2 `docs/api.md`: document the new `Project.isSample` field
- [x] 9.3 `docs/getting-started.md` and/or `docs/test-management.md`: mention that a fresh instance comes with a populated Sample Project, and that it's safe to delete/archive

## 10. Verification

- [x] 10.1 `make lint`, `make test`, `make coverage-api` (≥80%), `make coverage-web` (≥80% all metrics) all green
      (Caught and fixed a real bug here: `apps/web/src/lib/sortProjects.test.ts`'s strictly-typed `ProjectSummary` fixture was missing the new `isSample` field — `tsc --noEmit` didn't catch it, but the production build's `tsc -b` did.)
- [x] 10.2 Manual end-to-end check against the compose stack: `docker compose down -v` then fresh `up --build`, confirm the Sample Project appears automatically with the expected content (open run, closed run, imported run with an unmatched case, a multi-version case), confirm restarting the stack does not create a second one, confirm archiving it and restarting still does not recreate it
- [x] 10.3 `make e2e` still green (no dedicated new e2e test for the bootstrap trigger itself, per design.md — existing e2e specs must not break due to an extra project now existing on the shared compose stack)

## 11. Spec sync

- [x] 11.1 Confirm `openspec validate add-sample-project --strict` passes
