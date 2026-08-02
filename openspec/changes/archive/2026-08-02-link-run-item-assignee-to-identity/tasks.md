## 1. Migration and domain types

- [x] 1.1 Add migration `apps/api/internal/db/migrations/00005_link_assignee_to_identity.sql`: `ALTER TABLE test_run_items DROP COLUMN assignee, ADD COLUMN assignee_user_id uuid REFERENCES users (id) ON DELETE SET NULL, ADD COLUMN assignee_team_id uuid REFERENCES teams (id) ON DELETE SET NULL, ADD CONSTRAINT test_run_items_assignee_single CHECK (assignee_user_id IS NULL OR assignee_team_id IS NULL);` — a new file, not an edit to an existing one
- [x] 1.2 Replace `RunItem.Assignee string` with a resolved `*Assignee{Kind, ID, Name}` field in `apps/api/internal/domain/domain.go` (one nested response type populated by the store's join, rather than separate raw-id fields plus a duplicate API-layer type)

## 2. Store layer

- [x] 2.1 Write a failing store test (`apps/api/internal/store/store_test.go`): assigning an item to a user id sets `assignee_user_id` and clears `assignee_team_id`; `Items` returns that item with the user's resolved name
- [x] 2.2 Write a failing test: assigning to a team id sets `assignee_team_id` and clears `assignee_user_id`; `Items` resolves the team's name
- [x] 2.3 Write a failing test: deleting a *team* that's currently assigned to an item leaves that item's assignee null (`ON DELETE SET NULL`), verified by re-querying `Items` — used a team, not a user, since this system only ever soft-deactivates users (no hard-delete path exists to exercise the user-side FK)
- [x] 2.4 Implement `RunRepo.AssignItemToUser(ctx, itemID, userID string) error` and `AssignItemToTeam(ctx, itemID, teamID string) error` (replacing `AssignItem`), and update `Items`'s query to join `users`/`teams` and resolve assignee name, to pass 2.1–2.3

## 3. Service layer: membership validation

- [x] 3.1 Write a failing service test (`apps/api/internal/service/run_lifecycle_test.go`): assigning to a user who is not a member of the item's project is rejected, the item stays unassigned
- [x] 3.2 Write a failing test: assigning to a team not associated with the project is rejected
- [x] 3.3 Write a failing test: assigning to an actual project member (user or team) succeeds and is reflected in `RunItems`
- [x] 3.4 Implement the validation in `Service.UpdateItem`, using the existing `ProjectMembership` query to check the given id before writing, to pass 3.1–3.3

## 4. API contract

- [x] 4.1 Update `packages/shared/openapi.yaml`: `ItemStatusUpdate` drops `assignee: string`, gains `assigneeUserId`/`assigneeTeamId` (mutually exclusive, both optional alongside `status`); `RunItem.assignee` becomes a nullable object (`kind`, `id`, `name`) instead of a bare string
- [x] 4.2 Run `make generate`; confirm no drift
- [x] 4.3 Write a failing API test (`apps/api/internal/server/api_test.go`): `PUT /items/{itemId}/status` with `assigneeUserId` for a project member succeeds and the item's `assignee` object reflects it
- [x] 4.4 Write a failing test: the same request for a non-member user id is rejected
- [x] 4.5 Update `updateItem` in `apps/api/internal/server/handlers.go` for the new request/response shape, wired to task 3.4's service method, to pass 4.3–4.4

## 5. Frontend: AssignDialog becomes a real picker

- [x] 5.1 Write failing tests for the rewritten `AssignDialog` (`apps/web/src/components/AssignDialog.test.tsx`): lists project members (people and teams, separately labeled) fetched via `GET /projects/{projectKey}/members`, no free-text input, calls `onAssign({ kind, id })` on pick
- [x] 5.2 Implement the rewrite, reusing `UserPicker`'s search-dialog shape extended with a Teams section, to pass 5.1

## 6. Frontend: wire the new contract into call sites

- [x] 6.1 Write a failing test for `assignRunItems` (`apps/web/src/lib/assignRunItems.test.ts`): now takes `(itemIds, { kind, id })` and sends `assigneeUserId`/`assigneeTeamId` accordingly
- [x] 6.2 Update `assignRunItems` to pass 6.1
- [x] 6.3 Update `RunPage.tsx`'s per-item and bulk assign call sites and the assignee filter chips (now keyed by `assignee.name`/`assignee.id`) for the new `AssignDialog`/`assignRunItems` contract and the new nullable-object read shape
- [x] 6.4 Update `RunItemDetailPage.tsx`'s assign control and Properties display for the new contract and read shape
- [x] 6.5 Update `NewRunPage.tsx`'s default-assignee field to use the new picker instead of a free-text input, and the post-creation assign call for the new contract
- [x] 6.6 Re-run the full `RunPage.test.tsx`/`RunItemDetailPage.test.tsx`/`NewRunPage.test.tsx` suites, updating every test still asserting the old free-text `assignee` string shape

## 7. Sample Project

- [x] 7.1 Update `apps/api/internal/sampledata/seed.go`: create one or two additional real users (`CreateUser` + `SetProjectMember`, mirroring what `ProjectMembersPage` already exercises) and assign the existing seeded items ("Sprint 12 execution") to them for real instead of the decorative "Julia López"/"Miguel Alonso" strings
- [x] 7.2 Update `seed_test.go`'s `TestSeedContentHasAssignedAndUnassignedItems` to assert real linked users (`assigneeUserId` set), not free text

## 8. End-to-end coverage

- [x] 8.1 Update the existing assignment scenarios in `apps/web/e2e/test-execution.spec.ts` to pick a real project member from the dialog instead of typing a name
- [x] 8.2 Add an e2e scenario: someone not on the project is not offered as an option in the picker

## 9. Docs and spec sync

- [x] 9.1 Update `docs/test-management.md`'s assignment section: picking a real project member, not free text
- [x] 9.2 Sync the `test-execution` delta spec in this change into `openspec/specs/test-execution/spec.md`

## 10. Deploy

- [ ] 10.1 After merge, confirm the migration applies cleanly against the live `testpulse.fly.dev` database on the next auto-deploy (goose applies it automatically at startup); confirm the Sample Project's assignments show the new real users post-deploy
