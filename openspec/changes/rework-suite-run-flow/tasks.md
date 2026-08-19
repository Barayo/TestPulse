## 1. Confirmation toast redesign (D1, D2)

- [x] 1.1 Updated `ConfirmBanner.test.tsx`: replaced the old auto-dismiss test with one
      asserting NO dismissal after 60s, added a `fixed`-class assertion and an
      icon-dismiss (not raw glyph) assertion. Confirmed RED (3 failures, all for the
      expected reasons — missing `fixed` class, timer still firing, no `<svg>`).
- [x] 1.2 Implemented `ConfirmBanner.tsx`: `fixed inset-x-4 bottom-4` (mobile) /
      `sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96` (desktop), removed
      `AUTO_DISMISS_MS`/its `useEffect` timer entirely, `bg-card` + `ring-1
      ring-foreground/10` + `shadow-lg`, lucide `XIcon` replacing the raw `×`. All 7
      tests green.
- [x] 1.3 Updated the confirmation-banner tests in `SuiteDetailPage.test.tsx`,
      `SuitesPage.test.tsx`, and `RunPage.test.tsx` (new copy/link-label), plus
      `SuiteActionsMenu.test.tsx`'s `onRunCreated` assertion, plus a new RunPage test
      guarding on `run` being loaded. Confirmed RED (5 failures across 4 files, all for
      the expected reason — old copy/shape still in place).
- [x] 1.4 Changed `SuiteActionsMenu.tsx`'s `onRunCreated` prop to
      `(run: { key: string; name: string }) => void`; `handleQuickRun` now passes
      `{ key: data.key, name: data.name }`.
- [x] 1.5 Updated `SuiteDetailPage.tsx` and `SuitesPage.tsx` (including `SuiteCard`'s
      own prop type): state is `createdRun: { key; name } | undefined`, banner message
      `Run "{name}" created.` with "View it →" link.
- [x] 1.6 Updated `RunPage.tsx`'s post-creation banner: message-only (no link), gated on
      `showCreatedBanner && run`, "successfully" dropped.
- [x] 1.7 All 138 tests across the 4 affected files green; `tsc -b` clean.

## 2. Suite Detail page view/edit mode split (D3)

- [x] 2.1 Added tests to `SuiteCaseGrid.test.tsx`: a "Done" control alone when
      `readOnly` (calls `onExit`), a "Cancel" control alongside the commit button when
      editable (calls `onExit`, not `onCommit`). Confirmed RED (2 failures, button not
      found).
- [x] 2.2 Implemented `SuiteCaseGrid.tsx`'s new required `onExit` prop and the
      readOnly/editable footer split. All 9 tests green. Note: this makes `onExit`
      required, breaking `SuiteDetailPage.tsx`'s current call site until task 2.6 wires
      it up — expected, fixed in the same section.
- [x] 2.3 Created `RunList.test.tsx` for a new shared `RunRow`/`RunSection` module —
      name/health-bar/"not run yet"/relative-date rendering, section count, empty
      message, cap-at-10-with-"Show N more". Confirmed RED (module doesn't exist).
- [x] 2.4 Extracted `RunRow`/`RunSection` into `components/RunList.tsx` (byte-identical
      to `RunsPage.tsx`'s prior inline versions); updated `RunsPage.tsx` to import from
      it instead of defining locally. All 22 tests (`RunList.test.tsx` +
      `RunsPage.test.tsx`) green — no behavior change confirmed. (The per-row action
      menu slot is added in section 3, not here — pure extraction only.)
- [x] 2.5 Rewrote `SuiteDetailPage.test.tsx`: view mode is the default (no case grid),
      Stability/Run history sections present, "Edit cases"/"View cases" label depends
      on `suiteEditMembership`, entering edit mode shows the grid pre-checked, Cancel
      discards uncommitted changes and returns to view mode, Done does the same for
      non-editors. Added an `enterEdit()` helper and extended `mockDetailAPI` with
      trend/runs endpoints. Confirmed RED (12 of 19 failed — view mode didn't exist,
      grid was unconditional).
- [x] 2.6 Implemented the `isEditing` boolean split in `SuiteDetailPage.tsx` following
      `CaseDetailPage.tsx`'s pattern (sidebar constant, primary content switches, reset
      to view mode via the existing `[suite, cases]` reload effect). Wired in
      `SuitePassRateTrend` (unmodified) fed by `GET /suites/{suiteKey}/trend`, and a
      Run history card using the shared `RunRow`, filtered to `run.suiteKey ===
      suite.key`. Removed the old standalone `PropertyRow label="Last run"`. Added
      `exitEditing()` (resets `selected` to `baseline` before closing) so Cancel
      genuinely discards changes, not just hides the grid. All 19 tests green on first
      implementation attempt; full web suite (1173 tests) still green — no regressions.
- [x] 2.7 Added a Stability-section empty-state test (no closed runs → the trend
      component's own placeholder). Passed immediately — confirms
      `SuitePassRateTrend`'s pre-existing empty-state handling was already correctly
      wired through, nothing further needed.
- [x] 2.8 All 20 `SuiteDetailPage` tests green (plus `SuiteCaseGrid`/`RunList` from
      earlier in this section); `tsc -b` clean; full web suite green.

## 3. Per-run "Compare…" entry points (D4)

- [x] 3.1 Added tests to `RunComparePickerPage.test.tsx`: `location.state?.seedRunKey`
      pre-fills the first dropdown, submit works with only the second run picked.
      Confirmed RED (2 failures — no pre-fill existed).
- [x] 3.2 Implemented `seedRunKey` handling in `RunComparePickerPage.tsx`: initial
      state reads it directly, a mount-only effect clears it via
      `navigate(location.pathname, { replace: true, state: null })` — the exact pattern
      `NewRunPage.tsx`'s `seedFromSuiteKey` already established. All 4 tests green.
- [x] 3.3 Added tests to `RunList.test.tsx`: `RunRow` offers "Compare…" (via
      `RowActionMenu`, right-click and the visible "⋯" trigger) only when
      `projectKey` is given AND the run is closed; selecting it navigates to
      `/projects/{projectKey}/runs/compare` with `{ state: { seedRunKey } }`.
      Confirmed RED (1 failure — menu didn't exist yet; the "no menu" cases passed
      trivially since the prop didn't exist).
- [x] 3.4 Implemented: `RunRow` restructured to a flex container (`Link` + sibling
      `RowActionMenu`), gated on `projectKey && run.status === 'closed'`, matching
      `RunItemRow`'s existing right-click/⋯ pattern. `RunSection` threads `projectKey`
      through. Wired `projectKey` into both real call sites — `RunsPage.tsx`'s two
      `RunSection`s and `SuiteDetailPage.tsx`'s Run history card — so the action is
      live in both places, not just the shared component. All 8 `RunList` tests green;
      full web suite (1179 tests) and `tsc -b` clean.
- [x] 3.5 Added a `ComparePickerProbe` route and tests to `RunPage.test.tsx`: a
      "Compare…" button appears only when `run.status === 'closed'`, navigating with
      `{ state: { seedRunKey: run.key } }`. Confirmed RED (1 failure as expected).
- [x] 3.6 Implemented the button in `RunPage.tsx`'s header row, leftmost — before the
      status Badge and Close/Reopen/Delete. All 89 `RunPage` tests green.
- [x] 3.7 Added a `ComparePickerProbe` route and tests to `RunsPage.test.tsx`: an
      outline "Compare runs" button in the header, visible only when
      `closed.length >= 2`, navigating with no state (unseeded). Confirmed RED (1
      failure as expected).
- [x] 3.8 Implemented the button in `RunsPage.tsx`'s header, left of "+ New run". All
      19 tests green.
- [x] 3.9 Also added dedicated tests for the suite Run history card's own "Compare
      runs" link (implemented alongside the card in task 2.6 but not yet covered by a
      test) — both passed immediately, confirming that earlier implementation was
      already correct; no code change needed. Full web suite (1185 tests) and
      `tsc -b` clean.

## 4. Name-confirmation focus fix (D5)

- [x] 4.1 Added a test to `SuiteActionsMenu.test.tsx`: the quick-run dialog's name
      input has its full text selected (`selectionStart`/`selectionEnd` span the
      value) right after opening. Confirmed RED (selectionStart was 9 — cursor parked
      at end, not selected).
- [x] 4.2 Added `onFocus={(e) => e.currentTarget.select()}` to the quick-run dialog's
      Name input in `SuiteActionsMenu.tsx`. All 17 tests green.
- [x] 4.3 Added a test to `NewRunPage.test.tsx`: arriving via `state.seedName` focuses
      the name field with its text fully selected. Confirmed RED.
- [x] 4.4 Implemented via a ref + a one-shot guarded effect in `NewRunPage.tsx`. Found
      and fixed a real timing bug during this task: calling `.focus()`/`.select()`
      synchronously in the same effect that calls `setRunName(...)` selects against
      the DOM's *stale* value, since React hasn't committed the new value yet — the
      test still failed (`selectionStart` stayed at the end) even after wiring the ref
      correctly. Fixed by setting a `justSeededNameRef` flag in the seeding effect and
      doing the actual focus/select in a separate effect keyed on `[runName]`, which
      only runs after the new value is committed to the DOM; the ref guard stops it
      from re-firing on every later keystroke. All 15 `NewRunPage` tests green.
- [x] 4.5 Full web suite (1187 tests) and `tsc -b` clean.

## 5. Bug fix: "Compare to previous run" requires the current run be closed (D6)

- [x] 5.1 Added a test reproducing the live bug exactly: an open run whose suite has
      an earlier closed run must not show "Compare to previous run". Also discovered
      and fixed the existing "shows Compare to previous run..." test itself was
      exploiting the bug (it never overridden `status`, so ran against an open run by
      accident, while asserting the buggy behavior was correct) — corrected it to use
      a closed run. Confirmed RED on the new test (found the exact `href` the live
      bug produces).
- [x] 5.2 Added the `run?.status !== 'closed'` gate to `RunPage.tsx`'s `priorRunKey`
      resolution effect, with `run?.status` added to its dependency array.
- [x] 5.3 Full `RunPage.test.tsx` suite green (90 tests); full web suite (1188 tests)
      and `tsc -b` clean.

## 6. Stability card: closed/open-and-closed view split, mark-spec upgrade, marker-rendering bug fix (D7)

- [x] 6.1 Rewrote `SuitePassRateTrend.test.tsx` against the new `TrendPoint[]`
      contract (`{ runKey, runName, createdAt, rate, isOpen, detail }`) and an
      `emptyMessage` prop: markers are HTML overlay elements (`closest('svg')` is
      null), positioned by `style.left`/`style.top`; the endpoint is visually larger
      than other points; an `isOpen` point carries `data-open="true"`, a closed one
      doesn't; a dashed line segment (`suite-trend-dash-segment`) exists only when the
      endpoint is open; tooltip content comes from `detail`; the empty state uses the
      caller-provided message. Confirmed RED (13 of 13 failed — old
      `SuiteTrendPoint[]`-only contract, no `TrendPoint`/`emptyMessage` exports).
- [x] 6.2 Rewrote `SuitePassRateTrend.tsx`: point markers moved to an
      absolutely-positioned HTML overlay sibling to the SVG (the real fix — confirmed
      `vectorEffect="non-scaling-stroke"` alone would not have worked, since it
      protects stroke width, not fill geometry); added an area-fill gradient, a
      faint two-line grid, a `--card`-colored gap ring on every point, a 12px vs. 7px
      emphasized endpoint with a soft glow, and a hollow/dashed treatment for
      `isOpen` points (plus a dashed line segment when the endpoint itself is open).
      Prop is now `points: TrendPoint[]` + `emptyMessage: string`. All 13 tests green.
- [x] 6.3 Added tests to `SuiteDetailPage.test.tsx`: a "Closed runs"/"Open + closed"
      toggle group in the Stability card, "Closed runs" selected by default
      (`aria-pressed`), only closed-run points shown; switching to "Open + closed"
      shows every run including the open one (`data-open="true"`); each view shows
      its own caption ("only closed runs" / "will keep moving"). Confirmed RED (3
      failures — no toggle existed).
- [x] 6.4 Implemented: added `closedPoint`/`runPoint` mapping functions (module-level,
      alongside the existing `toGridCase`) and a `stabilityView` state, defaulting to
      `'closed'`. Toggle group reuses `ProfilePage.tsx`'s exact established idiom for
      a small persistent selector (`role="group"`, `rounded-full bg-muted p-1`,
      active `bg-card shadow-sm`) rather than inventing a new pattern — the page's
      own Edit/View mode control turned out to be a single button, not a tab strip,
      in the actual shipped code, so this is the real precedent to match. All 25
      `SuiteDetailPage` tests green on first implementation attempt.
- [x] 6.5 All `SuitePassRateTrend` (13) and `SuiteDetailPage` (25) tests green;
      `tsc -b` clean. Full web suite: non-deterministic across repeated runs (0-2
      failures, different files each time, e.g. `InstanceSettingsPage.test.tsx` —
      unrelated to any file this change touches, confirmed passing in isolation every
      time) — consistent with the parallel-worker flakiness already documented in
      task 9.2, not a regression from this section's work. A fully clean 1195/1195
      run was reproduced.

## 7. Sample Project showcase

- [x] 7.1 Reviewed `seed.go` (grep-verified, not assumed): no gap found, no changes
      needed. The Regression suite already has exactly 2 closed runs ("Release 1.1
      regression", "Release 1.1.1 hotfix verification" — from `add-run-comparison-view`)
      → populated Stability trend, populated Run history, and the `closed.length >= 2`
      "Compare runs" button all have real data to show. The Smoke and API Contract
      suites are deliberately never used as a run source anywhere in `seed.go` (their
      own comment already explains this, for the pre-existing "Never run" showcase) —
      they double as the zero-runs case, showing both the Stability and Run history
      empty states for free. The Nightly suite (1 open run, 0 closed) is a bonus third
      combination — empty Stability trend alongside a populated, single-open-run
      history — not required but a nice validation that the two cards are independent.
- [x] 7.2 Not applicable — no seed data changed, so `seed_test.go` needs no updates.
- [x] 7.3 Reviewed `seed.go`: a real gap found — no seeded suite naturally had *both*
      closed history and a trailing open run (Regression: 2 closed, 0 open; Nightly:
      0 closed, 1 open), so the "Open + closed" view's dashed-line-into-an-open-
      endpoint treatment had nothing real to render against. Added a third
      Regression-suite run, "Release 1.1.2 patch verification," fully executed but
      deliberately left open (a real, common state — finished testing, not yet
      formally closed — not a contrived one). Found `RunFromSuiteWithVerdicts`
      doesn't support a caseIDs subset to leave items pending (`SuiteID` drives
      item selection from the suite's full membership regardless of the `caseIDs`
      param passed for verdict-mapping) — an initial attempt at a "5 executed, 3
      pending" version failed with `invalid verdict ""`; simplified to all 8 cases
      executed instead.
- [x] 7.4 Added `TestSeedContentHasAnOpenRunAmongClosedSuiteHistory` to
      `seed_test.go`, asserting the Regression suite has at least one closed AND one
      open run. Full `internal/sampledata` suite green; `go vet ./...` clean.

## 8. Documentation

- [x] 8.1 Updated `docs/test-management.md`'s Suites section: view mode's Stability/Run
      history cards and their empty states, the Edit cases/View cases toggle and its
      Cancel/Done exit, the quick-run dialog's select-on-focus name field, and the new
      toast copy/behavior (`Run "{name}" created.`, persistent until dismissed).
- [x] 8.2 Updated the "Comparing runs" section: "Compare to previous run" now notes the
      run-itself-must-be-closed requirement; added the new "Compare…" (per-row/per-run,
      seeded) and "Compare runs" (unseeded, ≥2 closed runs) entry points, all landing
      on the same explicit picker.
- [x] 8.3 Updated `docs/test-management.md`'s Stability description: split into its own
      paragraph covering the Closed runs/Open + closed toggle, what each view counts,
      the open-run pass-rate semantic, and the hollow/dashed open-point and
      emphasized-endpoint visual treatments.
- [x] 8.4 Updated `docs/test-management.md`: added a paragraph after the Stability
      description covering the headline-always-reflects-the-most-recent-closed-run
      behavior, the "N in progress" badge, and the no-closed-runs placeholder;
      rewrote the "picker itself" sentence in Comparing runs to describe the
      custom listboxes (name + date + pass-rate health per option) and mutual
      exclusion between the two sides.

## 9. E2E coverage

- [x] 9.1 Added 5 new scenarios to `ui-navigation.spec.ts`: suite detail defaults to
      view mode (no checkboxes, Stability + Run history present); toggling Edit
      cases/View cases and back (Cancel discards, Stability reappears); the
      confirmation toast is visible with a real `position: fixed` assertion after
      deliberately scrolling the page first; a run row's "Compare…" context-menu
      action lands on the picker with that run pre-selected (`toHaveValue` on the
      seeded dropdown). Also fixed a real gap in the existing TD-91 scenario — it
      checked "Compare to previous run" appears on a just-created (open) run, which
      is exactly the bug fixed in section 5; corrected it to close the run first.
- [x] 9.2 Rebuilt the compose stack and ran the full `apps/web/e2e` suite repeatedly.
      Found and fixed 8 real regressions from the view/edit mode split — every test
      that checked a suite's case-membership checkbox directly, without first
      clicking "Edit cases", across `ui-navigation.spec.ts` (the shared
      `createSuiteWithOneCase` helper, used by ~15 tests; the section-tree resize
      test, which also needed re-entering edit mode after its `page.reload()`; the
      inline "Viewing steps and suite membership" test) and two other spec files
      (`test-execution.spec.ts`'s "Run header links to its source suite",
      `test-authoring.spec.ts`'s "Add cases to a suite…") — plus every "View run →"
      link-text reference updated to "View it →" and the old "Run created
      successfully" copy updated to the new toast text. Also hit and diagnosed a
      real environmental issue: this session's many manual E2E/browser-verification
      runs against one long-lived local compose stack had exhausted the login
      rate limiter's production-safe default (5/minute — confirmed via
      `apps/api/internal/server/ratelimit.go` and `ci.yml`, which overrides it to
      600/100 specifically for E2E) — set the same override locally to get a clean
      run rather than a real bug. After all fixes: full suite passes; the only
      remaining failures across several full runs were (a) different single tests
      each time under 4-worker parallelism, always passing when re-run serially —
      confirmed as parallel-resource flakes, and (b) `ui-theming.spec.ts`'s "Tenant
      Admin saves a custom palette", reproducible even in full isolation — a
      pre-existing bug in a file this change never touches (custom palette save
      not taking effect), flagged separately, not fixed here (out of scope).
- [x] 9.3 Added an E2E scenario: closes one run, leaves a second open, then confirms
      "Closed runs" is selected by default with its caption, switching to "Open +
      closed" flips the toggle and its caption, and exactly one point carries
      `data-open="true"` (an attribute assertion, not a pixel comparison). All 61
      tests in `ui-navigation.spec.ts` pass, including the 5 added earlier in this
      change.
- [x] 9.4 Added two scenarios to `ui-navigation.spec.ts` (TD-98, TD-99): (a) a suite
      with a closed, fully-passing run followed by a fresh open run shows "100%" (not
      "0%") plus "1 in progress" once switched to Open + closed; (b) the picker,
      given a project with two closed runs sharing a name, shows two distinguishable
      options (each with its own pass-rate health) and picking one removes it from
      the other side. Found and fixed three real regressions from D9 along the way:
      (1) `RunComparePickerPage.tsx`'s dropdowns were wrapped in native `<label>`
      elements — harmless for a real `<select>`, but clicking a `role="option"` `<li>`
      (not itself labelable) inside a `<label>` makes the browser forward a synthetic
      click to the labelable descendant (the trigger `<button>`), reopening the popup
      immediately after selection closed it; fixed by swapping the wrapper `<label>`s
      for plain `<div>`s (the trigger already names itself via its own `aria-label`,
      so no label/for association was doing anything for it). (2) TD-96's assertion
      `getByLabel('First run')).toHaveValue(...)` no longer applies to a button —
      swapped for `toContainText`. (3) TD-92's `selectOption` calls swapped for
      click-to-open/click-an-option, matching the new listbox interaction. Also two
      test-authoring bugs of my own, both found via a live run against the rebuilt
      compose stack, not assumed: the new TD-99 initially asserted `getByText('100%')`
      unscoped, matching two elements (the headline and a Run history row) — scoped
      to the Stability card via `[data-slot="card"]` — and then asserted
      `getByText('0%')` (`not.toBeVisible`), which Playwright's default substring
      matching resolved against the "100%" span itself (`"100%"` contains `"0%"`) —
      fixed with `{ exact: true }`. Also renamed TD-98's fixture project away from
      containing the word "Name" — a full-suite run showed a real, previously-latent
      hazard: any project title containing "Name" collides with every other test's
      `getByLabel('Name')` on the create-project dialog once that project is sitting
      in the list (its Star button's `aria-label` also matches the same fuzzy
      substring lookup) — wiped the local compose DB volume to clear the offending
      leftover fixture from an earlier partial run, then reran clean. Full
      `ui-navigation.spec.ts`: 63/63 green (one unrelated single-test failure on an
      earlier attempt — "A currently-flaky case shows a Flaky indicator" — confirmed
      as the same pre-existing parallel-worker flake documented in 9.2, passing in
      isolation).

## 10. Stability headline reflects the most recent closed run (D8)

- [x] 10.1 Added tests to `SuitePassRateTrend.test.tsx`: the headline shows the most
      recent closed point's rate even when a newer open point exists (and never the
      open point's own 0%); a "1 in progress" badge appears when a newer open point
      trails the headlined closed one; no badge when the newest point is itself
      closed; a placeholder (`—`) headline plus the badge when there is no closed
      point at all. Confirmed RED (3 of 3 new tests failed as expected; the 14
      pre-existing tests, including the original all-closed headline test, stayed
      green — unaffected by the change).
- [x] 10.2 Implemented: `headlinePoint` walks the reversed points array to the first
      closed one; `openRunsAfterHeadline` counts open points newer (by `createdAt`)
      than that headline point (or all open points if there's no closed run at all).
      Headline renders `headlinePoint.rate` or `—`; a `Badge variant="secondary"`
      ("N in progress") renders only when `openRunsAfterHeadline > 0`. Also fixed the
      chart's own `aria-label`, which still referenced the raw latest point's rate.
      All 17 tests green.
- [x] 10.3 All `SuitePassRateTrend` (17) and `SuiteDetailPage` (25) tests green;
      `tsc -b` clean.

## 11. Run comparison picker: custom listbox replacing native selects (D9)

- [x] 11.1 Added a test to `RunList.test.tsx`: "suppresses the actions menu entirely
      when showActions is false, even for a closed run with a projectKey" — renders
      `<RunRow run={{...closed}} projectKey="p1" showActions={false} />` and asserts
      no "Actions for …" button exists. Confirmed RED (prop didn't exist yet;
      `showActions` was silently ignored and the menu rendered anyway — 1 failure).
- [x] 11.2 Implemented: `RunRow` takes `showActions = true`; the existing
      `projectKey`/status gate becomes `showMenu = showActions && Boolean(projectKey)
      && run.status === 'closed'`. All 9 `RunList.test.tsx` tests green.
- [x] 11.3 Created `RunListbox.test.tsx` (9 tests): placeholder trigger, selected-run
      trigger content, opens a `role="listbox"` of `role="option"` rows on click
      (name + health + date), clicking an option selects and closes, Arrow Down/Up
      moves `aria-activedescendant` without moving `document.activeElement` off the
      trigger, Enter selects the active option and closes, Escape closes without
      calling `onChange`, click-outside closes, and no option renders its own
      actions menu. Confirmed RED (`Failed to resolve import "./RunListbox"` — the
      component didn't exist yet).
- [x] 11.4 Implemented `RunListbox.tsx`. Refactored `RunList.tsx` first (pure
      extraction, no behavior change — reran `RunList.test.tsx` after, still
      9/9 green): pulled the name/health/date markup out of `RunRow`'s `<Link>`
      into an exported `RunRowContent`, since a listbox option must not be an
      anchor (navigation semantics don't belong in a selection control) — this is
      why `RunListbox` reuses `RunRowContent` directly rather than `RunRow` itself,
      a deliberate deviation from the task's original "(showActions={false})"
      phrasing once the Link-in-an-option conflict became concrete. All keyboard
      handling lives in the trigger's own `onKeyDown` (not a document-level
      listener like `RowActionMenu`'s Escape handling) because roving selection
      keeps DOM focus on the trigger throughout — `preventDefault` on Enter/Space
      there stops the button's native synthesized click from double-firing
      alongside the custom select-active-option logic. Only click-outside reuses
      `RowActionMenu`'s document `pointerdown` pattern. All 9 tests green;
      `tsc -b` clean.
- [x] 11.5 Rewrote `RunComparePickerPage.test.tsx` (5 tests, native `<select>`
      assertions replaced): options show name + pass-rate health, click-to-open/
      click-to-select against `role="listbox"`/`role="option"` instead of
      `userEvent.selectOptions`; `seedRunKey` pre-fill; submit navigation; new
      "selecting a run on one side removes it from the other side's options".
      Confirmed RED (5/5 failed — `getByRole('listbox', …)` not found, the page
      still rendered native selects).
- [x] 11.6 Wired `RunListbox` into `RunComparePickerPage.tsx`: each side's `runs`
      prop is filtered to exclude the other side's current selection
      (`runs.filter((r) => r.key !== runKeyB)` and vice versa) — mutual exclusion
      falls out of the existing `runs` state with no new state needed. 4/5 green
      immediately; the seed-prefill test failed once more (trigger showed the
      placeholder, not "Sprint 2") because `findAllByRole('combobox')` resolves as
      soon as the (always-present) trigger buttons mount, before the async
      `GET /runs` response lands and `RunListbox` has real run data to resolve
      `value` against — fixed by waiting on `screen.findByText('Sprint 2')`
      instead. All 5 green.
- [x] 11.7 `RunList.test.tsx` 9/9, `RunListbox.test.tsx` 9/9,
      `RunComparePickerPage.test.tsx` 5/5, `tsc -b` clean, full web suite:
      96 files / 1210 tests green.

## 12. Final verification

- [x] 12.1 All three pass: `make lint` (0 Go issues; web warnings all pre-existing),
      `make coverage-api` (81.1%, unchanged — no backend code touched by this
      frontend-only change), `make coverage-web` (statements 92.23%, branches
      84.65%, functions 89.62%, lines 94.67%). One flaky failure on the first
      `coverage-web` run (`InstanceSettingsPage.test.tsx`, a file this change never
      touches) — passed in isolation and on a full clean re-run, confirming it was
      a one-off, not a regression.
- [x] 12.2 Rebuilt and redeployed the local compose stack; verified by hand against the
      Sample Project's Regression suite (real browser, both themes):
      - View mode is the default — Stability trend (75%, 2 runs) and Run history
        (all 6 runs, newest first) render instead of the case grid; sidebar has no
        standalone "Last run" row.
      - Per-row "Compare…" menu appears only on closed rows, navigates to the picker
        with that run pre-selected ("Release 1.1.1 hotfix verification" landed
        correctly as "First run").
      - "Edit cases" opens the full case-selection grid (section tree, filters,
        Cancel/Save changes); "Cancel" discards and returns cleanly to view mode.
      - Running the suite shows the new confirmation toast, bottom-right, correctly
        worded (`Run "Regression run" created. View it →`), and the Run history list
        updates live with the new run.
      - Dark mode: toast, Stability, and Run history all render cleanly.
      - The original bug (task 5/D6): opened one of the open "Regression run" runs
        (created earlier this session against a suite with prior closed runs) —
        confirmed neither "Compare to previous run" nor "Compare…" appears on an
        open run, matching the fix.
- [x] 12.3 Rebuilt and reseeded the compose stack (wiped the volume so the new D7 seed
      data — the Regression suite's third, open run — actually appears), then
      verified by hand in a real browser against the Sample Project's Regression
      suite (both themes):
      - "Closed runs" (default): real dots (not the old squashed-dash bug), area
        fill, faint grid, emphasized endpoint, caption "Only closed runs — an
        in-progress run has no final verdict yet."
      - "Open + closed": adds the third (open) run; solid line/dots for the two
        closed points, a dashed line segment into a hollow/dashed endpoint marker
        for the open one — zoomed in and confirmed the hollow-circle rendering
        directly; caption "Every run, open or closed. The open run's rate counts
        only what's been recorded so far against its full case list — it will keep
        moving."
      - Dark mode: both views render cleanly, dashed/hollow treatment stays legible.
      - The Smoke suite (never run): both views show their own empty state
        ("No closed runs yet…" / "No runs yet — run this suite to see its trend
        here.") plus the Run history card's own empty state — confirms the original
        live-reported confusion (Stability count silently disagreeing with Run
        history with no explanation) is resolved: the two views now state exactly
        what each counts.
- [x] 12.4 Reran `make lint` (0 Go issues; web warnings all pre-existing, none in
      `RunListbox.tsx`/`RunList.tsx`/`RunComparePickerPage.tsx`), `make coverage-api`
      (81.1%, unchanged — frontend-only change), `make coverage-web` (statements
      92.27%, branches 84.6%, functions 89.83%, lines 94.66%). Full
      `apps/web/e2e/ui-navigation.spec.ts`: 63/63 green. Rebuilt and redeployed the
      compose stack (wiped the volume to clear a leftover test fixture from a partial
      E2E run) and hand-verified live against the reseeded Sample Project (real
      browser, both themes):
      - D8: Regression suite's Stability, switched to "Open + closed" — headline
        reads "75% pass · 3 runs" with a "1 in progress" badge; the newest run
        ("Release 1.1.2 patch verification", open) does not own the headline.
      - D9: the comparison picker's "First run" listbox opens on click showing name +
        health bar + relative date per option; selecting "Release 1.1.1 hotfix
        verification" removes it from "Second run"'s options (mutual exclusion);
        Arrow Down ×2 + Enter on "Second run" correctly lands on and selects the
        third option ("Release 1.1 regression"); Compare navigates to
        `/runs/compare/SP-R4/SP-R3` with the right runs. Dark mode: Stability card
        (badge, chart, caption) and the picker's open popup (options, health bars,
        borders) all render with correct contrast.

## 13. Suite `PassRate` reflects the most recent closed run everywhere it's shown (D10)

- [x] 13.1 Wrote failing Go tests in `apps/api/internal/store/store_test.go`:
      rewrote `TestSuitePassRateReflectsLatestRunOnly` into
      `TestSuitePassRateReflectsMostRecentClosedRun` (closed run 1 at 0%, closed run
      2 at 100%, then a trailing OPEN run recorded as failing — asserts `Get`/`List`
      PassRate is 100, from the closed run, not the open one; asserts `LastRunAt`
      still reflects the true latest run, open or not); added
      `TestSuitePassRateNilWhenNoClosedRunExists` (a single open run with a recorded
      pass — asserts PassRate is nil despite the recorded result, since nothing is
      closed yet). Confirmed RED: both failed against the old "most recently
      created run" implementation (`Get PassRate = 0, want 100`;
      `Get PassRate = 0, want nil` — the old code produced a non-nil 0% rather than
      nil for the never-closed case).
- [x] 13.2 Implemented in `apps/api/internal/store/suites.go`: split
      `latestRunStats`'s single query into two — one for `LastRunAt` (true latest
      run, any status, unchanged), one for `PassRate` (aggregated only from the most
      recent run with `status = 'closed'`, `nil` if none exists). Applied the same
      split to `SuiteRepo.List`'s batched query via two CTEs (`latest_any`,
      `latest_closed`) joined together, so the Suites index (which calls `List`) and
      the Suite Detail sidebar (which calls `Get`) both change from the same fix.
      Updated `domain.Suite`'s field comment to state the split explicitly. Also
      fixed `TestSuitePassRateIndependentAcrossSuites`, a third pre-existing test
      that used an open-only run and broke under the same RED as 13.1's rewrite —
      closed its run so it still exercises what it was actually testing
      (cross-suite isolation) under the corrected semantics. All Go store tests
      green; full `go test ./...` green (`make coverage-api`: 81.1%, unchanged).
- [x] 13.3 Sample Project showcase: extended
      `TestSeedContentHasAnOpenRunAmongClosedSuiteHistory`
      (`apps/api/internal/sampledata/seed_test.go`) — already seeded with exactly
      this scenario via D7's seed data (Regression suite: closed history + a
      trailing open run) but had no assertion on `Suite.PassRate` itself. Added one:
      finds the suite's most recent closed run among the already-fetched run list
      and asserts `regression.PassRate` equals its rate, not the trailing open run's.
      Green.
- [x] 13.4 Updated `docs/test-management.md`: replaced the stale "most recently
      created run" sentence describing a suite's pass rate with the corrected rule
      (most recent closed run, nil placeholder if none), explicitly contrasted
      against the project-level list's different, intentionally-unfiltered "latest
      run" semantic (left unchanged, out of scope), and noted `LastRunAt` keeps its
      own separate, unfiltered meaning.
- [x] 13.5 Rebuilt and redeployed the compose stack; re-ran `make lint` (0 issues)
      and the full Go suite. Hand-verified live in the browser against the exact
      scenario the user reported (Sample Project's Smoke suite: three closed runs at
      100%/75%/100%, a fourth trailing open run at 0%) — before the fix, the
      Properties sidebar read "Pass rate: 0%" beside a Stability card reading
      "100%"; after, both the sidebar and the Suites index card read "100%",
      agreeing with the Stability headline in both "Closed runs" and "Open +
      closed" views.

## 14. Stability headline removed; "Latest closed run"/"In progress" properties + per-point tooltip and endpoint label (D11)

- [x] 14.1 Looped Pepe (Fable 5, same agent/thread as D1-D10) with the exact live
      scenario and the user's verbatim reactions ("I think this is not correct" ×2,
      then "this is confusing. A lot confusing. Please ask Pepe to review this")
      and instructions not to defend D8's math. Verdict: the hero-number template
      itself was the wrong shape — verified against `RunStatusBreakdown.tsx` and
      `CaseResultsPanel.tsx` as this app's real aggregate precedent, confirming
      reusing it for a single run's own rate was a category error, not a wording
      gap. Also newly identified: the headline lived inside each Stability view's
      own panel, appearing to reset per view even though "latest closed run"
      doesn't depend on the view. Proposed fix: remove the hero number, replace
      with a `PropertyRow`-based "Latest closed run"/"In progress" pair above the
      view toggle. Mock updated (same artifact, tab 4).
- [x] 14.2 User's follow-up: "I would like to see percentages... close to the chart
      points. Or maybe when the point is over." Looped Pepe again with this exact
      wording plus the project's own dataviz skill guidance (tooltip-by-default;
      selective direct labels only). Verdict: both — a real hover/focus tooltip on
      every point (replacing the native `title`) plus an always-visible label on
      the endpoint only, deliberately no crosshair (too few discrete points to
      justify one). Mock updated again; user approved with "good go".
- [x] 14.3 Wrote failing tests in `SuitePassRateTrend.test.tsx`: removed the 6
      headline-specific tests (headline text, run count, closed-vs-open selection,
      in-progress indicator, placeholder — all moved to `SuiteDetailPage.test.tsx`
      since the fact moved there); added tests for an accessible name per point
      (replacing the `title`-attribute test), a hover tooltip showing/hiding, a
      keyboard-focus tooltip showing/hiding on blur, an always-visible endpoint
      label, and no always-visible label on non-endpoint points. Confirmed RED (4
      failures: endpoint label, hover tooltip, focus tooltip, accessible name — 11
      pre-existing point-geometry/dash/color tests unaffected, confirming the
      failures were scoped to the new behavior only).
- [x] 14.4 Implemented in `SuitePassRateTrend.tsx`: removed `headlinePoint`/
      `openRunsAfterHeadline` and the hero-number markup entirely. Points became
      real `<button>` elements with `aria-label={detail}`, `onMouseEnter/Leave` +
      `onFocus/Blur` driving an `activeKey` state; a `role="tooltip"` div renders
      near the active point's coordinates when set. A separate always-visible
      `data-testid="suite-trend-endpoint-label"` span shows only the last point's
      rate. Added `pt-6` to the chart wrapper for label/tooltip breathing room
      above the SVG's own 0% line. All 15 tests green.
- [x] 14.5 Wrote failing tests in `SuiteDetailPage.test.tsx`: "Latest closed run"
      shown above the toggle and unchanged by switching views; an "In progress"
      row appears only with a trailing open run; no such row without one; a
      placeholder shown with no closed runs at all (plus the paired "In progress"
      row still present). Confirmed RED (3 failures — the new text didn't exist
      yet; 26 pre-existing tests unaffected).
- [x] 14.6 Implemented in `SuiteDetailPage.tsx`: `latestClosedRun`/
      `trailingOpenCount` derived once from `suiteRuns` (the full run list already
      fetched), independent of `stabilityView` — same D8 "most recent closed, or
      newer-open count past it" logic, lifted out of the chart component and up to
      the page. Rendered as two `PropertyRow`s (reusing the sidebar's own
      component) inside a `data-testid="suite-latest-closed-run"` wrapper, above
      the view-toggle `role="group"`. All 29 tests green; `tsc -b` clean; full web
      suite (96 files / 1212 tests) green.
- [x] 14.7 Rebuilt and reran the full `apps/web/e2e/ui-navigation.spec.ts` against
      the freshly rebuilt compose stack — first full E2E run since D10 shipped.
      Found and fixed three real things, not assumed: (1) my own new
      `getByText(/1 in progress/i)` assertion was wrong — the label ("In
      progress") and value ("1 run") are now two separate `PropertyRow` cells, not
      one combined string like the old badge text — split into two assertions.
      (2) The existing TD-99 scenario (written for D8, asserting the headline
      showed "100%" not "0%") needed rewriting for the removed headline; also
      updated its final assertion to confirm the endpoint label legitimately DOES
      show "0%" for the open point now — a deliberate, explained consequence
      (design.md D11), not a regression back to the original complaint. (3) A
      genuine, previously-unverified regression from D10 (not D11): TD-64
      ("Running a suite from its detail page") asserted the sidebar's "Never run"
      text disappears right after creating a run — true under the old "latest run
      regardless of status" semantic, false under D10's corrected "latest *closed*
      run" semantic, since the quick-run flow only creates an open run. This was
      never caught earlier because no full E2E run happened between D10 shipping
      and now (13.5's D10 verification was hand-browser-only). Fixed by asserting
      "Never run" correctly stays visible until the run is closed — matches D10's
      intent exactly. All 63 tests green (one separate, unrelated single-test
      failure on `test-execution.spec.ts` under full-suite parallelism, confirmed
      as the same pre-existing parallel-worker flake class documented earlier in
      this file — passed cleanly in isolation).
- [x] 14.8 Updated the `ui-navigation` delta spec: replaced the "headline"
      requirement text and its four scenarios with the "Latest closed run"/"In
      progress" property pairing (unaffected by view selection) and two new
      scenarios for the tooltip-on-hover-or-focus and endpoint-only-label
      behavior.
- [x] 14.9 Updated `docs/test-management.md`'s Stability paragraph: removed the
      headline-number description, added the Latest closed run/In progress
      property pairing and the per-point tooltip/endpoint-label behavior.
- [x] 14.10 Sample Project showcase: no seed-data change needed — the Regression
      suite's existing closed-history-plus-trailing-open-run scenario (seeded for
      D7) already demonstrates every part of D11 (Latest closed run property,
      In progress badge, endpoint label showing the open run's own rate,
      per-point tooltips) without modification. Confirmed live (see 14.7's manual
      verification below).
- [x] 14.11 Rebuilt and redeployed the compose stack; hand-verified live in the
      browser (both themes) against the Regression suite: "Latest closed run"
      property shows 75% unchanged across both Stability views; "In progress"
      shows "1 run" only in the scenario with a trailing open run; hovering each
      point reveals a styled tooltip (name/date/rate) that disappears on
      mouse-leave; Tab-focusing a point shows the same tooltip and it clears on
      blur; only the endpoint carries an always-visible percentage label, matching
      its own hover value. Found and fixed a real bug this way, not caught by
      any test: the tooltip and endpoint label were both horizontally centered on
      their point's x-coordinate — for the leftmost point (x=0%), half the
      tooltip (including its run name) rendered off-screen to the left,
      unreadable; zoomed into the actual pixels to confirm it wasn't just a
      transient render, then added `tooltipTransformX` (left-anchor near the left
      edge, right-anchor near the right edge, center in the middle) to both the
      tooltip and the endpoint label. Re-verified live: leftmost point's tooltip
      now fully on-screen with its run name intact; endpoint's tooltip/label
      right-anchored cleanly at the chart's right edge in both themes.

## 15. Stability chart y-axis percentage ticks; x-axis date range (D12)

- [x] 15.1 Looped Pepe (same thread) with the user's request ("Maybe we should
      have some legends in the axis") and instructions to evaluate rather than
      literally implement, given the hover/focus tooltip and endpoint label built
      last round. Verdict: y-axis yes (0%/50%/100%, zero text next to the
      gridlines since D7), x-axis no as literally asked — `xPercent()` spaces
      points evenly by index, not real elapsed time, so a date under every point
      would visually assert even time-spacing that isn't real (same mistake class
      as D11's hero-number-as-aggregate, relocated to the x-axis). Proposed a
      date-range pair (oldest/newest corners) instead, flagging true
      date-proportional spacing as a separate, real follow-up. Mock updated (tab
      4); user approved with "yes".
- [x] 15.2 Wrote failing tests in `SuitePassRateTrend.test.tsx`: three y-axis
      testids (`suite-trend-axis-y-100/50/0`) with the right text; two x-axis
      testids (`suite-trend-axis-x-start/end`) matching the oldest/newest point's
      formatted date; no x-axis range labels for a single-point chart (no real
      range to show). Confirmed RED (2 failures — the testids didn't exist yet;
      16 pre-existing tests unaffected).
- [x] 15.3 Implemented in `SuitePassRateTrend.tsx`. Real layout problem found
      mid-implementation, not assumed away: absolutely positioned children measure
      against their containing block's *padding box* regardless of that block's
      own CSS padding — so adding `pl-8`/`pb-5` directly to the existing chart
      wrapper had no effect (the SVG's `inset-0` and the new axis labels'
      `left:0` would have measured from the same unpadded edges and overlapped,
      not sat beside each other). Fixed by restructuring into an outer box with
      fixed-pixel margins reserved structurally, and a nested absolutely-positioned
      "plot area" div (inset from those margins) that now contains every
      pre-existing percentage-based child (SVG, points, tooltip, endpoint label)
      unchanged — their own 0-100% coordinate math needed no changes, only their
      containing block moved. All 18 tests green (one pre-existing test —
      "does not show an always-visible label on non-endpoint points" — updated to
      drop its own "50%" assertion, since that now legitimately collides with the
      new, correct y-axis "50%" tick; scoped to "75%" instead, still proving the
      real thing it was written to prove).
- [x] 15.4 `tsc -b` clean; full web suite (96 files / 1215 tests) green; `make
      lint` 0 issues. Rebuilt and redeployed the compose stack; hand-verified live
      (both themes) against the Regression suite: y-axis ticks and x-axis date
      range render correctly, small and muted, no overlap with the "Only closed
      runs…" caption below; hovering a point still shows its tooltip correctly
      positioned above the axis labels; full `ui-navigation.spec.ts` E2E suite
      re-run clean, 63/63.
- [x] 15.5 Updated OpenSpec artifacts (proposal.md, design.md D12, the
      `ui-navigation` delta spec's two new axis scenarios) and
      `docs/test-management.md`'s Stability paragraph. No Sample Project seed-data
      change needed — the existing Regression suite scenario already showcases
      both axes without modification.
