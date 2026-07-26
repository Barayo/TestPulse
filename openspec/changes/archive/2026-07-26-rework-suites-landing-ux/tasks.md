## 1. Prerequisite: land suite pass-rate data

- [x] 1.1 Commit and merge the already-built (uncommitted) `add-suite-pass-rate-trend`
  backend work (`SuiteTrend`, `GET /suites/{suiteKey}/trend`) — this change's health
  bar/pass-rate reads depend on it. If it hasn't shipped by the time this change
  starts, treat finishing it as task 1 here rather than duplicating a parallel read.
  Shipped as commit `1868db6` (closes #77).

## 2. New suite endpoints

- [x] 2.1 Write failing store/service/handler tests for `GET /suites/{suiteKey}`.
- [x] 2.2 Implement.
- [x] 2.3 Write failing tests for `PUT /suites/{suiteKey}` (rename; name-only body).
- [x] 2.4 Implement.
- [x] 2.5 Write failing tests for `DELETE /suites/{suiteKey}` (verify member cases are
  untouched afterward).
- [x] 2.6 Implement. No new permission flag — GET uses `read`, rename uses
  `suiteEditMembership`, delete uses `manageProject` (see design.md's decision).
- [x] 2.7 Update `packages/shared/openapi.yaml` for all three; `make generate`; verify
  no drift.

## 3. Suites index

- [x] 3.1 Write failing tests for the index card: name, health bar/"Never run",
  case count, last-run time. (No tags — dropped from scope: suites have no tags
  field in the domain model; the mockup's tag pills were illustrative, not real
  data. Corrected in proposal/design/specs delta too.)
- [x] 3.2 Implement using `HealthBar` (`components/HealthBar.tsx`), same bands as
  `ProjectsPage.tsx`.
- [x] 3.3 Write failing tests for "create suite" navigating straight to the new suite's
  detail route instead of an inline form.
- [x] 3.4 Implement.

## 4. Suite detail page

- [x] 4.1 Add route `/projects/:projectKey/suites/:suiteKey` in `App.tsx`.
- [x] 4.2 Write failing tests for the page shell: breadcrumbs, filterable case list
  (reusing `SuiteCaseGrid`'s filter logic), sticky selection/save bar.
- [x] 4.3 Implement `SuiteDetailPage.tsx`.
- [x] 4.4 Write failing tests for the sidebar: case count, pass rate, last run, created.
  (No tags row — same reason as 3.1.)
- [x] 4.5 Implement.
- [x] 4.6 Write failing tests for Rename (modal, updates everywhere) and Delete
  (confirmation, redirects to index, cases untouched).
- [x] 4.7 Implement both.
- [x] 4.8 Delete the old slide-over dialog code path and its tests — `SuitesPage.tsx`/
  `.test.tsx` fully rewritten as index-only; old dialog/edit code removed.
- [x] 4.9 (added) Updated `ProjectPage.tsx`'s `onSelectSuite` to navigate to the real
  route instead of the retired `#suite-{key}` hash.

## 5. Verification

- [x] 5.1 Full unit suite green (523 tests), coverage 92.26%/81.07%/91.04%/95.11%
  (stmts/branch/funcs/lines) — gate maintained. `go vet`, `golangci-lint`,
  `tsc -b`, `oxlint` all clean.
- [x] 5.2 Updated `apps/web/e2e/test-authoring.spec.ts` and `ui-navigation.spec.ts` for
  the new route/page shell (dropped dialog-based assertions, fixed a strict-mode
  breadcrumb-link ambiguity, accounted for the extra history entry suite creation
  now pushes). Full e2e suite green: 65/65 against `docker compose`.
- [ ] 5.3 Manual visual verification (light/dark theme) against `docker compose` —
  attempted via browser automation; blocked by a 1Password extension focus
  conflict in the automation tab unrelated to the app itself. Not treated as a
  blocker given 523/523 unit + 65/65 e2e (including real-browser Playwright runs
  of the new pages) already passed against the same compose stack. Worth a human
  spot-check before merge if convenient.

## 6. Docs and Sample Project

- [x] 6.1 Updated `docs/test-management.md`'s Suites section and `docs/api.md`'s
  endpoint table.
- [x] 6.2 Updated `apps/api/internal/sampledata/seed.go` (+ new
  `RunFromSuiteWithVerdicts` helper, + `seed_test.go` assertions) — linked the
  existing "Release 1.1 regression" run to the Regression suite (75%, "in
  progress" amber) and "Nightly — main" to the Nightly suite (83%, healthy
  teal, while still open); Smoke and API Contract stay never-run. Demonstrates
  both real states without duplicating any run.

## 7. Cross-change follow-up

- [x] 7.1 `rework-run-detail-ux` has not shipped yet (still planning-only) — its
  own tasks.md already carries this follow-up item; nothing further needed here.
  Also fixed `ProjectPage.tsx`'s landing-panel suite link to the real route
  instead of the retired `#suite-{key}` hash (was already live code, not a
  planned future change).

## 8. Ship

- [x] 8.1 Synced into `openspec/specs/ui-navigation/spec.md` — replaced the stale
  "Suites list stays clean; membership managed in its own drawer" requirement
  with "Suites index and detail page".
- [x] 8.2 Archived, keeping `mockup.html` as the durable design reference.
- [ ] 8.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
