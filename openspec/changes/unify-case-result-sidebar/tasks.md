## 1. Shared results-data helper

- [x] 1.1 Write a failing test for `toResultsData` in a new
  `apps/web/src/lib/caseResultsData.test.ts` (moved/adapted from whatever
  currently covers it via `CaseDetailPage.test.tsx`), covering the empty
  case and the reverse-to-oldest-first ordering.
- [x] 1.2 Create `apps/web/src/lib/caseResultsData.ts` exporting
  `toResultsData` and `RECENT_EXECUTIONS_LIMIT = 7`; make the test pass.
- [x] 1.3 Update `CaseDetailPage.tsx` to import from the new module and
  delete its private copy; confirm `CaseDetailPage.test.tsx` still passes
  unmodified (pure refactor, no behavior change).

## 2. Run item page: link to its test case

- [x] 2.1 Write a failing test in `RunItemDetailPage.test.tsx` asserting a
  "Test case" property row renders a link to
  `/projects/{projectKey}/cases/{caseKey}` labeled with the case key.
- [x] 2.2 Add the property row to `RunItemDetailPage.tsx`'s Properties
  section, using `item.caseKey` and the project key already in scope
  (matches the `ExternalLinkIcon` idiom `RunPage.tsx`'s "Go to case in
  Library" menu item already uses); make the test pass.

## 3. Run item page: promote classification data

- [x] 3.1 Write a failing test asserting the Properties section renders
  `ClassificationPills`/`AutomationPill` (priority, test type, automated)
  and tag chips sourced from `item.content`, matching how
  `CaseDetailPage.tsx` renders them from `testCase.content`.
- [x] 3.2 Import `ClassificationPills`/`AutomationPill` from
  `components/Pills.tsx` into `RunItemDetailPage.tsx` and wire them to
  `item.content`; replace the plain `.join(', ')` tags row with the same
  chip rendering `CaseDetailPage.tsx` uses; make the test pass.
- [x] 3.3 Remove the standalone "Status" `PropertyRow` (redundant with the
  header `StatusBadge`); update/remove any test asserting its presence.

## 4. Run item page: cross-run Results section

- [x] 4.1 Write a failing test asserting a new "Results" `CaseSidebarSection`
  renders `CaseResultsPanel` populated from a mocked
  `/api/v1/{cases,public/cases}/{caseKey}/executions?order=recent&limit=7`
  response keyed off `item.caseKey`, for both the member and public/
  anonymous access branches.
- [x] 4.2 Add the executions fetch to `RunItemDetailPage.tsx`'s load
  sequence (`RunItemDetailPage.tsx:99-155`), gated on the existing
  `resolvedAccess` branch, and render the "Results" section using
  `toResultsData` from `lib/caseResultsData.ts`; make the test pass.

## 5. Run item page: rename History to "This run" and reorder

- [x] 5.1 Write a failing test asserting the per-item verdict log section
  is titled "This run" (not "History") and that the sidebar section order
  is Properties → Results → This run.
- [x] 5.2 Rename the `CaseSidebarSection title="History"` to `title="This
  run"` and reorder the JSX so Results sits between Properties and This
  run; make the test pass. Confirm the `aria-label="Result history"` list
  and its existing behavior (attach screenshot, lightbox, etc.) are
  untouched.

## 6. Case detail page: confirm section order unaffected

- [x] 6.1 Add/confirm a test asserting `CaseDetailPage.tsx`'s sidebar order
  is Properties → Results → Version history (already true — this task is
  a regression guard, not a behavior change).

## 7. E2E coverage

- [x] 7.1 Add an e2e scenario under "Requirement: Run item detail page" in
  `apps/web/e2e/ui-navigation.spec.ts` (or `test-execution` coverage, per
  existing file convention) exercising: opening a run item's page, clicking
  the "Test case" link, landing on the case detail page.
- [x] 7.2 Add an e2e scenario asserting the Results section on a run item's
  page shows the case's cross-run bars when the case has prior executions
  in another run (use/extend Sample Project data — see task 9).

## 8. Docs

- [x] 8.1 Update `docs/test-management.md`'s run-item-page description to
  mention the test case link, the promoted classification properties, and
  the Properties → Results → This run sidebar shape.

## 9. Sample Project showcase

- [x] 9.1 Verify the Sample Project's flagship case (already given
  multi-verdict cross-run history by `add-case-result-history`) has at
  least one run item whose page will visibly demonstrate both the case
  link and a non-trivial Results section; adjust `seed.go` and
  `seed_test.go` only if the current seed doesn't already satisfy this.
  Confirmed satisfied as-is: the "login" case (`seed.go:189-197`) already
  carries full classification (Priority High, Tags smoke/auth, Platform
  web, TestType functional, Automated) and appears across many runs
  (Smoke suite, regression runs, nightly, the Scratch run) with varied
  verdicts — any of its run items will show the case link, populated
  pills/chips, and a rich cross-run Results panel. No seed change needed.

## 10. Verification

- [x] 10.1 `make coverage-web` stays ≥ 80% all metrics. (92.3%/84.6%/89.9%/94.7%
  statements/branches/functions/lines — well clear of the gate.)
- [x] 10.2 Manually verify in a locally deployed build (docker compose):
  open a run item's page, confirm the case link, promoted properties,
  Results section, and "This run" rename all render correctly; click
  through to the case detail page and confirm its own sidebar order is
  unchanged. Verified live on the Sample Project's SP-1 run item
  (`/runs/SP-R12/items/SP-1`): Test case link, Priority/Test type/
  Automation/Platform/Tags all populated, Results shows 71% success ·
  last 7 runs with the bars/legend, This run shows "SKIPPED 32 minutes
  ago". Clicking the case link lands on `/projects/SP/cases/SP-1` with
  Properties → Results → Version History unchanged, identical Results
  data.
