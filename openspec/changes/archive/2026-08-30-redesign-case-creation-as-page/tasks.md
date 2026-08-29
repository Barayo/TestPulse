## 1. Design mock (Pepe, before any UI code)

- [x] 1.1 Dispatch Pepe (Fable 5) for the `CreateCasePage` layout (reusing `CaseDetailPage`'s shell), the extracted `CaseFormatEditor` component's placement within it, and the sidebar's classification-field editing — get user sign-off before writing any frontend code

## 2. Shared `CaseFormatEditor` component

- [x] 2.1 Write failing `CaseFormatEditor.test.tsx` cases: renders the format picker + steps/text/gherkin body per the `format` prop; calling a format switch with non-empty content shows the confirm dialog; confirming calls `onFormatChange`/`onStepsChange`/`onDescriptionChange`/`onGherkinSourceChange` to clear the abandoned format and switch; canceling leaves everything unchanged
- [x] 2.2 Implement `CaseFormatEditor.tsx`, extracting the format-picker+body+confirm-dialog markup and `useCaseFormatSwitch` wiring currently duplicated in `CaseDrawer.tsx` and `CaseDetailPage.tsx` — watch tests go green
- [x] 2.3 Replace `CaseDetailPage.tsx`'s inline format-picker/body/confirm-dialog markup with `<CaseFormatEditor>`; re-run its existing test suite unmodified to confirm behavior is preserved exactly

## 3. `CreateCasePage`

- [x] 3.1 Write failing `CreateCasePage.test.tsx` cases: renders title input, `CaseFormatEditor`, and classification sidebar fields; submitting POSTs to `/api/v1/projects/{projectKey}/cases` with the assembled content and the `folderId` from the `?folderId=` query param (defaulting to the project's root folder when absent); on success, navigates to `/projects/{projectKey}/cases/{caseKey}`; a missing title blocks submission with a validation message
- [x] 3.2 Implement `CreateCasePage.tsx` reusing `CaseDetailPage`'s breadcrumb/header/`grid-cols-[1fr_320px]` shell, `CaseFormatEditor` for the content column, and inline `PropertyRow`-style editable fields (priority/tags/platform/testType/automated/custom fields) in the sidebar — watch tests go green
- [x] 3.3 Add the route `/projects/:projectKey/cases/new` to `ACCOUNT_ONLY_ROUTES` in `apps/web/src/App.tsx`; update its route-manifest test if one exists

## 4. Wire up and remove the old drawer

- [x] 4.1 Replace `FolderExplorerPage.tsx`'s "+ New test case" button (which opens `CaseDrawer`) with a `Link` to `/projects/{projectKey}/cases/new?folderId={selectedFolderId}`; remove the `DrawerState`/`createCase` plumbing it no longer needs
- [x] 4.2 Delete `CaseDrawer.tsx` and `CaseDrawer.test.tsx`
- [x] 4.3 Delete `StepEditor.tsx` and `StepEditor.test.tsx` (superseded by `CaseStepsList`'s editable variant; confirm no remaining callers first)
- [x] 4.4 `ClassificationEditor.tsx`'s component itself had zero remaining renders (`CasePicker.tsx`/`CaseDetailPage.tsx`/`CreateCasePage.tsx` only import its `PRIORITIES`/`Priority`/`CustomField` exports) — removed the dead component function, kept the file for its still-used constant/types; deleted the now-obsolete `ClassificationEditor.test.tsx`

## 5. E2E and docs

- [x] 5.1 Turned out much wider than one locator: "+ New test case" changed role from `button` to `link` everywhere (7 spec files), and 3 shared `createCase` helpers (`ui-navigation.spec.ts`, `delete-mode.spec.ts`, `test-execution.spec.ts`) assumed "stays on the Library after creating" — now false, since creation navigates to the new case's own page. Fixed by having each helper unwind both pushed history entries (`goBack()` × 2) before returning. Also fixed two individually-inlined multi-case-creation flows (`test-authoring.spec.ts` TD-44, `ui-navigation.spec.ts` TD-89) to navigate back to the Library explicitly between creations. Found and fixed a real bug along the way: `waitForURL(/\/cases\//)` matches both `/cases/new` and `/cases/{key}`, so it was resolving instantly against the stale create-page URL instead of waiting for the real post-creation navigation, racing goBack() against the async POST — fixed with `/\/cases\/(?!new)/`.
- [x] 5.2 Ran the full e2e suite; the directly-affected files (test-authoring, ui-navigation, delete-mode, test-execution) pass 104/104 together, and project-rbac/run-item-attachments/public-project-access pass standalone except one pre-existing, unrelated flake (`public-project-access.spec.ts` TD-31, a login-redirect test untouched by this change) confirmed unrelated by inspection — not fixed, out of scope.
- [x] 5.3 Update `docs/test-management.md`'s description of case creation ("Click **+ New test case** ... to open a side drawer") to describe the new page

## 6. Validation

- [x] 6.1 Rebuilt and redeployed the local `docker-compose` stack; clicked through the create-case page from the Library (correct `?folderId=` in the URL), the format picker, the confirm-before-switch dialog (both cancel and confirm paths), submitting a Gherkin case, landing on its own detail page with the scenario rendered correctly, and confirmed Edit mode on that page reuses the same `CaseFormatEditor` correctly — cleaned up the test case afterward
- [x] 6.2 Ran `make coverage-api` and `make coverage-web`; both stay ≥ 80% (unchanged from before this frontend-only change)
