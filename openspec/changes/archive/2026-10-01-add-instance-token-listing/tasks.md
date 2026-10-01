## 1. Visual design for the new admin page

- [x] 1.1 Dispatch Pepe (Fable 5) for the instance-wide token listing page: a table/list inside `AdminShell` (4th tab, "Agent Tokens") showing owner, name/prefix, scope (project · role, or "Full access"), and created date per token, with cursor-based "Load more" matching `PeoplePage.tsx`'s existing pattern. Get user sign-off before writing any component code (standing project practice for UI changes).

## 2. Contract: openapi.yaml + generated types

- [x] 2.1 Add `GET /api/v1/tokens/instance` and `ApiTokenWithOwner`/`ApiTokenWithOwnerListPage` schemas to `packages/shared/openapi.yaml`, Tenant-Admin-only, cursor-paginated (`cursor`/`limit` params, matching `/api/v1/users`'s existing shape exactly). `ApiTokenWithOwner` fields: `id`, `ownerEmail`, `ownerDisplayName` (nullable), `name`, `prefix`, `projectKey` (nullable), `roleName` (nullable), `revokedAt` (nullable), `createdAt`.
- [x] 2.2 Run `make generate` and confirm it exits clean.

## 3. Store layer (TDD)

- [x] 3.1 Write a failing test `TestApiTokenRepoListAllPageReturnsEveryUsersTokens` in `apps/api/internal/store/tokens_test.go` (new file): create tokens for two different users (one unscoped, one scoped to a project+role), call `ListAllPage(ctx, "", 0)`, assert both tokens come back with `OwnerEmail` populated, and the scoped one has `ProjectKey`/`RoleName` populated while the unscoped one has both nil.
- [x] 3.2 Write a failing test `TestApiTokenRepoListAllPagePaginatesWithCursor`, mirroring `TestUserRepoListPagePaginatesWithCursor`'s shape: create 3 tokens, page through with `limit=2`, assert page1 has 2 + a cursor, page2 has 1 + no cursor.
- [x] 3.3 Run `go test ./internal/store/... -run TestApiTokenRepoListAllPage` and confirm both fail (compile error: `ListAllPage` doesn't exist, `domain.ApiTokenWithOwner` doesn't exist).
- [x] 3.4 Add `domain.ApiTokenWithOwner` to `apps/api/internal/domain/domain.go` (fields per task 2.1, Go-cased). Add `ApiTokenRepo.ListAllPage(ctx context.Context, cursor string, limit int) ([]domain.ApiTokenWithOwner, string, error)` to `apps/api/internal/store/tokens.go`: `LEFT JOIN users u ON u.id = t.created_by`, `LEFT JOIN projects p ON p.id = t.project_id`, `LEFT JOIN roles r ON r.id = t.role_id`, ordered `t.created_at ASC, t.id ASC`, same keyset-cursor template as `UserRepo.ListPage` (design.md D2).
- [x] 3.5 Run `go test ./internal/store/... -run TestApiTokenRepoListAllPage` and confirm both pass.

## 4. Service layer (TDD)

- [x] 4.1 Write a failing test `TestListAllTokensPageRequiresTenantAdmin` in `apps/api/internal/service/identity_test.go` (or a new `tokens_test.go`): call `ListAllTokensPage` with a non-Tenant-Admin actor, assert a forbidden error and no DB call leaks through (use a `nil`-store `Service` where feasible, matching `TestSearchRequiresQuery`'s style).
- [x] 4.2 Write a failing test `TestListAllTokensPageReturnsAllUsersTokensForTenantAdmin`: create two users' tokens via the real service/store, call with a Tenant-Admin actor, assert both appear.
- [x] 4.3 Run `go test ./internal/service/... -run TestListAllTokensPage` and confirm both fail (method doesn't exist).
- [x] 4.4 Add `Service.ListAllTokensPage(ctx context.Context, actor domain.Actor, cursor string, limit int) ([]domain.ApiTokenWithOwner, string, error)` to `apps/api/internal/service/identity.go`: `if !actor.IsTenantAdmin { return nil, "", forbidden(...) }` then `s.store.ApiTokens.ListAllPage(ctx, cursor, limit)` (design.md D3).
- [x] 4.5 Run `go test ./internal/service/... -run TestListAllTokensPage` and confirm both pass.

## 5. HTTP handler (TDD)

- [x] 5.1 Write a failing test in `apps/api/internal/server/*_test.go`: `GET /api/v1/tokens/instance` as a Tenant Admin with tokens from two different users returns both, paginated; as a non-Tenant-Admin returns `403`; without authentication returns `401`.
- [x] 5.2 Run the new test, confirm it fails (404: route doesn't exist).
- [x] 5.3 Add `listAllTokens` handler to `apps/api/internal/server/identity_handlers.go` (mirrors `listUsers`'s `parsePageParams`/`newPagePayload` shape exactly) and register `r.With(requireTenantAdmin).Get("/instance", h.listAllTokens)` inside the existing `/tokens` route group in `mountIdentity`.
- [x] 5.4 Run the new test, confirm it passes.

## 6. Frontend: InstanceTokensPage (TDD)

- [x] 6.1 Write a failing test in a new `apps/web/src/pages/InstanceTokensPage.test.tsx` (mirroring `PeoplePage.test.tsx`'s mocking/rendering conventions): mocks `api.GET` returning a page of `ApiTokenWithOwner` items, renders the page, asserts owner/name/scope/date show for each row, and that a scoped vs. unscoped token render differently (project·role vs. "Full access").
- [x] 6.2 Run the test, confirm it fails (component doesn't exist).
- [x] 6.3 Implement `apps/web/src/pages/InstanceTokensPage.tsx` per Pepe's approved design (task 1.1): fetches `GET /api/v1/tokens/instance`, renders inside `AdminShell`, "Load more" via the existing cursor-pagination pattern (`PeoplePage.tsx`'s `LoadMoreButton` usage).
- [x] 6.4 Run the test, confirm it passes.
- [x] 6.5 Add the route (`/settings/agent-tokens`) to `apps/web/src/App.tsx` and the 4th tab ("Agent Tokens") to `AdminShell.tsx`'s `TABS` array; update that file's existing comment to explain the personal-vs-admin distinction (design.md D4) instead of leaving it stale.

## 7. Verification, docs, and Sample Project check

- [x] 7.1 Run `make lint-api` and `make lint-web`; fix any issues.
- [x] 7.2 Run `make coverage-api` and `make coverage-web`; confirm both ≥80% gates still pass.
- [x] 7.3 Update `docs/test-management.md`: the "API tokens (below) stay outside this shell" sentence needs a correction — add a short note that `/settings/agent-tokens` (Admin shell, 4th tab) is the Tenant-Admin instance-wide view, distinct from the personal page.
- [x] 7.4 Sample Project / seed check: confirm the seeded admin already has at least one API token (or create one in `apps/api/internal/sampledata/seed.go` if not) so the new page has something to show out of the box; verify rather than assume.
- [x] 7.5 Deploy locally (`docker-compose`), log in as the seeded admin, visit `/settings/agent-tokens`, and confirm real tokens render with correct owner/scope/date before calling this done.
