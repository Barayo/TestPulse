## 1. Backend: project-wide status summary

- [x] 1.1 Write a failing store test for `RunRepo.ProjectStatusSummary`
  (or similar) asserting it aggregates `current_status` counts across
  every run (open and closed) in a project, and returns a zeroed summary
  for a project with no runs.
- [x] 1.2 Add `domain.ProjectStatusSummary` (mirrors `RunSummary` minus
  `RunID`) and implement the store method in `apps/api/internal/store`,
  joining `test_run_items` through `test_runs` on `project_id`, following
  `RunRepo.Summary`'s exact `GROUP BY current_status` shape; make the
  test pass.
- [x] 1.3 Write a failing service test for
  `Service.ProjectStatusSummary`, then wire it as a thin passthrough
  (mirrors `Service.FlakyCases`).
- [x] 1.4 Add `GET /api/v1/projects/{projectKey}/runs/status-summary`
  (authenticated, `requirePermission(PermRead, ...)`) and
  `GET /api/v1/public/projects/{projectKey}/runs/status-summary`
  (`requirePublicProject`) in `handlers.go`/`public_handlers.go`,
  mirroring `flaky-cases`'s dual-route pattern exactly; write a failing
  `TestScenario_...OverHTTP` test first for each, per this repo's
  existing `api_more_test.go` convention.
- [x] 1.5 Add the endpoint pair + `ProjectStatusSummary` schema to
  `packages/shared/openapi.yaml`; run `make generate` and confirm no
  drift.

## 2. Frontend: RunStatusBreakdown empty-message prop

- [x] 2.1 Write a failing test asserting `RunStatusBreakdown` renders a
  caller-supplied `emptyMessage` when given one, and its existing
  hardcoded copy when not (backward compatible).
- [x] 2.2 Add the optional `emptyMessage` prop; make the test pass.

## 3. Frontend: Reports page

- [x] 3.1 Write a failing test for a new `ProjectReportsPage` asserting
  it renders the project-wide status breakdown (fed by the new
  status-summary endpoint, member and public branches), a flaky cases
  list (fed by the existing `flaky-cases` endpoint, sorted descending by
  rate), and a link into the run comparison picker.
- [x] 3.2 Implement `ProjectReportsPage.tsx` and its route
  (`/projects/:projectKey/reports`) in `App.tsx`; make the test pass.
- [x] 3.3 Write a failing test asserting each flaky-cases list row shows
  title, case key, a `v{n}` badge, `FlakyPill`, and rate, and links to
  that case's detail page. (Covered directly by 3.1's tests — row shape
  was implemented and verified in the same pass.)
- [x] 3.4 Implement the flaky-cases row rendering; make the test pass.
- [x] 3.5 Write a failing test asserting an empty project (no runs) shows
  project-scoped empty-state copy on the Reports page, not run-scoped
  copy.
- [x] 3.6 Pass the project-scoped `emptyMessage` into
  `RunStatusBreakdown` on this page; make the test pass.

## 4. Frontend: landing page Reports panel

- [x] 4.1 Write a failing test asserting `ProjectPage.tsx` renders a
  fourth, full-width Reports panel below Folders/Suites/Runs, showing
  the project-wide pass rate and flaky-case count, with an "Open
  Reports" link to `/projects/{projectKey}/reports`.
- [x] 4.2 Implement the panel in `ProjectLandingPanels.tsx`/
  `ProjectPage.tsx`. Reuses `PanelShell`'s header chrome (icon + bold
  title + border-b, action link top-right) but not its `isEmpty`/
  `children` list body, which assumes `<li>` rows and doesn't fit a
  summary panel — built as a standalone `ReportsPanel` component with
  matching visual markup instead; new `lib/useProjectReportsTeaser.ts`
  hook mirrors `useProjectLanding`'s dual-mode call signature. Make the
  test pass.

## 5. E2E coverage

- [x] 5.1 Add e2e scenarios under a new "Requirement: Project Reports
  page" describe block (and the modified "Project landing shows
  top-level structure only" scenarios) in the appropriate `e2e/*.spec.ts`
  file: landing panel appears and links through; Reports page shows all
  three sections; a flaky case row navigates to its case page. (Landing
  panel scenario added to `ui-navigation.spec.ts`; full assembly scenario
  — status breakdown, flaky list linking to the case, compare-runs entry
  — added to `test-execution.spec.ts`, which already has the run-creation
  helpers needed. Both files' full suites re-verified: 87/87 pass.)

## 6. Docs

- [x] 6.1 Update `docs/` (test-management.md or a dedicated reporting
  page, per existing doc structure) to describe the Reports page, the
  landing panel, and the new endpoint pair in the API reference.
  (`docs/test-management.md`'s landing-page section extended;
  `docs/api.md` gets the new `runs/status-summary` row plus the
  authenticated `flaky-cases` row, which was undocumented before this
  change — same pre-existing-gap pattern found and fixed during
  `add-case-result-history`.)

## 7. Sample Project showcase

- [x] 7.1 Verify the Sample Project has enough flaky cases and
  run-status variety for the Reports page to be non-trivial (status
  breakdown shows multiple statuses, flaky list has at least one entry);
  adjust `seed.go` and `seed_test.go` if the current seed doesn't already
  satisfy this. Confirmed satisfied as-is via a new
  `TestSeedContentShowcasesProjectWideStatusSummary` (passed on first
  run): `checkoutValid` and `login` are already-established flaky cases
  (`TestSeedContentSurfacesAFlakyCase` already covered the flaky-list
  side), and the many seeded runs already yield ≥3 distinct statuses
  including pending. No `seed.go` change needed.

## 8. Verification

- [x] 8.1 `make coverage-api` and `make coverage-web` stay ≥ 80% all
  metrics. (`coverage-api`: 81.2%; `coverage-web`: 92.3%/84.5%/90.0%/94.7%
  statements/branches/functions/lines.)
- [x] 8.2 Manually verify in a locally deployed build (docker compose):
  landing panel renders correctly, Reports page assembles all three
  sections with real Sample Project data, flaky case rows link
  correctly, run comparison entry point works. Verified live: landing
  panel shows "76% pass · 63 items" + "6 flaky cases to watch" below the
  three-panel grid; Reports page shows the full status legend (Pass 48,
  Failed 9, Blocked 1, Skipped 4, Pending 1) and 6 flaky cases sorted
  50/50/20/20/20/18%; clicking a flaky row lands on its case page;
  "Compare runs" lands on the run comparison picker.
