## 1. Backend: CaseExecution.runKey

- [x] 1.1 Write a failing store test extending case-execution coverage:
      assert `exec.RunKey == run.Key`
- [x] 1.2 Add `RunKey` to `domain.CaseExecution`; select `tr.key` in
      `RunRepo.ExecutionsByCase`
- [x] 1.3 Add `runKey` to `CaseExecution` in `openapi.yaml`, regenerate
      shared types
- [x] 1.4 Test passes; full Go suite + coverage gate clean

## 2. CaseStepsList (shared, extracted)

- [x] 2.1 Failing tests written first (7 tests)
- [x] 2.2 Extracted `CaseStepsList`; read-only props only
- [x] 2.3 `CaseDetailPage.tsx` uses it; full existing test suite (25
      tests) stayed green **unmodified**
- [x] 2.4 `RunItemDetailPage.tsx` uses it, gaining the empty-state case it
      never had

## 3. RunItemDetailPage polish

- [x] 3.1 Failing tests written first
- [x] 3.2 Status property row via `StatusBadge`; History entries show a
      verdict dot + `timeAgo` relative timestamp instead of bare text;
      History list given `aria-label="Result history"` (also needed to
      disambiguate e2e assertions once the same status label started
      appearing in three places on the page)

## 4. Right-click menu on RunPage

- [x] 4.1 Failing tests written first
- [x] 4.2 `RunItemRow` extracted (hooks can't live in `.map()`), wired
      with `RowActionMenu` mirroring `FolderExplorerPage`'s pattern
- [x] 4.3 Tests pass — note: unit-tested via the button trigger, not
      `fireEvent.contextMenu`, matching every existing menu test in this
      codebase (the cursor-positioned portal path isn't reliably
      testable in jsdom); the actual right-click entry point is verified
      by e2e instead. Also fixed a real race the tests surfaced:
      `project` (needed for the menu) loads via a separate async effect
      from `items`, so a row could render before the menu's data was
      ready — fixed test synchronization with `findByRole`, not a
      product bug.

## 5. VersionDetailDialog links

- [x] 5.1 Failing tests written first (including updating the test file
      to render inside a `MemoryRouter`, needed once `Link` was added)
- [x] 5.2 Implemented using the new `runKey` field
- [x] 5.3 All 6 tests pass; `CaseDetailPage.test.tsx` (which mounts this
      dialog) still passes unmodified

## 6. E2E coverage

- [x] 6.1 Added "Right-click a run item, jump straight to its case in the
      Library" to `test-execution.spec.ts`
- [x] 6.2 Extended the existing flaky-version scenario in
      `ui-navigation.spec.ts` with a click-through on an execution link
      landing on the run item page (reused its existing two-run fixture
      rather than duplicating one)
- [x] 6.3 Full suite run against the real compose stack: 65/65 passed.
      Also fixed 5 now-stale assertions the redesign broke (old
      concatenated `"actor: verdict"` history text no longer matches
      once verdict moved into its own `StatusBadge`) — none were part of
      this change's new behavior, pre-existing scenarios that this
      change's UI edits happened to invalidate.

## 7. Docs and sample project

- [x] 7.1 `docs/test-management.md` — added the right-click shortcut to
      the run execution board section, and noted executions now link to
      their run item page in the version detail dialog section
- [x] 7.2 Sample Project showcase: not applicable — navigation/visual
      polish, no new capability to demonstrate

## 8. Sync and validate

- [x] 8.1 Run `openspec-sync-specs` for `link-run-item-and-case-detail`
- [x] 8.2 `openspec validate link-run-item-and-case-detail --strict`
