## Why

The current Suites list (shipped by `rework-suite-membership-ux`) fixed the broken
creation flow but is still a bare name+count list with no dedicated detail page — every
other entity in the app (cases, runs) gets a full page with breadcrumbs and a properties
sidebar; suites don't. This was flagged directly by the user ("I click on Suites and I
enter into 'New Suite'... I think the whole suite needs rework") and independently by two
already-filed backlog issues: #16 ("Suite as a full-fledged view: browse/filter all
cases, not just search-by-name") and #50 ("Suites and Runs lists: add health indicators").
A Pepe/Fable-5 design pass validated via an interactive mockup (approved by the user) is
the basis for this change.

## What Changes

- The Suites index becomes a rich card list: each suite shows its name, a
  pass-rate health bar (teal/amber/coral bands, matching `HealthBar`/`ProgressBar`),
  case count, and last-run time — "Never run" for a suite with no runs yet, not a
  fake 0%. Matches the richness `ProjectsPage.tsx` already has.
  - **BREAKING** (internal, no API change): selecting a suite navigates to a new
    dedicated route instead of opening an inline slide-over dialog.
- A new dedicated Suite detail page (`/projects/{projectKey}/suites/{suiteKey}`),
  matching the established full-entity-page pattern (Breadcrumbs + main content +
  a 300px properties sidebar) already used by case detail and run item detail:
  - Main content: the same filter-safe checkbox case list as today's inline grid
    (tag/priority/platform/test-type filters, "Showing X of Y cases"), plus a
    sticky selection-count/Save-changes bar.
  - Sidebar: case count, pass rate, last run, created date, and
    Rename/Delete actions.
- The slide-over edit dialog and the combined create-form-with-grid on the index
  page are removed — creation opens straight into the new empty suite's detail
  page ("add cases below and save when ready") instead of a form embedded in the
  index.
- Case *membership* API is unchanged — this is a navigation and visual rework of
  the existing `SuiteCaseGrid`-based editing flow, given its own page instead of
  a dialog. New backend surface is needed for the page shell itself: fetching a
  single suite by key, renaming it, and deleting it — none of these exist today
  (verified: only list/create/add-case/remove-case/trend endpoints exist).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: replaces "Suites list stays clean; membership managed in its
  own drawer" (already stale — that drawer was removed by
  `rework-suite-membership-ux`) with a requirement describing the new rich index
  + dedicated detail page.

## Impact

- `apps/api/internal/server/handlers.go`, `service/service.go`, `store/suites.go`,
  `packages/shared/openapi.yaml` — three new endpoints: `GET /suites/{suiteKey}`
  (single suite), `PUT /suites/{suiteKey}` (rename), `DELETE /suites/{suiteKey}`
  (delete). None exist today.
- `apps/web/src/pages/SuitesPage.tsx` — split into an index view and a new
  `SuiteDetailPage.tsx`; both consume the existing `SuiteCaseGrid` filtering
  logic, now inside a full page rather than a card/dialog.
- `apps/web/src/App.tsx` — new route `/projects/:projectKey/suites/:suiteKey`.
- New `SuiteHealthBar`-equivalent reuse of `HealthBar`/`ProgressBar`/`healthLabel`
  (`components/HealthBar.tsx`) on the suite index cards.
- Suite pass-rate data: the index card and detail sidebar need a suite-level pass
  rate — check whether this already exists anywhere in the API (it does not,
  per this session's earlier `add-suite-pass-rate-trend` groundwork, still
  uncommitted) or whether this change needs its own minimal "current pass rate"
  read, scoped smaller than the full trend endpoint; resolve in design.md.
- `docs/test-management.md` — rewrite the "Suites" section for the new pages.
- `apps/api/internal/sampledata/seed.go` — verify/extend so the Sample Project
  demonstrates a suite with a healthy pass rate, one at-risk, and one never-run.
- `apps/web/e2e/test-authoring.spec.ts` — update suite navigation/editing
  scenarios for the new route and page shell.
