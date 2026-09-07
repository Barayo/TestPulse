## 1. Shared pagination primitives (TDD)

- [ ] 1.1 Write failing tests for a new `apps/api/internal/store/pagination.go` helper: `encodeCursor(createdAt time.Time, id string) string` / `decodeCursor(cursor string) (createdAt time.Time, id string, err error)` (opaque base64 JSON), plus `clampLimit(limit int) int` (0 or negative → 50 default, >200 → 200, else unchanged). Cover: round-trip encode/decode, decode of a malformed/garbage string errors, clamp boundary values (0, 1, 50, 200, 201, 999999, negative).
- [ ] 1.2 Implement `encodeCursor`/`decodeCursor`/`clampLimit` to make the tests pass.
- [ ] 1.3 Write a failing handler-layer test for a shared `parsePageParams(r *http.Request) (cursor string, limit int)` helper in `apps/api/internal/server/` that reads `cursor`/`limit` query params and applies `clampLimit`.
- [ ] 1.4 Implement `parsePageParams` to make the test pass.

## 2. Runs list pagination (TDD)

- [ ] 2.1 Write failing store-level tests for `RunRepo.ListPage(ctx, projectID, cursor string, limit int) (items []domain.Run, nextCursor string, err error)`: first page respects limit, `nextCursor` resumes correctly, last page returns `nextCursor == ""`, ordering is `created_at DESC, id DESC`, a project with fewer rows than `limit` returns all of them with `nextCursor == ""`. Existing `RunRepo.List` (unbounded) must remain unchanged and still pass its existing tests untouched.
- [ ] 2.2 Implement `RunRepo.ListPage` (same pass-rate-aggregation query shape as the existing `List`, plus a `WHERE (created_at, id) < (cursor values)` / `LIMIT` clause) to make the tests pass.
- [ ] 2.3 Write a failing service-level test for `Service.ListRunsPage(ctx, projectID, cursor string, limit int)` wrapping the new store method.
- [ ] 2.4 Implement `Service.ListRunsPage` to make the test pass.
- [ ] 2.5 Add `RunListPage` response schema (`{ items: Run[], nextCursor: string | null }`) and `cursor`/`limit` query params to `GET /projects/{projectKey}/runs` in `packages/shared/openapi.yaml`; run `make generate`.
- [ ] 2.6 Write a failing API-level test asserting `GET /projects/{projectKey}/runs` returns the new envelope shape and paginates correctly across two pages.
- [ ] 2.7 Wire `handlers.go`'s `listRuns` to `parsePageParams` + `Service.ListRunsPage` to make the test pass.

## 3. Run items pagination (TDD)

- [ ] 3.1 Write failing store-level tests for `RunRepo.ItemsPage(ctx, runID, assigneeID, cursor string, limit int) (items []domain.RunItem, nextCursor string, err error)`, mirroring task 2.1's coverage plus the existing `assigneeID` filter composing correctly with pagination. Existing `RunRepo.Items` (unbounded, used by run comparison) must remain unchanged.
- [ ] 3.2 Implement `RunRepo.ItemsPage` to make the tests pass.
- [ ] 3.3 Write a failing service-level test for `Service.RunItemsPage` wrapping the new store method.
- [ ] 3.4 Implement `Service.RunItemsPage` to make the test pass.
- [ ] 3.5 Add `RunItemListPage` response schema and `cursor`/`limit` query params to `GET /runs/{runKey}/items` in `packages/shared/openapi.yaml`; run `make generate`.
- [ ] 3.6 Write a failing API-level test for the new envelope shape and pagination on this endpoint.
- [ ] 3.7 Wire `handlers.go`'s `listRunItems` to the new service method to make the test pass.

## 4. Users list pagination (TDD)

- [ ] 4.1 Write failing store-level tests for `UserRepo.ListPage(ctx, cursor string, limit int)`, same coverage shape as task 2.1. Existing `UserRepo.List` (used by `HasAnyUser`/`BootstrapAdmin`) must remain unchanged.
- [ ] 4.2 Implement `UserRepo.ListPage` to make the tests pass.
- [ ] 4.3 Write a failing service-level test for `Service.ListUsersPage`.
- [ ] 4.4 Implement `Service.ListUsersPage` to make the test pass.
- [ ] 4.5 Add `UserListPage` response schema and `cursor`/`limit` query params to `GET /users` in `packages/shared/openapi.yaml`; run `make generate`.
- [ ] 4.6 Write a failing API-level test for the new envelope shape and pagination.
- [ ] 4.7 Wire the `listUsers` handler to the new service method to make the test pass.

## 5. Teams list pagination (TDD)

- [ ] 5.1 Write failing store-level tests for `TeamRepo.ListPage(ctx, cursor string, limit int)`. Existing `TeamRepo.List` must remain unchanged.
- [ ] 5.2 Implement `TeamRepo.ListPage` to make the tests pass.
- [ ] 5.3 Write a failing service-level test for `Service.ListTeamsPage`.
- [ ] 5.4 Implement `Service.ListTeamsPage` to make the test pass.
- [ ] 5.5 Add `TeamListPage` response schema and `cursor`/`limit` query params to `GET /teams` in `packages/shared/openapi.yaml`; run `make generate`.
- [ ] 5.6 Write a failing API-level test for the new envelope shape and pagination.
- [ ] 5.7 Wire the `listTeams` handler to the new service method to make the test pass.

## 6. Roles list pagination (TDD)

- [ ] 6.1 Write failing store-level tests for `RoleRepo.ListPage(ctx, cursor string, limit int)`. Existing `RoleRepo.List` (used by `ResetRolesToDefaults`) must remain unchanged.
- [ ] 6.2 Implement `RoleRepo.ListPage` to make the tests pass.
- [ ] 6.3 Write a failing service-level test for `Service.ListRolesPage`.
- [ ] 6.4 Implement `Service.ListRolesPage` to make the test pass.
- [ ] 6.5 Add `RoleListPage` response schema and `cursor`/`limit` query params to `GET /roles` in `packages/shared/openapi.yaml`; run `make generate`.
- [ ] 6.6 Write a failing API-level test for the new envelope shape and pagination.
- [ ] 6.7 Wire the `listRoles` handler to the new service method to make the test pass.

## 7. Cases list pagination (TDD)

- [ ] 7.1 Write failing store-level tests for `CaseRepo.ListPage(ctx, projectID, cursor string, limit int)`. Existing `CaseRepo.List` must remain unchanged.
- [ ] 7.2 Implement `CaseRepo.ListPage` to make the tests pass.
- [ ] 7.3 Write a failing service-level test for `Service.ListCasesPage`.
- [ ] 7.4 Implement `Service.ListCasesPage` to make the test pass.
- [ ] 7.5 Add `CaseListPage` response schema and `cursor`/`limit` query params to `GET /projects/{projectKey}/cases` in `packages/shared/openapi.yaml`; run `make generate`.
- [ ] 7.6 Write a failing API-level test for the new envelope shape and pagination.
- [ ] 7.7 Wire the `listCases` handler to the new service method to make the test pass.

## 8. Folders list pagination (TDD)

- [ ] 8.1 Write failing store-level tests for `FolderRepo.ListPage(ctx, projectID, cursor string, limit int)`. Existing `FolderRepo.List` must remain unchanged.
- [ ] 8.2 Implement `FolderRepo.ListPage` to make the tests pass.
- [ ] 8.3 Write a failing service-level test for `Service.ListFoldersPage`.
- [ ] 8.4 Implement `Service.ListFoldersPage` to make the test pass.
- [ ] 8.5 Add `FolderListPage` response schema and `cursor`/`limit` query params to `GET /projects/{projectKey}/folders` in `packages/shared/openapi.yaml`; run `make generate`.
- [ ] 8.6 Write a failing API-level test for the new envelope shape and pagination.
- [ ] 8.7 Wire the `listFolders` handler to the new service method to make the test pass.

## 9. Suites list pagination (TDD)

- [ ] 9.1 Write failing store-level tests for `SuiteRepo.ListPage(ctx, projectID, cursor string, limit int)`. Existing `SuiteRepo.List` must remain unchanged.
- [ ] 9.2 Implement `SuiteRepo.ListPage` to make the tests pass.
- [ ] 9.3 Write a failing service-level test for `Service.ListSuitesPage`.
- [ ] 9.4 Implement `Service.ListSuitesPage` to make the test pass.
- [ ] 9.5 Add `SuiteListPage` response schema and `cursor`/`limit` query params to `GET /projects/{projectKey}/suites` in `packages/shared/openapi.yaml`; run `make generate`.
- [ ] 9.6 Write a failing API-level test for the new envelope shape and pagination.
- [ ] 9.7 Wire the `listSuites` handler to the new service method to make the test pass.

## 10. MCP tool layer compatibility

- [ ] 10.1 Grep `apps/api/internal/mcp/` for any tool calling the eight now-repointed service methods (`ListRuns`, `ListUsers`, etc.) directly; update each to call the new `*Page` method with no cursor/default limit if found, or confirm none exist (MCP's `search`/`list_projects` use separate FTS/scoping logic per `add-mcp-server` design, tracked separately as #149) and record that finding here.

## 11. Frontend design (Pepe mock pass)

- [ ] 11.1 Per this project's standing UI rule, dispatch Pepe (Fable 5) for a "Load more" visual pattern covering all eight affected list surfaces (Runs list, run execution board, PeoplePage's Users/Teams sections, Roles admin page, Library's Cases/Folders/Suites views) — one consistent control/placement, not eight bespoke ones. Get user sign-off on the mock before any frontend code below is written.

## 12. Frontend implementation (TDD, after task 11 sign-off)

- [ ] 12.1 Regenerate the TS API client via `make generate` (picks up all eight new response schemas from tasks 2–9) and fix the resulting compile errors at each of the eight call sites — this is the mechanical "every caller must update together" step the design's breaking-change decision relies on.
- [ ] 12.2 Implement the Pepe-approved "Load more" control as a shared component (e.g. `apps/web/src/components/LoadMoreList.tsx`) with a unit test covering: renders items, calls the fetch-next-page callback on click, hides itself when `nextCursor` is null.
- [ ] 12.3 Wire the Runs list page to the shared component + `RunListPage` envelope; add/update its test.
- [ ] 12.4 Wire the run execution board's item list to the shared component + `RunItemListPage` envelope; add/update its test.
- [ ] 12.5 Wire `PeoplePage.tsx`'s Users section to the shared component + `UserListPage` envelope, removing the now-superseded `USER_BATCH_SIZE` client-side batching constant and its associated logic; add/update its test.
- [ ] 12.6 Wire `PeoplePage.tsx`'s Teams section to the shared component + `TeamListPage` envelope, removing the now-superseded `MEMBER_BATCH_SIZE` client-side batching constant and its associated logic; add/update its test.
- [ ] 12.7 Wire the Roles admin page to the shared component + `RoleListPage` envelope; add/update its test.
- [ ] 12.8 Wire the Library's Cases view to the shared component + `CaseListPage` envelope; add/update its test.
- [ ] 12.9 Wire the Library's Folders view to the shared component + `FolderListPage` envelope; add/update its test.
- [ ] 12.10 Wire the Library's Suites view to the shared component + `SuiteListPage` envelope; add/update its test.
- [ ] 12.11 Add or update E2E coverage (`apps/web/e2e/`) for at least one "Load more" flow end-to-end against the real API (the run history or run items list, since task 14 seeds enough data to cross a page boundary there).

## 13. Documentation

- [ ] 13.1 Add a pagination-convention section to `docs/` (envelope shape, cursor opacity/replay-only semantics, `limit` default/max/clamping behavior, ordering rule) — new page or a section on the existing API reference page, whichever `docs/README.md`'s index structure fits better.
- [ ] 13.2 Update each of the eight affected endpoints' existing docs references (if individually documented) to point at the new pagination section instead of describing a bare-array response.
- [ ] 13.3 Add the new/updated page to `docs/README.md`'s index if a new file was created.

## 14. Sample Project showcase

- [ ] 14.1 Grow one entity in `apps/api/internal/sampledata/seed.go` past the 50-item default page size (most natural: additional closed runs in the Sample Project's most active project, or additional cases in a well-populated section) so the new "Load more" control genuinely appears and functions against the seeded showroom, not just in tests.
- [ ] 14.2 Update `seed_test.go` to assert the new count.

## 15. Verification

- [ ] 15.1 Run `make coverage-api` and confirm `internal/...` stays ≥ 80%.
- [ ] 15.2 Run `make coverage-web` and confirm web coverage stays ≥ 80% on all metrics.
- [ ] 15.3 Run `make lint` and `make build`.
- [ ] 15.4 Rebuild and redeploy `docker-compose` from scratch with this change's code; click through each of the eight affected list pages in a real browser against the grown Sample Project (task 14), confirming "Load more" appears, fetches the next page, and disappears at the end — not just green automated tests.
