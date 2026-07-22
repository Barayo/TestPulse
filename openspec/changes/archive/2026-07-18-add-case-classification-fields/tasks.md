## 1. Contract first

- [x] 1.1 Add `platform` (string, optional), `testType` (string, optional), `automated` (boolean, default false) to the case create/update schemas in `packages/shared/openapi.yaml`
- [x] 1.2 `make generate`, confirm no drift

## 2. Domain + store (TDD)

- [x] 2.1 Write failing store/domain tests: all three fields persist through case create and update; `automated` defaults to false when omitted
- [x] 2.2 Add `Platform`, `TestType`, `Automated` to `domain.CaseContent`, thread through store create/update queries and the existing cases migration (amend in place, pre-1.0 policy)
- [x] 2.3 Confirm green

## 3. CaseDrawer UI (TDD) — scope added 2026-07-15, see design.md

- [x] 3.1 Write failing `CaseDrawer.test.tsx` tests: create mode shows priority select/tags/platform/testType/automated fields and includes them in `onCreate`'s payload; view mode displays them (priority + tags as badges, platform/testType as labels, automated as a badge); edit mode pre-fills all five from the current case and includes them in `onSaveEdit`'s payload
- [x] 3.2 Implement the fields in `CaseDrawer.tsx`: native `<select>` for priority (low/medium/high/critical), comma-separated text input for tags, plain text inputs for platform/testType, checkbox for automated
- [x] 3.3 Confirm green

## 4. FolderExplorerPage wiring (TDD)

- [x] 4.1 Write failing `FolderExplorerPage.test.tsx` tests: `createCase` sends the five fields to `POST /api/v1/projects/{projectId}/cases`; `saveCaseEdit` sends them to `PUT /api/v1/cases/{caseId}` merged onto the case's existing `description`/`expectedResult` (not dropping them)
- [x] 4.2 Implement the wiring
- [x] 4.3 Confirm green

## 5. Verification

- [x] 5.1 `make lint`, `make test`, `make coverage-api` all green (backend: coverage 82.8%)
- [x] 5.2 `make coverage-web` green (92.97% stmts / 84.39% branch / 91.82% funcs / 94.93% lines)
- [x] 5.3 Confirm `openspec validate add-case-classification-fields` passes (re-run after UI scope added)
- [x] 5.4 Rebuild the compose stack; get the user's live visual sign-off on the drawer before committing (standing rule — UI changes always need visual verification) — signed off 2026-07-18

## 6. Docs

- [x] 6.1 Update `docs/test-management.md`'s case-creation section to mention the three new fields
- [x] 6.2 Update `docs/test-management.md` to note all five classification fields are now editable from the case drawer (supersedes the "authoring UI doesn't surface them yet" note)
