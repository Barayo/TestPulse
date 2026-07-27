## Why

As a QA engineer opening a project's Runs page to check what's already been run, when I click "Runs" in the project nav, I want to see the list of runs first — not a full case-creation form. Today `RunsPage.tsx` renders the "New run" case picker (a search box, filters, a section tree, a virtualized list — the full mechanics `rework-run-creation-ux` built) above the actual "Runs" list, so opening the page reads as "create a run" rather than "here are your runs." The user flagged this directly: "Why recent runs opens a new Test run instead of listing runs." A Pepe/Fable-5 design pass (mockup, this directory) confirmed the fix and also closed a related gap: creating a run gives no feedback afterward — no navigation, no confirmation, the page just silently reloads.

## What Changes

- `RunsPage.tsx` becomes list-primary: the "Runs" list renders first, with a "+ New run" button in the header (matching `SuitesPage.tsx`'s existing card-list-plus-header-button pattern) instead of the case-picker form rendering inline above the list.
- The full case-picker form moves to its own dedicated route, `/projects/{projectKey}/runs/new` — not a dialog or accordion, since the picker (search, 5 filters, section tree, virtualized list) is too much content for either.
- `SuiteDetailPage.tsx`'s existing "Customize selection" deep link (`handleCustomizeSelection`, currently navigates to `/projects/{projectKey}/runs` with seed router state) is repointed to the new `/runs/new` route — same seed-state handoff, new destination.
- Post-creation feedback, deliberately different per entry point:
  - From the dedicated `/runs/new` flow: on success, navigate straight to the new run's detail page (`/runs/{runKey}`) with a one-shot "Run created successfully" banner (router state, cleared on read — the same one-shot idiom already used for `seedFromSuiteKey`).
  - From `SuiteDetailPage`'s "Run suite" quick-run action: stay on the suite page (you're mid-review, may want to fire another run) and show an inline confirmation banner with a "View run →" link, instead of silently closing the dialog and reloading.
- A new lightweight, dependency-free inline banner component, reused by both entry points — the app has no toast/notification infrastructure today, and this is deliberately not the moment to add a third-party one for two call sites.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: "Run creation" — the form moves to its own route reached via a "+ New run" button rather than rendering inline above the runs list, and gains post-creation feedback (navigate + banner). "Suites index and detail page" — the quick-run action gains an inline confirmation banner instead of silently reloading.

## Impact

- `apps/web/src/pages/RunsPage.tsx` — reordered to list-primary; the case-picker form content moves to a new page.
- New `apps/web/src/pages/NewRunPage.tsx` (or equivalent route component) at `/projects/{projectKey}/runs/new`.
- `apps/web/src/pages/SuiteDetailPage.tsx` — `handleCustomizeSelection`'s destination, `handleQuickRun`'s post-creation behavior (banner instead of silent reload).
- `apps/web/src/pages/RunPage.tsx` — reads the one-shot "run created" router state and renders the banner.
- New shared banner component (name TBD in design.md), no new dependency.
- Router config (wherever routes are declared, likely `App.tsx`) — new `/projects/{projectKey}/runs/new` route.
- `docs/test-management.md` — update the Runs page description.
- `apps/web/e2e/ui-navigation.spec.ts` — new scenarios for the list-primary layout, the dedicated route, and both post-creation feedback paths.
