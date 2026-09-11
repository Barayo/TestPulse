## 1. Migration and domain types

- [ ] 1.1 Add migration `apps/api/internal/db/migrations/00016_requirements.sql`: `requirements` table (`id`, `project_id` FK, `key`, `name`, `description`, `external_ref`, `created_at`) and `requirement_cases` junction table (`requirement_id`, `case_id`), PK on both columns, `ON DELETE CASCADE` on both FKs — mirroring `suite_cases`. Index `requirement_cases(case_id)` and `requirement_cases(requirement_id)`.
- [ ] 1.2 Add `domain.Requirement` (id, projectId, key, name, description, externalRef, createdAt) and `domain.RequirementCoverage` (requirementId, status) to `apps/api/internal/domain/domain.go`. Add a `CoverageStatus` type with `NotRun`/`Failing`/`Covered` constants.
- [ ] 1.3 Write and pass `TestRequirementValidation` in `domain_test.go` (name required, key format).

## 2. Store layer

- [ ] 2.1 Write failing store tests in `apps/api/internal/store/requirements_test.go`: create/get/list/update/delete a Requirement scoped to a project with sequential `REQ{n}` keys.
- [ ] 2.2 Implement `RequirementRepo` (or extend the existing project-scoped repo) in `apps/api/internal/store/requirements.go`: `CreateRequirement`, `Requirement`, `ListRequirements`, `UpdateRequirement`, `DeleteRequirement`. Run tests from 2.1 to green.
- [ ] 2.3 Write failing store tests: linking a case twice is idempotent; unlinking removes only the link; cascade-delete when a Case is deleted; cascade-delete when a Requirement is deleted; deleting a Requirement with linked cases is rejected at the store layer's delete-with-links check (or deferred to service — confirm placement matches how Test Plan's Run-orphan check is layered, then implement at that same layer).
- [ ] 2.4 Implement `LinkCase`, `UnlinkCase`, `RequirementCaseCount` (for the delete-rejection check) and `CasesForRequirement`/`RequirementsForCase` queries. Run tests from 2.3 to green.
- [ ] 2.5 Write failing store tests for the coverage query in `requirements_test.go`: all four rollup cases from the spec (zero-links → notRun, unrun-linked-case → notRun, any-failed/blocked → failing, all-pass → covered), plus the different-release-does-not-count scenario, plus skipped-folds-into-notRun.
- [ ] 2.6 Implement `CoverageForRelease(ctx, releaseID string) ([]domain.RequirementCoverage, error)`: one aggregate SQL query joining `requirements` → `requirement_cases` → `test_cases` → latest `Result` per case among Runs whose Test Plan belongs to the given Release. Run tests from 2.5 to green.

## 3. Service layer

- [ ] 3.1 Write failing service tests in `apps/api/internal/service/requirements_test.go`: `manageProject`-gated create/update/delete; non-`manageProject` actor gets `403`.
- [ ] 3.2 Implement `CreateRequirement`, `UpdateRequirement`, `DeleteRequirement` in `apps/api/internal/service/service.go` (or a new `requirements.go` service file), gated on `PermManageProject`. `DeleteRequirement` rejects if `RequirementCaseCount > 0`. Run tests from 3.1 to green.
- [ ] 3.3 Write failing service tests: `LinkCase`/`UnlinkCase` gated on `manageProject`; linking an already-linked pair succeeds without error.
- [ ] 3.4 Implement `LinkCase`, `UnlinkCase` in the service layer, validating both the Case and Requirement belong to the same project (mirroring `checkFolderBelongsToProject`'s cross-project guard pattern from the earlier `add-folder-slug-urls` follow-up fix). Run tests from 3.3 to green.
- [ ] 3.5 Write failing service test: `CoverageForRelease` returns per-requirement status for a project, exercised through the service layer end-to-end (not just the store).
- [ ] 3.6 Implement `CoverageForRelease` passthrough in the service layer, gated on `PermRead`. Run tests from 3.5 to green.

## 4. API layer

- [ ] 4.1 Add `Requirement` schema and paths to `packages/shared/openapi.yaml`: `POST/GET /api/v1/projects/{projectKey}/requirements`, `GET/PATCH/DELETE /api/v1/requirements/{requirementKey}`, `PUT/DELETE /api/v1/requirements/{requirementKey}/cases/{caseKey}`, `GET /api/v1/releases/{releaseKey}/requirements-coverage` (returns an array of `{requirementKey, status}` or similar, matching `Rollup`'s response-shape convention). Run `make generate` and commit the regenerated `packages/shared/src/api.ts` in the same task.
- [ ] 4.2 Write failing HTTP-level tests in `apps/api/internal/server/requirements_api_test.go`: create/list/get/update/delete a Requirement (200/400/403/404 cases); link/unlink a case (204/403/404); coverage endpoint (200, correct status per scenario).
- [ ] 4.3 Implement the corresponding handlers and route registrations in `apps/api/internal/server/handlers.go` (or a new `requirements.go` handler file) wired to the service methods from section 3. Run tests from 4.2 to green.

## 5. Frontend: Requirements list and detail pages

- [ ] 5.1 Write failing tests in `apps/web/src/pages/RequirementsPage.test.tsx`: list Requirements for a project, create/edit/delete controls visible only with `manageProject`, delete blocked (with an error) when the Requirement has linked cases.
- [ ] 5.2 Implement `RequirementsPage.tsx`, added to the project left nav alongside Suites/Runs/Library. Run tests from 5.1 to green.
- [ ] 5.3 Write failing tests in `apps/web/src/pages/RequirementDetailPage.test.tsx`: renders name/description/externalRef via `PropertyRow`; linked-cases panel using `CasePicker` to add/remove; permission-gated controls.
- [ ] 5.4 Implement `RequirementDetailPage.tsx`, reusing `CasePicker` for the linked-cases panel. Run tests from 5.3 to green.

## 6. Frontend: Case-side linking panel

- [ ] 6.1 Write failing test in `CaseDetailPage.test.tsx`: a new "Requirements" panel (same visual slot as the existing Tags panel) lists linked requirements and supports add/remove, permission-gated.
- [ ] 6.2 Implement the Requirements panel on `CaseDetailPage.tsx`, calling the same link/unlink endpoints as `RequirementDetailPage`. Run tests from 6.1 to green.

## 7. Frontend: Release coverage section

- [ ] 7.1 Write failing test in `ReleaseDetailPage.test.tsx`: a new "Requirements Coverage" Card section below the existing "Test Plans" card, rendering a table of Requirement name / status pill (`notRun`/`failing`/`covered` via `StatusPill`/`healthColor`) / linked-case count; empty state when the project has no Requirements yet.
- [ ] 7.2 Implement the Requirements Coverage Card section on `ReleaseDetailPage.tsx`, fetching from the coverage endpoint. Run tests from 7.1 to green.

## 8. End-to-end tests

- [ ] 8.1 Write `apps/web/e2e/requirements-traceability.spec.ts` (BDD scenario names matching the spec): create a Requirement, link two cases, run one to Pass and leave the other unrun under a Release → coverage shows `notRun`; run the second to Pass under the same Release → coverage flips to `covered`; a case passed under a *different* Release does not count toward this Release's coverage. Verify the E2E suite passes locally (`make e2e` or targeted `playwright test`).

## 9. Documentation

- [ ] 9.1 Add a "Requirements" section to `docs/test-management.md`: creating Requirements, linking from either side, and the Release-scoped worst-case coverage rollup rule (including the skipped-folds-into-notRun behavior).

## 10. Sample Project showcase

- [ ] 10.1 Update `apps/api/internal/sampledata/seed.go`: seed 2-3 Requirements linked to existing sample cases, with at least one seeded Release showing a real mix of `covered`/`failing`/`notRun` statuses in its coverage section.
- [ ] 10.2 Update `apps/api/internal/sampledata/seed_test.go` with a `TestSeedContentDemonstratesRequirementsTraceability`-style assertion that the seeded coverage mix is non-trivial (not all one status).

## 11. Verification

- [ ] 11.1 Run `make coverage-api` and `make coverage-web`, confirm both meet the ≥80% gate with no regressions.
- [ ] 11.2 Run a full local docker-compose rebuild (`down -v` then `up --build -d --wait`) and click through Requirements creation, linking from both sides, and the Release coverage section in a real browser before considering this change done.
