## Why

As a user who's just selected a batch of related cases in the Library (via Shift+Click or a filter), when I want those cases to become a reusable suite, I want a direct path from "these are selected" to "these are a suite" — instead of creating an empty suite separately and re-picking the same cases one by one in its edit-mode picker (GH #142).

## What Changes

- Add a **Create suite from selection…** action to the Library's bulk-select footer bar (`LibraryBulkActionBar.tsx`), alongside the existing Move to…/Delete.
- The action is available whenever at least one **case** is selected (a folders-only selection hides it, since folders aren't suite members); a mixed selection acts on the case portion only, mirroring how Move to…/Delete already split a mixed selection by kind (`add-library-folder-selection`).
- Confirming opens a name-entry dialog (mirroring the Suites index's existing "+ New suite" dialog); on submit, creates the suite and adds every selected case to it as members, then clears the Library selection and navigates to the new suite's detail page.

## Capabilities

### New Capabilities

(none — this extends an existing capability's requirements, it doesn't introduce a new one)

### Modified Capabilities

- `library-bulk-select`: adds a new bulk action, "Create suite from selection…", to the footer bar's existing set of actions (Move to…/Delete/Clear), scoped to the selection's case portion.

## Impact

- **Frontend**: `LibraryBulkActionBar.tsx` (or its caller, `FolderExplorerPage.tsx`) gains a new bulk action and a name-entry dialog; a new `apps/web/src/lib/createSuiteFromCases.ts` helper (or similar) orchestrates suite creation + membership calls, following the `bulkMoveCases.ts`/`bulkDeleteCases.ts` client-orchestration pattern (no new bulk-membership endpoint).
- **Backend**: none — reuses the existing `POST /api/v1/projects/{projectKey}/suites` and `PUT /api/v1/suites/{suiteKey}/cases/{caseKey}` endpoints.
- **Docs**: `docs/test-management.md`'s Library bulk-selection section gets a new paragraph.
- **Sample Project**: evaluate whether `seed.go`'s existing case set gives a meaningful "create a suite from these" showcase moment.
