## 1. Store layer: cheap archived check

- [x] 1.1 Write a failing test for `ProjectRepo.IsArchived` (`apps/api/internal/store/store_test.go` or a project-store-specific test file) — asserts `true` for an archived project, `false` for an active one, `ErrNotFound` for a missing project ID.
- [x] 1.2 Implement `ProjectRepo.IsArchived(ctx, id) (bool, error)` in `apps/api/internal/store/projects.go` per design.md Decision 2 (single-column `SELECT archived FROM projects WHERE id = $1`, mirroring `checkRunOpen`'s style).
- [x] 1.3 Run the test, confirm green.

## 2. Service layer: EnsureProjectWritable

- [x] 2.1 Write a failing test `TestEnsureProjectWritableRejectsArchivedProject` (new or existing `apps/api/internal/service/project_rbac_test.go`) — archive a project via the store fixture, call `svc.EnsureProjectWritable`, assert a `*service.ConflictError`. Add a paired passing-case test for a non-archived project.
- [x] 2.2 Implement `Service.EnsureProjectWritable(ctx, projectID) error` in `apps/api/internal/service/project_rbac.go`, reusing the existing `conflict(...)`/`ConflictError` convention `runClosedAsConflict` already established.
- [x] 2.3 Run the tests, confirm green.

## 3. Wire into Authorize (covers MCP + most HTTP routes)

- [x] 3.1 Write failing tests `TestAuthorizeRejectsWriteOnArchivedProject` and `TestAuthorizeAllowsReadOnArchivedProject` (mirroring `TestAuthorizeScopedTokenLimitedToItsProjectAndGrantedPerms`'s shape, likely in `apps/api/internal/service/project_rbac_test.go` or wherever `Authorize` is already tested).
- [x] 3.2 Add the `perm != domain.PermRead` guard block to `Service.Authorize` per design.md Decision 3.
- [x] 3.3 Run the tests, confirm green. Run the full existing `Authorize`/MCP test suite to confirm no regression on read-path or non-archived-project behavior. (Also updated `TestAuthorizeTenantAdminBypasses`, a pre-existing test, to use a real project instead of a fake id — the bypass now correctly still requires a real project to check archived status against, per Decision 7.)

## 4. HTTP middleware: requirePermissionEvenIfArchived

- [x] 4.1 Write a failing HTTP-layer test `TestScenario_ArchivedProjectRejectsMutationsWith409` (mirroring `TestScenario_ClosedRunRejectsMutationsWith409` exactly, in `apps/api/internal/server/project_rbac_api_test.go` or the nearest existing home) — archive a project, then assert `409` across a representative sample of routes: case create/update, suite create, run create, run item/result update, release create, requirement create, comment create, custom field update. (Created `archived_project_api_test.go`; no comments endpoint exists in this codebase's route table, so that one was dropped from the sample — cases, suites, runs, folders, releases, requirements, custom fields, run items/results, and project membership are covered instead.)
- [x] 4.2 Write a paired failing test `TestScenario_ArchivedProjectStillAllowsReadsAndUnarchive` — `GET` on the same content types still `200`s on the archived fixture, and `PATCH /projects/{key}` with `{"archived": false}` still `200`s.
- [x] 4.3 Split `requirePermission` into `requirePermissionOpt(perm, resolve, blockArchived bool)` plus the existing `requirePermission` (wraps with `blockArchived=true`) and new `requirePermissionEvenIfArchived` (wraps with `blockArchived=false`) in `apps/api/internal/server/middleware.go`, per design.md Decision 4. Inside `requirePermissionOpt`, call `EnsureProjectWritable` when `blockArchived && perm != domain.PermRead`, mapping its error through the existing `respond()` switch. (Refined beyond the design.md sketch: a Tenant Admin only pays the cost of resolving projectID when the archived check actually applies — reads and the 4 `requirePermissionEvenIfArchived` routes keep the exact original zero-resolve bypass, which turned out to be load-bearing — see 4.5.)
- [x] 4.4 Switch exactly 4 call sites in `apps/api/internal/server/handlers.go` to `requirePermissionEvenIfArchived`: `updateProject`, `deleteProject`, `getImportJob`, `folderDeletePreview`. Leave all other `requirePermission` call sites untouched.
- [x] 4.5 Run the new tests, confirm green. Run the full existing `handlers`/server test suite to confirm zero regressions on non-archived-project routes, and confirm favorite/unfavorite and tag assign/remove still succeed on an archived project (per design.md Decision 3's discriminator reasoning). (Two real regressions surfaced and fixed: `TestInvalidJSONBodyIs400` — updated, since resolving projectID ahead of body-decode for a Tenant Admin write is now correct and consistent with every other actor kind, not a bug; `TestScenario_AuditHistoryForTenantLevelEntityRequiresTenantAdmin` — fixed at the root by scoping the new early-resolve requirement to only the routes where the archived check actually runs, restoring the original zero-resolve bypass everywhere else.)

## 5. Project-membership methods

- [x] 5.1 Write a failing test `TestScenario_ArchivedProjectRejectsMembershipChanges` covering `SetProjectMember`, `RemoveProjectMember`, `SetProjectTeamRole`, `RemoveProjectTeamRole` on an archived project, asserting each returns the conflict error and membership is unchanged. (Also covered end-to-end at the HTTP layer in `archived_project_api_test.go`'s membership assertion, task 4.1.)
- [x] 5.2 Add the `EnsureProjectWritable` leading call to each of the four methods in `apps/api/internal/service/project_rbac.go`.
- [x] 5.3 Run the tests, confirm green. Confirm existing membership tests on non-archived projects remain green. (Fixed one more fake-project-id-dependent test, `TestSetProjectMemberValidatesRole`, same root cause and fix pattern as 3.3's `TestAuthorizeTenantAdminBypasses`.)

## 6. UpdateProject: unarchive-only guard

- [x] 6.1 Write failing tests: unarchiving alone (`{"archived": false}` only) succeeds on an archived project; unarchiving bundled with any other field (name, description, publicAccess, autoArchiveExempt, assigneeRestrictedRecording, landingView) is rejected with `409` and neither change applies; a non-unarchive update on an archived project (e.g. just a rename) is rejected with `409`. (Both service-level, `TestUpdateProjectOnlyBareUnarchiveIsPermittedWhileArchived`, and HTTP-level, `TestScenario_ArchivedProjectRejectsBundledUnarchiveUpdate` from task 4.1's file.)
- [x] 6.2 Implement the guard in `Service.UpdateProject` (`apps/api/internal/service/service.go`) per design.md Decision 6.
- [x] 6.3 Run the tests, confirm green. Confirm existing `UpdateProject` tests on non-archived projects remain green. Full regression sweep across service/server/store/mcp packages: all green.

## 7. API contract

- [x] 7.1 Add the `409` response to every affected path in `packages/shared/openapi.yaml` (contract-first — document the response, don't just rely on the implementation). (51 operations touched; 39 got a new `409` entry, 12 already had one from the pre-existing closed-run precedent.)
- [x] 7.2 Run `make generate`, confirm no drift, commit the regenerated `packages/shared/src/api.ts`.

## 8. Sample Project showcase

- [x] 8.1 Add a second, minimal seeded project to `apps/api/internal/sampledata/seed.go` per design.md Decision 8 — private (not public), a small number of cases, no runs, created already archived, distinct from the always-public Sample Project (which stays untouched and unarchived). (Named "Archived Example", one case, via new `seedArchivedShowcase` helper.)
- [x] 8.2 Update `apps/api/internal/sampledata/seed_test.go` to cover the new project's existence and archived state. (Also fixed `TestSeedCreatesExactlyOneSampleProject` — its "exactly one project total" premise is now false by design; updated to assert exactly one project flagged `IsSample`, which is the actual invariant that still holds.)
- [x] 8.3 Run the sample-data tests, confirm green. (Stable across two full `-count=1` runs.)

## 9. Documentation

- [x] 9.1 Update wherever project archiving is documented (`docs/test-management.md` or the nearest home) to describe the new read-only behavior: what's blocked, that unarchiving alone still works, and that there's no admin bypass.

## 10. Full verification

- [x] 10.1 Run the full Go test suite (`make test-api` or equivalent) — confirm 100% pass, no regressions. (Two more fake-project-id/exactly-one-project premise tests found and fixed along the way: `TestScenario_SetupSeedsSampleProject` needed the same "assert isSample count, not total count" fix as `TestSeedCreatesExactlyOneSampleProject`.)
- [x] 10.2 Run `make lint` (Go + web) — confirm clean. Exit 0, `go vet`/`golangci-lint` fully clean, only pre-existing unrelated web warnings.
- [x] 10.3 Run `make coverage-api` — confirm the ≥80% gate still passes given the new code paths are tested. 82.0% (minimum 80%).
- [x] 10.4 Deploy locally (`docker compose up --build`) and manually verify: archiving a project via the UI, confirming a write attempt (e.g. editing a case) surfaces a clear error, then unarchiving and confirming writes succeed again. (Verified directly against the live API on a fresh instance: the seeded "Archived Example" project rejects a case-create and a rename with 409 and a clear message, reads still 200, a bare `{"archived": false}` unarchive succeeds, and a case-create afterward succeeds with 201.)

## 11. Post-implementation architecture review (Jose)

- [x] 11.1 Jose (architect persona) reviewed the full diff post-implementation: enforcement boundary complete and matches design.md exactly, background workers correctly exempt (verified, not assumed), frontend/backend seam safe (favorite/tag actions correctly unaffected by the archived-write block), test coverage honest. One real bug found: `ProjectRepo.IsArchived` (`apps/api/internal/store/projects.go`) collapsed every query error into `ErrNotFound`, not just "no rows" — masking real infra failures (dropped connections, cancelled contexts, pool exhaustion) as silent 404s on `Authorize`, the shared chokepoint for nearly every write in the app, and skipping `respond()`'s error-logging path.
- [x] 11.2 Fixed with a red-green regression test (`TestProjectIsArchived` in `apps/api/internal/store/store_test.go`, new cancelled-context case) — `IsArchived` now mirrors `IDByKey`/`checkRunOpen`'s convention exactly: only `pgx.ErrNoRows` collapses to `ErrNotFound`, every other error propagates as itself. Also fixed the test's own "nonexistent id" case, which was using a non-UUID sentinel string incompatible with the `id` column's UUID type — switched to this codebase's standard nil-UUID sentinel (`00000000-0000-0000-0000-000000000000`), matching `Delete`/`Unarchive`'s existing nonexistent-id tests.
- [x] 11.3 Full regression sweep (store/service/server/mcp_test/sampledata) green after the fix. `make lint` clean.
