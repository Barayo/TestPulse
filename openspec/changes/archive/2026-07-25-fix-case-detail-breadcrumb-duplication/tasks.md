## 1. Fix

- [x] 1.1 Write a failing test in `CaseDetailPage.test.tsx`: the breadcrumb
      (rendered `nav[aria-label="Breadcrumb"]`, per `Breadcrumbs.tsx`)
      does not contain the case's title text, and its last visible crumb
      is the parent folder (or "Library" at root)
- [x] 1.2 Remove the `{ label: testCase.content.title }` trailing segment
      from `breadcrumbSegments` in `CaseDetailPage.tsx:126-134`
- [x] 1.3 Verify the new test passes; verify existing `CaseDetailPage.test.tsx`
      and `Breadcrumbs.test.tsx` suites still pass

## 2. E2E coverage

- [x] 2.1 Add a scenario to `apps/web/e2e/ui-navigation.spec.ts`'s
      "Breadcrumb trail" describe block: opening a case's detail page
      shows a breadcrumb ending at the parent folder, with the case title
      appearing only in the `<h1>`

## 3. Docs and sample project

- [x] 3.1 No doc changes expected — this isn't described in `docs/`
      anywhere; confirmed
- [x] 3.2 Sample Project showcase: not applicable — pure UI polish, no new
      capability to demonstrate

## 4. Sync and validate

- [x] 4.1 Run `openspec-sync-specs` for `fix-case-detail-breadcrumb-duplication`
- [x] 4.2 `openspec validate fix-case-detail-breadcrumb-duplication --strict`
