## 1. Prerequisite: land suite pass-rate data

- [ ] 1.1 Commit and merge the already-built (uncommitted) `add-suite-pass-rate-trend`
  backend work (`SuiteTrend`, `GET /suites/{suiteKey}/trend`) — this change's health
  bar/pass-rate reads depend on it. If it hasn't shipped by the time this change
  starts, treat finishing it as task 1 here rather than duplicating a parallel read.

## 2. New suite endpoints

- [ ] 2.1 Write failing store/service/handler tests for `GET /suites/{suiteKey}`.
- [ ] 2.2 Implement.
- [ ] 2.3 Write failing tests for `PUT /suites/{suiteKey}` (rename; name-only body).
- [ ] 2.4 Implement.
- [ ] 2.5 Write failing tests for `DELETE /suites/{suiteKey}` (verify member cases are
  untouched afterward).
- [ ] 2.6 Implement.
- [ ] 2.7 Update `packages/shared/openapi.yaml` for all three; `make generate`; verify
  no drift.

## 3. Suites index

- [ ] 3.1 Write failing tests for the index card: name, tags, health bar/"Never run",
  case count, last-run time.
- [ ] 3.2 Implement using `HealthBar`/`healthLabel` (`components/HealthBar.tsx`), same
  bands as `ProjectsPage.tsx`.
- [ ] 3.3 Write failing tests for "create suite" navigating straight to the new suite's
  detail route instead of an inline form.
- [ ] 3.4 Implement.

## 4. Suite detail page

- [ ] 4.1 Add route `/projects/:projectKey/suites/:suiteKey` in `App.tsx`.
- [ ] 4.2 Write failing tests for the page shell: breadcrumbs, filterable case list
  (reusing `SuiteCaseGrid`'s filter logic), sticky selection/save bar.
- [ ] 4.3 Implement `SuiteDetailPage.tsx`.
- [ ] 4.4 Write failing tests for the sidebar: case count, pass rate, last run, created,
  tags.
- [ ] 4.5 Implement.
- [ ] 4.6 Write failing tests for Rename (modal, updates everywhere) and Delete
  (confirmation, redirects to index, cases untouched).
- [ ] 4.7 Implement both.
- [ ] 4.8 Delete the old slide-over dialog code path and its tests.

## 5. Verification

- [ ] 5.1 Full unit suite green, coverage gate maintained.
- [ ] 5.2 Update `apps/web/e2e/test-authoring.spec.ts` for the new route/page shell;
  full e2e suite green.
- [ ] 5.3 Manual verification against `docker compose` with real seeded data (light +
  dark theme), matching `mockup.html`'s interactions.

## 6. Docs and Sample Project

- [ ] 6.1 Update `docs/test-management.md`'s Suites section.
- [ ] 6.2 Update `apps/api/internal/sampledata/seed.go` (+ test) so the Sample Project
  has a healthy suite, an at-risk suite, and a never-run suite.

## 7. Cross-change follow-up

- [ ] 7.1 If `rework-run-detail-ux` has already shipped its suite-link deep-link
  (`#suite-{key}` hash), update it to this change's real route
  (`/projects/{projectKey}/suites/{suiteKey}`) instead — flag in that change too.

## 8. Ship

- [ ] 8.1 Sync delta specs into `openspec/specs/ui-navigation/spec.md`
  (`/opsx:sync-specs rework-suites-landing-ux`).
- [ ] 8.2 Archive the change, keeping `mockup.html` as the durable design reference.
- [ ] 8.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
