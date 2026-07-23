## 1. Contract first

- [ ] 1.1 Add optional `detail` (object) to the `AuditEntry` schema in `packages/shared/openapi.yaml`
- [ ] 1.2 Add `POST /api/v1/cases/{caseId}/versions/{version}/restore` (no body, returns `TestCase`, `201`) to the contract
- [ ] 1.3 `make generate`, confirm no drift

## 2. Audit detail (TDD)

- [ ] 2.1 Write failing store/domain tests: an audit entry with detail persists and round-trips through `ListByEntity`
- [ ] 2.2 Add `detail jsonb` column (amend the audit migration in place, pre-1.0 policy); add `Detail map[string]any` to `domain.AuditEntry`; thread through the store's `audit`/insert path
- [ ] 2.3 Confirm green

## 3. Move-audit detail (TDD)

- [ ] 3.1 Write a failing test: moving a case's audit entry has `detail == {"from": <old folder>, "to": <new folder>}`
- [ ] 3.2 Update `Service.MoveCase` to fetch the case's current folder before moving and pass `{from, to}` as detail
- [ ] 3.3 Confirm green

## 4. Restore service + endpoint (TDD)

- [ ] 4.1 Write failing service tests: restoring an old version creates a new version with that version's content; the version number is always higher than any existing one; restoring a nonexistent version is rejected; the resulting audit entry has action `"restore"` and detail `{restoredFrom, newVersion}`
- [ ] 4.2 Implement `Service.RestoreVersion`, reusing `store.Cases.NewVersion`
- [ ] 4.3 Write failing handler tests: `201` with the updated case on success, `404`/`400` for a nonexistent case or version
- [ ] 4.4 Implement the handler; confirm green; `make coverage-api`

## 5. UI (TDD)

- [ ] 5.1 Write failing `CaseDrawer` tests: each version history entry shows a "Restore" action (except the current version); clicking it shows a confirmation with the explanatory copy; confirming calls the restore endpoint and the drawer reflects the new current version
- [ ] 5.2 Implement the restore action + confirmation in `CaseDrawer.tsx`
- [ ] 5.3 Confirm green; `make coverage-web`

## 6. Verification

- [ ] 6.1 `make lint`, `make test`, coverage gates all green
- [ ] 6.2 Manual check against the compose stack: edit a case a few times, restore an old version, confirm the new version appears, old versions stay intact, and the audit log shows both the move-detail and restore-detail entries correctly

## 7. Sample Project showcase (CLAUDE.md standing rule)

- [ ] 7.1 The Sample Project already seeds two multi-version cases (a case edited once to v2, a case edited twice to v3, in `apps/api/internal/sampledata/seed.go`) — good restore targets already exist, no new version-history content needed.
- [ ] 7.2 Add one case move in `sampledata.Seed` (move an existing case to a different section after creation) so the seeded audit log includes a real `{from, to}`-detail move entry, showcasing the structured-audit-detail half of this change alongside the version-restore half.
- [ ] 7.3 Add corresponding assertions to `seed_test.go`: the moved case's audit entry carries `detail == {from, to}`.

## 8. Docs and spec sync

- [ ] 8.1 Update `docs/test-management.md`'s versioning section to mention restore
- [ ] 8.2 Confirm `openspec validate add-version-restore` passes
