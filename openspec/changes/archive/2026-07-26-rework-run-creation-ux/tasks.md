## 1. Extract `CasePicker` from `SuiteCaseGrid` — TDD

- [x] 1.1 Write failing tests (moved/adapted from `SuiteCaseGrid.test.tsx`) for a
  new `CasePicker` component: section-tree scope, search, filters, virtualized
  rows bounded at scale, selection survives scope/filter/search changes — pure
  picker mechanics, no membership-diff footer.
- [x] 1.2 Implement `CasePicker.tsx` by lifting the tree/search/filter/
  virtualization/selection internals out of `SuiteCaseGrid.tsx`
  (`buildFolderTree`, `TreeNode`, `computeVisibleRange`, `tagPills`, row
  constants) unchanged in behavior.
- [x] 1.3 Rewrite `SuiteCaseGrid.tsx` as `<CasePicker ... /> ` plus its existing
  Save/Cancel membership-diff footer. Adjusted (not "unmodified" as originally
  planned): one test — "shows a selection count independent of the filtered
  row count" — actually exercised the commit footer's "N selected" label, not
  picker mechanics, so it stayed on `SuiteCaseGrid.test.tsx` while its
  CasePicker.test.tsx counterpart was rewritten to assert the "Selected only
  (N)" toggle instead. `SuiteDetailPage.test.tsx` (10 tests, unmodified) still
  green — no consumer-visible regression.

## 2. Reworked "New run" form — TDD

- [x] 2.1 Write failing tests: the form renders `CasePicker` with an initially
  empty selection; "Create run" is disabled until at least one case is checked.
- [x] 2.2 Implement: replace `RunsPage.tsx`'s name-only form with name field +
  `CasePicker`, gated "Create run" button. `handleCreateRun` now sends
  `caseKeys` from the picker's selection, not every project case.
- [x] 2.3 Write failing tests: a suite selector seeds the picker's selection
  from that suite's current members (fetched case keys) with scope left at
  "All sections"; switching back to "No suite" clears the seeded selection.
  (Manual-edits-after-seeding-preserved falls out structurally — seeding only
  ever runs on an explicit selector change, never on a timer/effect re-run —
  no separate test needed to prove a negative with no code path that could
  cause it.)
- [x] 2.4 Implement the suite selector and one-time seeding logic
  (`seedSelectionFromSuite`, shared with the route-state deep-link in task 3).
- [x] 2.5 Write failing tests: creating a run with a suite selected sends
  `suiteKey`; creating with "No suite" sends only `caseKeys` (ad hoc).
- [x] 2.6 Implement — fell out of 2.2/2.4 with no new branch, as planned.
  All 12 `RunsPage.test.tsx` tests green (rewrote 2 that asserted the old
  "every case" default, which the new spec explicitly forbids); `tsc
  --noEmit` clean.

## 3. Suite "Run suite" quick action — TDD

- [x] 3.1 Write failing tests: `SuiteDetailPage.tsx`'s Actions sidebar renders
  a "Run suite" button; clicking opens a confirm dialog showing the suite's
  current case count and an editable name.
- [x] 3.2 Implement the button and dialog.
- [x] 3.3 Write failing tests: confirming creates a run from the suite (sends
  `{name, suiteKey}` — the backend already expands a bare `suiteKey` to that
  suite's current cases, `service.go:406-409`, so no client-side case-id
  mapping is needed here) and refreshes the suite (verified via a second
  `GET /api/v1/suites/{suiteKey}` call, standing in for the Properties panel
  update); "Customize selection" navigates to the Runs page with route state
  `{seedFromSuiteKey, seedName}`. Simplified from the plan: no "Arrived from
  {suite}" banner — the mockup's banner was UI polish, not load-bearing to
  the deep-link mechanism itself; the picker's own "Pre-filled from {suite}"
  note (task 2, already implemented) already communicates the same thing, so
  a second, redundant banner was dropped rather than built and left unused.
- [x] 3.4 Implement `openRunSuite`, `handleQuickRun`, `handleCustomizeSelection`
  on `SuiteDetailPage.tsx`, and the Runs-page route-state read on mount
  (reusing `seedSelectionFromSuite` from task 2.4 — no second implementation).
  Found and fixed a real flaky-test risk while adding this: the deep-link
  effect's `setSelected` commits one render after the case rows first
  appear (rows render unchecked on the `cases`-loaded render; the effect then
  seeds selection on the next render), so a bare `findByRole` + synchronous
  `.toBeChecked()` could resolve on that intermediate unchecked render —
  reproduced by looping the test ~15x locally. Fixed by wrapping the
  assertion in `waitFor` in `RunsPage.test.tsx`; confirmed stable across 15
  more loops after the fix. Not a production bug (the UI settles correctly;
  a real user never sees the intermediate frame within the seeding effect's
  single render pass), but a real test-robustness gap worth catching before
  it flaked in CI.

## 4. Verification

- [x] 4.1 Full unit suite green (554 tests, 54 files), coverage
  92.38%/81.25%/91.44%/95.29% (stmts/branch/funcs/lines) — gate maintained.
- [x] 4.2 `tsc -b` (the real `npm run typecheck`/build gate — an earlier
  `tsc --noEmit -p .` pass had missed a real error this caught: `mockGET.mock
  .calls.filter(([path]) => ...)` destructuring failed to typecheck under
  `tsc -b`'s project-build mode; fixed by indexing `call[0]` instead) clean;
  `oxlint` clean (only pre-existing fast-refresh warnings, same class already
  present elsewhere).
- [x] 4.3 e2e scenarios, run against a rebuilt `docker compose` stack:
  - Extended TD-24 (test-execution.spec.ts, "Run creation pins case
    versions") and TD-25/26/27/28/54/the un-mapped right-click and item-
    breadcrumb scenarios (test-execution.spec.ts + ui-navigation.spec.ts) —
    all previously relied on "Create run" implicitly including every case;
    added a shared `createRun(page, name, caseTitles)` helper (DRY across 6
    call sites) and explicit checkbox checks everywhere "Create run" is
    clicked.
  - New TD-63 (`ui-navigation.spec.ts`, "Requirement: Run creation"):
    selecting a suite in the New run form seeds the picker and creates a
    suite-linked run.
  - New TD-64/TD-65 (`ui-navigation.spec.ts`, "Requirement: Suites index and
    detail page"): the "Run suite" immediate-confirm path, and "Customize
    selection" handoff to the New run form pre-seeded.
  - Found and fixed three real, reproducible (not flaky) e2e bugs surfaced
    by this change, each confirmed by looping the affected test 5-6x in
    isolation before and after the fix:
    1. TD-32 ("Breadcrumb on a run page") called the file's `createCase`
       helper (which — unlike `createProjectWithCase`'s own version — never
       waited for the case to actually appear) then immediately navigated
       away; harmless under the old "every case" default, but the new
       picker depends on the case having loaded. Fixed by awaiting the
       case's visibility before navigating.
    2. `createSuiteWithOneCase` (shared helper for TD-63/64/65) asserted
       the case checkbox was checked right after clicking "Save changes" —
       true immediately since it's local state set before the click, so it
       proved nothing about the PUT actually completing. Fixed by waiting
       for the "Save changes" button to re-disable (the real signal that
       the reload landed), which is what actually made the suite's card
       show the correct case count before the run-creation step ran.
    3. TD-64 asserted `getByText(/never run/i)).not.toBeVisible()` — a
       strict-mode-ambiguous locator (two sidebar rows, pass rate and last
       run, both read "Never run" before the first run exists) that also
       raced the properties reload (`handleQuickRun` closes the dialog
       before its `await load()` resolves, same ordering already used by
       Rename/Delete on this page). Fixed by scoping to the sidebar and
       using `toHaveCount(0, {timeout: 10000})`, which tolerates the
       multi-match locator without a strict-mode violation while it
       settles.
  - Full suite run at `--workers=3`: 67/68 passed, the one failure in an
    unrelated pre-existing scenario ("Deep section nesting collapses the
    middle of the trail," no relation to runs/suites) that passes reliably
    alone — consistent with this machine's known contention flakiness under
    full parallelism (default `fullyParallel: true`, no worker cap), not a
    defect in this change. Every scenario this change touches or added
    passed cleanly and repeatedly.
- [x] 4.4 Manual visual verification via browser automation not attempted
  this round — the e2e suite already drove every new interaction (picker,
  suite selector, quick-run dialog, customize-selection handoff) in a real
  Chromium via Playwright against the same compose stack, which is stronger
  evidence than a one-off manual click-through would add.

## 5. Docs and Sample Project

- [x] 5.1 Updated `docs/test-management.md`'s Runs section (picker + suite
  seeding + ad hoc default) and the Suites section (Run suite action added
  to the properties-sidebar description).
- [x] 5.2 Sample-Project-showcase: confirmed — the Sample Project already
  has 4 suites with distinct case counts (Smoke, Regression, Nightly, API
  Contract; `seed.go`), two with real run history and two never-run, across
  multiple sections. No new seed data needed; the new picker/quick-run
  surfaces demonstrate against data that already exists.

## 6. Ship

- [x] 6.1 Synced into `openspec/specs/ui-navigation/spec.md` — added "Run
  creation" and extended "Suites index and detail page" with the Run suite
  scenarios and the properties-sidebar wording (rename/delete/run actions).
- [x] 6.2 Archived, keeping `mockup.html` as the durable design reference.
- [x] 6.3 Filed GitHub issue #91, added to the project board (status:
  Planned → In progress at implementation start → Done at ship), matching
  the tracking precedent for every other UX rework this session.
- [ ] 6.4 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait
  for CI green.
