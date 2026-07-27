## 1. Extract the case-picker form to its own route

- [x] 1.1 Wrote failing tests (`NewRunPage.test.tsx`, moved from `RunsPage
  .test.tsx`): the case-picker form (name, suite selector, `CasePicker`,
  "Create run"), reusing the exact logic that lived in `RunsPage.tsx`
  (`toGridCase`, `seedSelectionFromSuite`, `handleCreateRun`, the
  `seedFromSuiteKey` one-shot router-state handoff). Added one genuinely
  new test alongside the moved ones: creating a run navigates to
  `/runs/{runKey}` with a `justCreated` state flag — passed immediately,
  confirming the extraction preserved behavior exactly.
- [x] 1.2 Implemented `NewRunPage.tsx`: form state/handlers moved verbatim,
  plus `handleCreateRun` now navigates to the new run's detail page with
  `{ justCreated: true }` router state on success (task 3's requirement,
  built in here since it's the same handler).
- [x] 1.3 Added the `/projects/:projectKey/runs/new` route in `App.tsx`.
- [x] 1.4 Wrote failing tests: `RunsPage.tsx` renders the "Runs" list as
  primary content with a "+ New run" header button (matching
  `SuitesPage.tsx`'s pattern), no case-picker form inline.
- [x] 1.5 Implemented: stripped the form out of `RunsPage.tsx`, added the
  "+ New run" button (`Button asChild` wrapping a `Link`) to
  `/projects/{projectKey}/runs/new`.

## 2. Repoint the suite deep link

- [x] 2.1 Wrote a failing test: `SuiteDetailPage.tsx`'s "Customize selection"
  navigates to `/projects/{projectKey}/runs/new` (not `/runs`) with the same
  `{ seedFromSuiteKey, seedName }` state.
- [x] 2.2 Implemented: updated `handleCustomizeSelection`'s destination.

## 3. Post-creation feedback

- [x] 3.1 Wrote failing tests for a new shared `ConfirmBanner` component
  (message, optional link, dismissable, auto-dismiss timer via fake timers,
  no new dependency).
- [x] 3.2 Implemented `ConfirmBanner.tsx`.
- [x] 3.3 Wrote failing tests: creating a run from the dedicated `/runs/new`
  route navigates to `/runs/{runKey}` with `{ justCreated: true }` router
  state (already covered in `NewRunPage.test.tsx`, task 1.1); `RunPage.tsx`
  reads it and shows "Run created successfully" (doesn't show on a normal
  visit).
- [x] 3.4 Implemented: `RunPage.tsx` reads `location.state.justCreated` into
  local state on mount, clears the router state via `navigate(pathname,
  {replace:true, state:null})` — same one-shot idiom as the old
  `seedFromSuiteKey` — and renders `ConfirmBanner` while the local flag is
  set.
- [x] 3.5 Wrote a failing test: `SuiteDetailPage.tsx`'s quick-run
  (`handleQuickRun`) shows an inline confirmation banner with a "View run →"
  link after creating a run, instead of just closing the dialog silently.
- [x] 3.6 Implemented: `handleQuickRun` captures the created run's key,
  renders `ConfirmBanner` with a link to it.

## 4. Verification

- [x] 4.1 Full unit suite green (615 tests), `tsc -b` clean, `oxlint` clean
  (pre-existing warnings only), `vite build` succeeds.
- [x] 4.2 New/updated e2e scenarios: TD-70 (list-primary layout, "+ New run"
  → dedicated route), TD-71 (run-created navigation + banner). Updated
  pre-existing scenarios across `ui-navigation.spec.ts` and
  `test-execution.spec.ts` that assumed the old form-on-`/runs` layout (9
  `goto` call sites moved to `/runs/new`, several post-creation assertions
  updated to reflect auto-navigation to the run detail page instead of a
  link back on the list). Found and fixed 2 real test bugs while doing
  this: (1) `waitForURL(/\/runs\/.+$/)` also matches `/runs/new` itself
  (`new` satisfies `.+`), resolving before the actual post-creation
  navigation happened — fixed to `/\/runs\/(?!new$)[^/]+$/` across all 7
  call sites; (2) "Breadcrumb on a run page" navigated via "Go to Runs"
  (the list) and expected the form to be right there — fixed to click
  "+ New run" first. Full suite: 71/72 initially with 3 failures traced to
  `fullyParallel` resource contention on this local machine (confirmed by
  re-running each in isolation — all pass in under 2s); the remaining
  "Switching project via keyboard" flake is the same pre-existing one
  documented during `rework-library-ux`.
- [x] 4.3 Manual verification: reproduced the exact `/runs/new` flow live in
  a real browser (fresh tab, fresh API-created project) — form, filters,
  section tree, and disabled "Create run" all render correctly.

## 5. Docs and Sample Project

- [x] 5.1 Updated `docs/test-management.md`'s Runs section: list-primary
  layout + dedicated `/runs/new` route, the post-creation navigate+banner
  behavior, and the suite quick-run inline banner.
- [x] 5.2 Sample Project showcase: evaluated, confirmed exempt. Both new
  banners are action-triggered, one-shot confirmations (shown only
  immediately after a user creates a run) — there's no persistent seed-data
  state that would demonstrate them; anyone evaluating the Sample Project
  sees the real behavior the moment they create a run themselves, same as
  a real user would. No `seed.go` changes needed.

## 6. Ship

- [x] 6.1 Synced delta specs into `openspec/specs/ui-navigation/spec.md`
  (applied manually — both requirement blocks replaced with the delta's
  updated content).
- [x] 6.2 Archived the change, keeping `mockup.html` (copied from the
  scratchpad location) as the durable design reference.
- [ ] 6.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait
  for CI green.
