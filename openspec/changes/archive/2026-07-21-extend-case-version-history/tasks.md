## 1. Backend: executions-by-case query

- [x] 1.1 Add `CREATE INDEX test_run_items_case_version_idx ON test_run_items (case_id, case_version)`
      to `apps/api/internal/db/migrations/00002_core_domain.sql` (amend in place, not a new file).
- [x] 1.2 Write a failing store test (`apps/api/internal/store/store_test.go`,
      `TestExecutionsByCaseGroupedByVersion`, gated on `TESTPULSE_TEST_DATABASE_URL`): a case in
      three run items across two runs, two pinning version 1 (one pass, one failed) and one
      pinning version 2 (pass) — assert `s.Runs.ExecutionsByCase(ctx, caseID)` returns all three
      with correct `CaseVersion`/`RunID`/`CurrentStatus`, and a case with no run items returns an
      empty (not nil-error) slice.
- [x] 1.3 Add `domain.CaseExecution` (`RunItemID, RunID, RunName string, CaseVersion int, Status
      domain.Status, CreatedAt time.Time`) and `RunRepo.ExecutionsByCase` (join
      `test_run_items`/`test_runs`, `WHERE case_id = $1`) to make the test pass.
- [x] 1.4 Implement `Service.CaseExecutions` as a thin forward to
      `s.store.Runs.ExecutionsByCase`. No dedicated service-level test added — matches this
      codebase's existing convention for pure one-line forwards (`Service.CaseVersions` has none
      either); the real behavior is covered by the store test (1.2) and the handler test below.
- [x] 1.5 Added `GET /api/v1/cases/{caseId}/executions` to `packages/shared/openapi.yaml`
      (`listCaseExecutions` op, `CaseExecution` schema), ran `make generate`, added the route
      (`PermRead`, `projectIDFromCase`) and `listCaseExecutions` handler. Failing handler test
      (`TestScenario_CaseExecutionsGroupedByVersionOverHTTP`,
      `apps/api/internal/server/api_more_test.go`) confirmed red (fell through to the SPA
      catch-all, decode error on the HTML response) before the route was wired.

## 2. Frontend: version detail dialog — diff

- [x] 2.1 Write a failing test (`apps/web/src/components/VersionDetailDialog.test.tsx`): given
      two versions where title and one step changed, the diff shows old→new for the changed
      title and step, and does not render unchanged fields (e.g. unchanged platform/tags).
- [x] 2.2 Implement `VersionDetailDialog.tsx`'s diff computation (field-by-field for
      title/description/expectedResult/priority/tags/platform/testType/automated, index-aligned
      for steps: added/removed/changed by action or expected) and rendering. Make 2.1 pass.
- [x] 2.3 Write a failing test: opening the dialog for a case's first version shows "no previous
      version" messaging instead of a diff. Implement; make it pass.
- [x] 2.4 Wire `CaseDetailPage.tsx`'s Version history `<li>` rows to open
      `VersionDetailDialog` on click, passing the already-loaded `versions` array and the
      clicked version number. Write a failing test asserting the click opens the dialog; make it
      pass.

## 3. Frontend: version detail dialog — executions & flakiness

- [x] 3.1 Write a failing test: given a mocked `GET /api/v1/cases/{caseId}/executions` response
      with two executions for the open version (one pass, one failed) and one for another
      version, the dialog lists only the two matching the open version, each with its run name
      and a verdict badge (reusing `CaseResultsPanel`'s `VERDICT_COLOR`/`VERDICT_LABEL` maps).
- [x] 3.2 Implement the executions fetch + filter + list rendering. Make 3.1 pass.
- [x] 3.3 Write a failing test: mixed pass/failed executions for the open version show a Flaky
      badge; all-pass (or no executions) does not. Implement the flag; make it pass.
      (2.1–3.3 landed together in `VersionDetailDialog.test.tsx`'s 5 test cases — the diff and
      executions/flakiness behaviors share one component and one test file, per design.md's "one
      dialog serves both" decision, rather than being split file-by-subtask.)

## 4. E2E coverage

- [x] 4.1 Extended `apps/web/e2e/ui-navigation.spec.ts`'s "Viewing an existing test case" block
      with 4 new scenarios: opening a version's dialog, diff shows changed fields only, oldest
      version has no predecessor, executions list + Flaky flag on mixed results.
- [x] 4.2 Ran the full e2e suite (headless) — 51/51 passed, confirmed stable across repeated runs
      (both default 5-worker and fully serial). Found and fixed two real races **in the new
      e2e tests themselves** (not the app): both navigated away immediately after a
      create/record-verdict action without waiting for the write to confirm, occasionally racing
      the in-flight request. Fixed by asserting the expected confirmation text before
      proceeding, matching this file's own established pattern elsewhere. Also found and fixed a
      genuine, pre-existing flake in `test-authoring.spec.ts`'s "Create a test case, then edit it
      to create a new version" scenario: its final assertion used an unscoped
      `page.getByText(...)` that's briefly ambiguous between the case-detail page's heading and
      breadcrumb (both carry the case title) during the transition back to the library — scoped
      it to the content list instead.

## 5. Specs & docs

- [x] 5.1 Ran `openspec-sync-specs` to merge this change's `ui-navigation` and `test-execution`
      deltas into `openspec/specs/`.
- [x] 5.2 Updated `docs/test-management.md`'s version-history section for the new detail dialog
      (diff + executions + Flaky flag).
- [x] 5.3 Added "Diffing two versions of the same content: field-by-field, not text-diff" to
      `docs/design-system.md`.

## 6. Final verification

- [x] 6.1 `make lint`, `make test`, `make coverage-api` (80.8%), `make coverage-web` (92.4%
      statements / 80.1% branches / 91.6% functions / 95.0% lines) all pass.
- [x] 6.2 Close GitHub issues #54 and #55, referencing this change, once archived.

## 7. Live review follow-up: header redundancy (found while reviewing this change's UI)

- [x] 7.1 Live review of the case detail header (touched by this change's version-history
      wiring) flagged the `Close` button as a `CaseDrawer`-era leftover, equal-weight and
      adjacent to `Edit`. Wrote a failing test (`CaseDetailPage.test.tsx`) asserting no `Close`
      button renders and a "back" link exists instead; implemented a standalone "← Back to
      Library" link above the title. Made the test pass.
- [x] 7.2 Second live review (with real seeded data, a case inside a subfolder) found the new
      link duplicated the breadcrumb's own last clickable segment, and did it worse — always
      the library root, not the case's actual parent folder. Wrote failing tests asserting (a)
      no standalone "Back to Library" text exists and (b) a back link targets the case's real
      parent folder with an accessible name matching it. Implemented: merged a `←` into the
      title row itself, linking to `folder ?? root`. Updated the three e2e specs' locators —
      no change needed, `getByRole('link', { name: /back to library/i })` still matches via the
      new `aria-label` for root-level test cases. Documented in `docs/design-system.md`.
      Full suite after: 401/401 web unit tests, 51/51 e2e.
- [x] 7.3 Third live review, this time zoomed into an actual rendered screenshot rather than a
      code read, caught two more issues: the `←` had no explicit size and rendered visibly
      smaller than and misaligned against the `text-2xl` heading next to it; separately, the
      `in {folderName}` subtitle below the title was *also* restating the breadcrumb's
      parent-folder crumb (same duplication class as 7.2, on a different element). Wrote failing
      tests for both (arrow has the `text-2xl` class; the `in {folder}` text does not render);
      implemented (`text-2xl leading-none` on the arrow, `gap-2` → `gap-3` for breathing room;
      removed the subtitle `<p>` entirely). Rewrote `docs/design-system.md`'s header section
      into a single canonical "entity-detail page header" pattern (breadcrumb owns "where," the
      title row owns only "what" + actions) with a copyable JSX shape, for reuse by any future
      detail page — not just a case-detail-specific note anymore. Full suite after: 403/403 web
      unit tests, 51/51 e2e, rebuilt and confirmed live via a zoomed screenshot.
- [x] 7.4 Live review called the now-decluttered header "too gray." Built two color-only
      variants live (plain `text-primary` tint on the arrow vs. a filled circular chip matching
      the step-badges' motif) and compared them side by side in the running app before deciding
      — the chip looked stronger in the abstract but rendered heavier than intended (a 36px
      circle taller than the text line, overstating a secondary action's weight). Settled: plain
      tint only, on the arrow alone — breadcrumb and title text stay neutral, since color should
      mark meaningful elements, not restate hierarchy contrast/weight already communicate. Wrote
      a locking test (`tints the back arrow with the brand color, not flat gray`) asserting
      `text-primary` and not `text-muted-foreground`. Documented in `docs/design-system.md`
      (Round 4). Full suite after: 404/404 web unit tests, 51/51 e2e, rebuilt and confirmed
      live via a zoomed screenshot.
