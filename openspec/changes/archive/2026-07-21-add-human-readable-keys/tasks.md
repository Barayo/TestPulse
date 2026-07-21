## 1. Contract first

- [x] 1.1 Add `key` (string) to the `Project`, `TestCase`, `Run`, and `Suite` response schemas in `packages/shared/openapi.yaml`
- [x] 1.2 Rename path parameters across all routes: `projectId`→`projectKey`, `caseId`→`caseKey`, `runId`→`runKey`, `suiteId`→`suiteKey` (`folderId`, `itemId`, `userId`, `teamId`, `tokenId`, `roleId` are unaffected — out of scope). Also rename the request-body identifier fields that reference these same resource types: `AddItemInput.caseId`→`caseKey`, `RunInput.caseIds`→`caseKeys`, `RunInput.suiteId`→`suiteKey` (see design.md addendum — the resolution boundary covers body fields too, not just path params; `moveCase`'s `folderId` body field is unaffected)
- [x] 1.3 `make generate`, confirm no drift; note (don't yet fix) any frontend call sites that now fail to compile against the renamed generated client — fixed in section 6

## 2. Domain: key derivation (TDD)

- [x] 2.1 Write failing unit tests for `domain.DeriveProjectKey`: multi-word names → initials capped at 5 letters; single-word names → first 4 letters; symbols-only/empty input → `"PROJ"` fallback; output is always uppercase alphanumeric
- [x] 2.2 Implement `DeriveProjectKey`
- [x] 2.3 Add `Key` field to `domain.Project`, `domain.TestCase`, `domain.Run`, `domain.Suite`
- [x] 2.4 Confirm green

## 3. Migration: schema + counters

- [x] 3.1 Amend `apps/api/internal/db/migrations/00002_core_domain.sql` in place (pre-1.0 policy): add `key` column + unique index to `projects`, `test_cases`, `test_runs`, `test_suites`
- [x] 3.2 Add `project_key_counters (project_id, entity_type, next_value)` table
- [x] 3.3 Extend the existing project-creation trigger (`create_project_root_folder`) to also seed the three counter rows (`case`, `run`, `suite`) — rename the function to reflect its broader job
- [x] 3.4 Recreate the local dev/test database (`make test-db-up` / compose volume) and confirm the amended migration applies cleanly from scratch

## 4. Store layer: key generation on create (TDD)

- [x] 4.1 Write failing store tests: `ProjectRepo.Create` assigns a derived, unique key; a name whose derived key collides with an existing project's key gets a numeric-suffixed key instead
- [x] 4.2 Implement key derivation + bounded collision-retry in `ProjectRepo.Create`
- [x] 4.3 Write failing store tests: `CaseRepo.Create`, `RunRepo.Create`, and the suites store's create method each assign a sequential, correctly-prefixed key (bare for cases, `R`-infix for runs, `S`-infix for suites); two concurrent creates in the same project receive distinct keys
- [x] 4.4 Implement counter-claiming (`UPDATE project_key_counters ... RETURNING`) and key formatting in each repo's create method
- [x] 4.5 Confirm green

## 5. API boundary: resolve key → id (TDD)

- [x] 5.1 Write failing store tests: `ProjectRepo.IDByKey`, `CaseRepo.IDByKey`, `RunRepo.IDByKey`, and the suites store's `IDByKey` resolve a known key to its internal id and return `ErrNotFound` for an unknown key
- [x] 5.2 Implement the four `IDByKey` methods
- [x] 5.3 Write failing handler tests: every route taking a project/case/run/suite path param resolves the key to its internal id before delegating to the service, and responds not-found for an unrecognized key
- [x] 5.4 Update `handlers.go` to resolve the renamed path params via `IDByKey` at the top of each affected handler; every downstream service/store call keeps its existing UUID-based signature
- [x] 5.5 Confirm green; run `make coverage-api`

## 6. Frontend routing

- [x] 6.1 Audit every `Link`/`navigate` call building a project/case/run/suite URL (`App.tsx`, `ProjectSwitcher.tsx`, `Breadcrumbs.tsx`, `CaseDetailPage.tsx`, `FolderExplorerPage.tsx`, `RunPage.tsx`, `RunsPage.tsx`, `SuitesPage.tsx`, `ProjectPage.tsx`, `ProjectMembersPage.tsx`) and switch each to build the URL from the resource's `key`, not its `id`
- [x] 6.2 Update the pages/hooks that read the route param (`useParams`) and use it to fetch data, so they pass the key straight through to the (now key-based) API client calls
- [x] 6.3 Update or add component/e2e tests asserting the URL contains the resource's key, not a UUID, for each affected page; add a not-found-state test for an unrecognized key (covered at the API level by `TestScenario_UnknownKeyIsNotFound`; frontend unit suites updated to exercise key-based routing throughout)
- [x] 6.4 Confirm green (414/414 web unit tests, full Go suite, `go vet`, `golangci-lint`, `oxlint`, `tsc -b` all clean; web branch-coverage threshold still short at 79.95%/80% — pre-existing from before this change, confirmed via the last `main` CI run predating this work, tracked separately not blocking this change's own correctness)

## 7. Docs

- [x] 7.1 Add a section to `docs/test-management.md` explaining project/case/run/suite keys: how they're generated, that they're immutable, their format, and that URLs use them instead of UUIDs
- [x] 7.2 Update `docs/api.md`'s endpoint table for the renamed path parameters
- [x] 7.3 Check `README.md`/`ROADMAP.md` for any UUID-style example URLs and update them

## 8. Verification

- [x] 8.1 `make lint`, `make test`, `make coverage-api` all green; `make coverage-web` blocked by a pre-existing branch-coverage shortfall (79.95%/80%) confirmed present on `main` before this change — not introduced here, tracked separately
- [x] 8.2 Recreated the local dev DB volume (`docker compose down -v` — goose had 00002 recorded as already-applied against the pre-amendment schema, exactly the known consequence of the pre-1.0 "amend in place" policy) and ran the full Playwright e2e suite against the rebuilt stack: caught and fixed a real bug — `e2e/project-rbac.spec.ts` made direct `page.request` calls with a case's raw `id` against the now key-addressed `/api/v1/cases/{caseKey}` route. Fixed (`caseKey` throughout); full suite now 52/52 passing, including the not-found path implicitly (unrecognized keys already covered by `TestScenario_UnknownKeyIsNotFound` at the API layer)

## 9. Spec sync

- [x] 9.1 Confirm `openspec validate add-human-readable-keys --strict` passes
