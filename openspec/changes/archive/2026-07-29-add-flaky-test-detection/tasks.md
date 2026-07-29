## 1. Backend: per-case flakiness query — TDD

- [x] 1.1 Wrote failing store-layer tests (`apps/api/internal/store/flaky_test.go`,
  mirroring `TestSuiteTrendListsClosedRunsOldestFirst`/`TestSuiteTrendEmptyForNoClosedRuns`):
  a case with mixed pass/failed(or blocked) executions on its current version is
  reported flaky with the `min(pass,failedOrBlocked)/(pass+failedOrBlocked)` rate; an
  all-pass or never-executed current version is not flaky; executions on a *previous*
  version don't count; `pending`/`skipped`/`retest` executions are excluded from the
  rate's denominator.
- [x] 1.2 Implemented `CaseRepo.FlakyCases(ctx, projectID string) ([]domain.FlakyCase, error)`
  (`apps/api/internal/store/flaky.go`, one SQL statement grouped by case, no per-case
  loop) plus the `domain.FlakyCase` struct (case key, title, current version, rate) —
  no folder path field, since the Library already has the full case list loaded
  client-side and can derive it the same way cross-project search already does.
- [x] 1.3 Wrote a failing test for the empty case (`TestFlakyCasesEmptyForNoFlakyCases`),
  then confirmed it passes.

## 2. Backend: project-scoped query API — TDD

- [x] 2.1 Wrote a failing service-layer test (`TestFlakyCasesResolvesFromProjectID`,
  mirroring `TestSuiteTrendResolvesFromSuiteID`) for `Service.FlakyCases(ctx, projectID)`.
- [x] 2.2 Implemented `Service.FlakyCases`, delegating to the store query.
- [x] 2.3 Added `GET /projects/{projectKey}/flaky-cases` to `packages/shared/openapi.yaml`
  (gated on `PermRead`, mirroring `suiteTrend`'s route shape) and the `FlakyCase` schema;
  ran `make generate` and committed the regenerated types.
- [x] 2.4 Wired the handler in `apps/api/internal/server/handlers.go`
  (`h.requirePermission(domain.PermRead, projectIDParam)`), wrote a failing handler
  test (`TestScenario_FlakyCasesOverHTTP`), then implemented.

## 3. Frontend: Library filter and indicator — TDD

- [x] 3.1 Wrote failing tests (`apps/web/src/pages/FolderExplorerPage.test.tsx`): a
  "Flaky" filter select appears alongside the existing tag/priority/platform/test-type/
  automated filters; enabling it narrows the case list to currently-flaky cases;
  it composes with the priority filter (AND, not OR); a flaky case row shows a Flaky
  pill; a non-flaky case row doesn't.
- [x] 3.2 Implemented: fetch the project's flaky-case keys (via the new endpoint,
  alongside the existing folders/cases/suites fetch) once per Library load, a
  `flakyKeys: Set<string>` threaded into `CaseRow` alongside its existing
  priority/platform/test-type/automated data, plus a Flaky filter select and a
  `FlakyPill` (new, `Pills.tsx`, reuses the same destructive tint as critical
  priority — flakiness is a real execution-health signal, not a neutral
  classification like automated/manual).
- [x] 3.3 The filtered-to-zero state (Flaky enabled, no cases match) reuses the
  section's existing "offer to clear filters" empty state automatically — no new
  code needed, confirmed via the existing coverage of that path.

## 4. Verification

- [x] 4.1 Full unit suite green — Go all packages passing (81.1% internal coverage,
  ≥80% gate), web 669/669 (91.7%/82.5%/89.6%/94.47%, all ≥80%).
- [x] 4.2 `tsc -b` / `oxlint` clean; `go vet` clean; `golangci-lint run`: 0 issues.
- [x] 4.3 New e2e scenario in `apps/web/e2e/ui-navigation.spec.ts` ("Library with
  two-pane navigation", TD-77): a case made flaky via two runs (pass then fail, same
  pinned version — same fixture shape as TD-54's per-version badge test) shows its
  Flaky pill and is reachable via the Flaky filter; a non-flaky sibling case is
  excluded. Full spec file re-run: 49/49 passing, no regressions.
- [x] 4.4 Manual visual verification via browser automation against the rebuilt
  compose stack: the Sample Project's Checkout section shows two genuinely flaky
  seeded cases (`checkoutValid`, `checkoutExpired` — both independently qualify per
  seed.go's existing verdict history) with Flaky pills; the Flaky filter narrows
  correctly to just those two; "Clear filters" resets it.

## 5. Docs and Sample Project

- [x] 5.1 Updated `docs/test-management.md`'s Library section: added Flaky to the pill
  list and filter list, plus a new paragraph explaining the rate formula, the
  current-version-only scoping, the server-side query, and the relationship to the
  pre-existing per-version badge in `VersionDetailDialog`.
- [x] 5.2 No seed.go changes needed — the Sample Project already had a genuinely
  flaky case (`checkoutValid`: passes in two runs, fails in the Nightly run, same
  pinned version throughout, per seed.go's own pre-existing comment) from earlier
  work, and it turns out `checkoutExpired` independently qualifies too. Added
  `TestSeedContentSurfacesAFlakyCase` to `seed_test.go`, confirming the new
  `FlakyCases` query (not just the per-version executions signal
  `TestSeedContentHasAFlakyVersion` already covered) surfaces it — closing a real
  regression-coverage gap now that a second, independent path reads the same data.

## 6. Ship

- [x] 6.1 Synced delta specs into `openspec/specs/flaky-detection/spec.md` (new) and
  `openspec/specs/ui-navigation/spec.md` (extended "Library with two-pane navigation").
- [x] 6.2 Archive the change.
- [x] 6.3 GitHub issue #78 already exists and is on the project board — no duplicate;
  move its board status per the standing "commit+push+CI green → To Review" cadence.
- [x] 6.4 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
