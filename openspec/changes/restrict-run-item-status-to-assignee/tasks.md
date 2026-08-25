## 1. Data model & migration

- [x] 1.1 Add migration `00005_assignee_restricted_recording.sql`: `projects.assignee_restricted_recording boolean DEFAULT false NOT NULL`
- [x] 1.2 Add `Project.AssigneeRestrictedRecording bool` to `domain.go`
- [x] 1.3 Add `ProjectRepo.SetAssigneeRestrictedRecording(ctx, id, bool)` to `store/projects.go`, mirroring `SetPublicAccess`
- [x] 1.4 Add `RunRepo.ItemAssignee(ctx, itemID) (*domain.Assignee, error)` to `store/runs.go` (design.md D2)

## 2. API contract

- [x] 2.1 Add `assigneeRestrictedRecording` to `Project` and `ProjectUpdate` schemas in `packages/shared/openapi.yaml`, mirroring `publicAccess`
- [x] 2.2 `make generate` and confirm no drift

## 3. Enforcement (TDD: write failing test first for each)

- [x] 3.1 Test + implement `ProjectUpdate.AssigneeRestrictedRecording *bool` handling in `UpdateProject` (service.go), gated on `manageProject` (already enforced by the existing `PATCH /projects/{projectKey}` route)
- [x] 3.2 Test + implement `s.checkAssigneeRestriction(ctx, actor, projectID, assignee *domain.Assignee) error` in service.go per design.md D4 (user match, team match via `TeamIDsForUser`, `manageProject`/Tenant-Admin bypass, nil-assignee passthrough)
- [x] 3.3 Test + wire the check into `RecordResult` (service.go:706) before `AppendResult`
- [x] 3.4 Test + wire the check into `UpdateItem` (service.go:752) before `SetItemStatus`
- [x] 3.5 Test: the "record on behalf of" `actor` display-name override does not bypass the check (real actor identity only)
- [x] 3.6 Test: setting off preserves current behavior (regression coverage)

## 4. Frontend

- [x] 4.1 Add the `assigneeRestrictedRecording` toggle Card to `ProjectSettingsPage.tsx`, mirroring the "Public access" card (test: renders current state, toggles via PATCH)
- [x] 4.2 Update `recordBulkVerdict.ts` to return `{ failedCount: number }` by inspecting each response's `.error` (test: counts failures without throwing)
- [x] 4.3 Update `RunPage.tsx`'s two `recordBulkVerdict` call sites to show a warning banner (via the existing `ConfirmBanner` toast-substitute, not a new toast library) when `failedCount > 0` (test: banner appears with correct count, both bulk and single-item paths)

## 5. Sample Project showcase

- [x] 5.1 Enable `assigneeRestrictedRecording` on a sample project in `seed.go` with one assigned and one unassigned item on the same run, demonstrating both branches
- [x] 5.2 Update `seed_test.go` to assert the setting is on and both items exist as designed

## 6. Docs

- [x] 6.1 Document the new project setting in `docs/test-management.md` (or wherever `Public access` is documented) alongside the existing settings list

## 7. Validation

- [x] 7.1 `make lint` / `make test` (Go + web), confirm coverage gates hold
- [x] 7.2 `act`-based local CI validation (both `api` and `web` jobs) — `api` job green under `act`; `web` job's contract-drift step only fails locally because `act` diffs against uncommitted git HEAD (expected to pass once committed), every other web check (generate, lint, typecheck, coverage, build) verified directly with zero drift
- [x] 7.3 Local docker-compose deploy + manual browser validation — toggle works from ProjectSettingsPage; logged in as julia (real seeded user) on "Sprint 12 execution": recording against sam's assigned item was rejected (item stayed Failed, banner "1 item not updated — not assigned to you"), recording against the unassigned item succeeded (Pending → Pass)
