## 1. Contract first

- [x] 1.1 Add optional `detail` (object) to the `AuditEntry` schema in `packages/shared/openapi.yaml`
- [x] 1.2 Add `POST /api/v1/cases/{caseKey}/versions/{version}/restore` (no body, returns `TestCase`, `201`) to the contract
- [x] 1.3 `make generate`, confirm no drift — stable across two consecutive runs

## 2. Audit detail (TDD)

- [x] 2.1 Write failing store/domain tests: an audit entry with detail persists and round-trips through `ListByEntity` — `TestAuditEntryDetailRoundTrips`, `TestAuditEntryWithoutDetailListsAsNil` in `identity_test.go`; confirmed RED via `go vet` (unknown field `Detail`)
- [x] 2.2 Add `detail jsonb` column to `audit_log` (amend `apps/api/internal/db/schema.sql` directly in place, pre-1.0 single-schema-file policy); add `Detail map[string]any` to `domain.AuditEntry`; thread through the store's `audit`/insert path — `AuditRepo.Append`/`ListByEntity` now include `detail`; nil `Detail` stored as SQL NULL, not JSON `"null"`
- [x] 2.3 Confirm green — wiped local test DB for the schema change (`docker rm -f testpulse-testdb && make test-db-up`), all 4 audit store tests pass

## 3. Move-audit detail (TDD)

- [x] 3.1 Write a failing test: moving a case's audit entry has `detail == {"from": <old folder>, "to": <new folder>}` — `TestMoveCaseAuditEntryRecordsFromAndTo`; confirmed RED (empty detail) before implementing
- [x] 3.2 Update `Service.MoveCase` to fetch the case's current folder before moving and pass `{from, to}` as detail — added a variadic `detail ...map[string]any` param to `s.audit` (avoids touching the other 55 call sites)
- [x] 3.3 Confirm green — full Go suite (`go build`, `go test -count=1 ./...`) all green

## 4. Restore service + endpoint (TDD)

- [x] 4.1 Write failing service tests: restoring an old version creates a new version with that version's content; the version number is always higher than any existing one; restoring a nonexistent version is rejected; the resulting audit entry has action `"restore"` and detail `{restoredFrom, newVersion}` — `TestRestoreVersionCreatesNewVersionWithOldContent`, `TestRestoreNonexistentVersionIsRejected`; confirmed RED via `go vet` (undefined method)
- [x] 4.2 Implement `Service.RestoreVersion`, reusing `store.Cases.NewVersion` — nonexistent version returns `store.ErrNotFound`
- [x] 4.3 Write failing handler tests: `201` with the updated case on success, `404`/`400` for a nonexistent case or version — `TestScenario_RestoreCaseVersionOverHTTP` in `api_test.go`; confirmed RED (fell through to the SPA catch-all, 200 HTML)
- [x] 4.4 Implement the handler; confirm green; `make coverage-api` — route `POST /cases/{caseKey}/versions/{version}/restore` gated by `PermCaseEdit` (same as edit/move); full Go suite + lint green, coverage 81.5% (≥80% gate)

## 5. UI (TDD)

- [x] 5.1 Write failing `CaseDetailPage.test.tsx` tests: each row in the "Version history" list shows a "Restore" action when `permissions?.caseEdit` is true (except the current version, and never for a non-member/public read-only view); clicking it shows a confirmation with the explanatory copy; confirming calls the restore endpoint — 4 new tests, confirmed RED (2 real failures + 2 trivially-true negatives, matching this file's own existing permission-gating test convention)
- [x] 5.2 Implement the restore action + confirmation dialog in `apps/web/src/pages/CaseDetailPage.tsx`'s version-history list (`VersionDetailDialog.tsx` stays read-only, unchanged)
- [x] 5.3 Confirm green; `make coverage-web` — full web suite 1028/1028, typecheck/lint clean, coverage 92%/84.19%/88.96%/94.36% (≥80% gate)

## 6. Verification

- [x] 6.1 `make lint`, `make test`, coverage gates all green — Go: build/vet/gofmt/golangci-lint/tests/coverage (81.5%) all clean; web: typecheck/lint/tests (1028/1028)/coverage (92%/84.19%/88.96%/94.36%) all clean
- [x] 6.2 Manual check against the compose stack (wiped + rebuilt for the schema change): via curl (browser login was blocked by a local extension unrelated to this change) — created a case, edited it to v2 then v3, restored v1 → new v4 with v1's content (`{"title":"v1 title",...}`), `GET .../versions` confirmed all 4 versions intact and distinct, moved the case to a new folder, `GET /api/v1/audit?entityType=case&entityId=...` confirmed both a `restore` entry with `detail: {"restoredFrom":1,"newVersion":4}` and a `move` entry with `detail: {"from":"<root>","to":"<target>"}` — the restore action's UI rendering and click/confirm interaction is additionally covered by `CaseDetailPage.test.tsx`'s React Testing Library tests (task 5.1)

## 7. Sample Project showcase (CLAUDE.md standing rule)

- [x] 7.1 The Sample Project already seeds two multi-version cases (a case edited once to v2, a case edited twice to v3, in `apps/api/internal/sampledata/seed.go`) — good restore targets already exist, no new version-history content needed.
- [x] 7.2 A case move already exists in `sampledata.Seed` — `svc.MoveCase(ctx, twoFactor.ID, twoFactorFolder.ID)` (originally added for `add-delete-mode`'s nested-subsection showcase). No new seed code needed: now that `Service.MoveCase` records `{from, to}` detail (task 3.2), this pre-existing call automatically produces a real detail-bearing move entry — a stronger showcase than an artificial extra move.
- [x] 7.3 Add corresponding assertions to `seed_test.go`: the moved case's audit entry carries `detail == {from, to}` — `TestSeedContentShowcasesMoveAuditDetail`, passes immediately (proves the existing seed move + task 3's `MoveCase` change combine correctly, not a new-code TDD cycle)

## 8. Docs and spec sync

- [x] 8.1 Update `docs/test-management.md`'s versioning section to mention restore — also updated `docs/api.md`'s Cases endpoint table (new restore endpoint) and its audit-log paragraph (mentions the optional `detail` field), per CLAUDE.md's standing docs rule even though not explicitly itemized here
- [x] 8.2 Confirm `openspec validate add-version-restore` passes — also synced the three delta specs (`audit-log`, `test-authoring`, `ui-navigation`) into `openspec/specs/`, merging intelligently since `test-authoring`/`ui-navigation`'s main specs had evolved past the delta's assumed baseline (kept the current, richer body text; added only the new restore-related sentences/scenarios)
