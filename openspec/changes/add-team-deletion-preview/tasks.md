## 1. Store: reference counts

- [x] 1.1 Write failing tests in `apps/api/internal/store/project_rbac_test.go` (or `teams_test.go` if that's where `TeamRepo` tests live): `TestTeamReferenceCounts` (member + project counts reflect real rows) and a zero-state case (fresh team, no members, no assignments)
- [x] 1.2 Implement `TeamRepo.TeamReferenceCounts(ctx, teamID) (memberCount, projectCount int, err error)` in `apps/api/internal/store/teams.go`, single `QueryRow` with subquery counts (member count from `team_members`, distinct project count from `project_team_roles`)
- [x] 1.3 Verify tests pass

## 2. Domain type

- [x] 2.1 Add `TeamDeletionPreview{MemberCount, ProjectCount int}` (JSON-tagged) to `apps/api/internal/domain/domain.go`

## 3. Service: Tenant-Admin-gated preview

- [x] 3.1 Write failing tests in `apps/api/internal/service/project_rbac_test.go`: `TestTeamDeletionPreview` (returns real counts for a Tenant Admin) and `TestNonTenantAdminCannotViewTeamDeletionPreview` (rejected with `forbidden` before touching the store)
- [x] 3.2 Implement `Service.TeamDeletionPreview(ctx, actor domain.Actor, teamID string) (domain.TeamDeletionPreview, error)` in `apps/api/internal/service/project_rbac.go` — checks `!actor.IsTenantAdmin → forbidden(...)` first (matching `RoleDeletionPreview`'s pattern), then calls `s.store.Teams.TeamReferenceCounts`
- [x] 3.3 Verify tests pass

## 4. HTTP: route + handler

- [x] 4.1 Write failing tests in `apps/api/internal/server/team_handlers_test.go` (or wherever team HTTP scenario tests live): `TestScenario_TeamDeletionPreviewOverHTTP` and `TestScenario_NonTenantAdminCannotViewTeamDeletionPreviewOverHTTP`
- [x] 4.2 Add `r.Get("/{teamID}/deletion-preview", h.teamDeletionPreview)` in `apps/api/internal/server/team_handlers.go` (within the existing Tenant-Admin-gated `/teams` group), handler reads actor from context and calls `svc.TeamDeletionPreview`
- [x] 4.3 Verify tests pass

## 5. API contract

- [x] 5.1 Add `GET /api/v1/teams/{teamId}/deletion-preview` and `TeamDeletionPreview` schema to `packages/shared/openapi.yaml`
- [x] 5.2 Run `make generate` (regenerates `packages/shared/src/api.ts`); confirm no drift

## 6. Web: delete-team affordance

- [x] 6.1 Write failing tests in `apps/web/src/pages/PeoplePage.test.tsx`: delete button appears per team row, opening the dialog fetches the preview and shows real counts, Delete stays disabled until the preview resolves (use a manually-controlled deferred promise, per this file's existing pattern for the role-deletion dialog test), confirming calls `DELETE /api/v1/teams/{teamId}` and removes the team from the list
- [x] 6.2 Add delete button + confirmation `Dialog` to the Teams section of `apps/web/src/pages/PeoplePage.tsx`, reusing the existing `openDeleteDialog`/`deletePreview` pattern already built for roles — description: `Currently has {N} member{s}, across {M} project{s}. Deleting it removes those assignments too, not just the team itself. This cannot be undone.`
- [x] 6.3 Verify tests pass

## 7. E2E

- [x] 7.1 Add an E2E spec (or extend an existing People-page one) under `apps/web/e2e/` covering the `teams` capability's new "Tenant Admin views a team's deletion preview" scenario end-to-end: create a team, add a member, assign it a project role, open the delete dialog, assert the real counts render, confirm, assert the team is gone and the project role assignment no longer grants access

## 8. Docs

- [x] 8.1 Document the new endpoint in `docs/api.md`

## 9. Sample Project showcase

- [x] 9.1 In `apps/api/internal/sampledata/seed.go`, ensure at least one seeded team has no critical role assignments (safe to delete live during evaluation) — add one if the current seed data doesn't already have a disposable team
- [x] 9.2 Update `apps/api/internal/sampledata/seed_test.go` to cover the new/adjusted seed data

## 10. Spec sync

- [ ] 10.1 Sync `specs/teams/spec.md` and `specs/authorization/spec.md` deltas into `openspec/specs/` at archive time
