## 1. Contract

- [x] 1.1 Added `RunComparison`/`RunComparisonItem` schemas to
      `packages/shared/openapi.yaml` (reusing `SuiteTrendPoint` for `olderRun`/`newerRun`
      rather than duplicating its shape), and two new paths:
      `GET /api/v1/runs/{runKey}/compare/{otherRunKey}` and
      `GET /api/v1/public/runs/{runKey}/compare/{otherRunKey}`.
- [x] 1.2 `make generate` succeeded; `packages/shared/src/api.ts` regenerated with
      `compareRuns`/`comparePublicRuns` operations and the `RunComparison` type.

## 2. Backend: comparison computation (TDD)

- [x] 2.1 Wrote failing service-level tests in `run_comparison_test.go`: categorization
      (regressed/improved/unchanged/added/removed) in one pass, older/newer order
      independence, rejection on an open run, rejection across projects. Confirmed RED
      via `go vet` (`s.CompareRuns undefined`).
- [x] 2.2 Implemented `Service.CompareRuns` in `service.go` — fetches both runs, resolves
      older/newer by `CreatedAt`, joins items by `CaseKey`, categorizes via the
      pass/failed/blocked transition rules. Added domain types `RunComparison`/
      `RunComparisonItem` (reusing `SuiteTrendPoint` for the two run summaries, matching
      the openapi schema's reuse).
- [x] 2.3 All 4 tests pass (`go test ./internal/service/... -run TestCompareRuns`).
- [x] 2.4 Wrote failing HTTP-level tests in `run_comparison_api_test.go`: full success
      shape + order-independence, 400 on an open-run attempt, 404 on an unknown run key,
      and a public-project success case. Confirmed RED (SPA fallback / stale 404s before
      the route existed).
- [x] 2.5 Wired `compareRuns` handler + `/runs/{runKey}/compare/{otherRunKey}` route
      (authenticated, `handlers.go`) and its public twin (`public_handlers.go`), both
      resolving `otherRunKey` via a second `resolveKey` middleware layer.
- [x] 2.6 All 4 new HTTP tests pass. Full affected suites clean:
      `go test ./internal/service/... ./internal/server/... ./internal/domain/...`.

## 3. Frontend: comparison page (TDD)

- [x] 3.1 Wrote failing tests in `RunComparePage.test.tsx`: both charts render
      older-first, all five diff sections render, Unchanged starts collapsed and expands
      on click, Regressed row shows the old→new `StatusBadge` transition. Confirmed RED
      (module didn't exist).
- [x] 3.2 Implemented `apps/web/src/pages/RunComparePage.tsx`: `RunHeaderCard` (reusing
      `RunStatusBreakdown` unmodified) + arrow chip, `TransitionSection` for Regressed/
      Improved (icon + destructive/primary tint, `opacity-55` old badge → new badge per
      `ContentDiffView`'s transition idiom), collapsible Unchanged
      (`ChevronRightIcon` rotate), Added/Removed two-column grid (plain vs.
      `line-through` per `ContentDiffView`'s vocabulary). Scope trim, noted here rather
      than silently: header cards skip the per-run suite/status meta line from Pepe's
      mock (would need an extra per-run fetch since `SuiteTrendPoint` doesn't carry
      `suiteKey`/run status) — run name + date + chart only.
- [x] 3.3 Wrote failing tests for both edge states in the same file. Found and fixed a
      real bug during 3.3: the two edge states weren't mutually exclusive — a
      near-zero-overlap comparison with zero regressions could also satisfy
      "fully unchanged" and incorrectly show the good-news void card. Fixed by making
      `fullyUnchanged` explicitly exclude `nearZeroOverlap`.
- [x] 3.4 Implemented both edge states (see 3.3's fix).
- [x] 3.5 All 6 tests pass; `tsc -b` clean.

## 4. Frontend: entry points (TDD)

- [x] 4.1 Wrote 3 failing tests in `RunPage.test.tsx` (extended `mockRunAPI` with a
      trend override): link shown + correct href when a prior closed run exists; absent
      when no prior run; absent when the run has no suite. Confirmed RED (1 of 3 failed
      as expected — the other two passed trivially since the link didn't exist yet).
- [x] 4.2 Implemented — new effect fetches `GET /suites/{suiteKey}/trend` (dual-mode,
      matching the existing suite-fetch effect), finds this run's own index in the
      already-ordered trend points, sets `priorRunKey` to the entry just before it. Link
      renders next to the existing "From suite"/"Created" meta line. All 86 RunPage
      tests pass.
- [x] 4.3 Wrote 2 failing tests in `RunComparePickerPage.test.tsx`: only closed runs
      listed in both selects; submit navigates to the comparison route. Confirmed RED
      (module didn't exist).
- [x] 4.4 Implemented `RunComparePickerPage.tsx` — project-scoped (`useProjectReadAccess`,
      dual-mode fetch matching `RunsPage.tsx`), two `<select>`s filtered to
      `status === 'closed'`, "Compare" button navigates via `useNavigate`. Both tests pass.
- [x] 4.5 Added both routes to `App.tsx`'s `PROJECT_CONTENT_ROUTES`
      (`/runs/compare/:runKeyA/:runKeyB` and `/projects/:projectKey/runs/compare`,
      anonymous-capable like every other run route). `tsc -b` clean.

## 5. E2E coverage

- [x] 5.1 Added 4 scenarios to `ui-navigation.spec.ts` under a new "Requirement: Run
      comparison" describe block, matching the new spec scenarios. Found and fixed two
      real bugs while getting these green against the local compose stack (not just
      written and assumed):
      1. **Backend**: `RunComparison`'s empty categories (`improved`/`unchanged`/`added`/
         `removed`) marshaled as JSON `null` (Go nil-slice default) instead of `[]`,
         crashing the frontend's `.length` calls. Fixed in `service.go` by initializing
         each field to a non-nil empty slice. Verified red→green with a dedicated
         regression test (`TestScenario_CompareRunsEmptyCategoriesAreArraysNotNull`) —
         confirmed it actually fails without the fix before restoring it.
      2. **Test helper**: `createTwoClosedRunsWithRegression` navigated away immediately
         after clicking "Close run" without waiting for the request to complete — the
         same race class already found and fixed earlier this session for verdict-
         recording buttons. Fixed by waiting for the button to flip to "Reopen" (the
         real completion signal) before navigating.
      Full `ui-navigation.spec.ts` file: 56/56 pass.

## 6. Sample Project showcase

- [x] 6.1 Added a second closed run of the existing suite-linked `Regression`
      suite, `"Release 1.1.1 hotfix verification"`, right after `"Release 1.1
      regression"` in `seed.go`. Relative to the first run: "Login with valid
      credentials" regresses (pass → failed) and "Reset password" recovers
      (failed → pass); the other 6 cases hold steady — giving all five diff
      categories (regressed/improved/unchanged, plus added/removed once
      cross-checked against other suites) real content. Inserted before the
      Nightly and final "Release 1.2" runs, so it doesn't disturb
      `TestSeedContentEndsOnAHealthyRun`'s "last-created run drives project
      health" invariant. Added `TestSeedContentHasARunComparisonShowcase` in
      `seed_test.go`, which calls the real `Service.CompareRuns` against the
      two seeded runs and asserts all of Regressed/Improved/Unchanged are
      non-empty. Full `internal/sampledata` suite passes (verified via
      `go test ./internal/sampledata/...` against the local test DB).

## 7. Documentation

- [x] 7.1 Added a "Comparing runs" section to `docs/test-management.md` (after the
      existing "Run summary" section): both entry points, the unnested
      `/runs/compare/{olderRunKey}/{newerRunKey}` route and why it's unnested, the
      closed-run/same-project preconditions, the five diff categories, and both edge
      states (near-zero-overlap notice, fully-unchanged void state).

## 8. Final verification

- [x] 8.1 All three pass: `make lint` (0 Go issues; web oxlint warnings are all
      pre-existing, unrelated to this change), `make coverage-api` (81.1%,
      minimum 80%), `make coverage-web` (statements 92.27%, branches 84.62%,
      functions 89.61%, lines 94.71%, all ≥ 80%).
- [x] 8.2 Rebuilt (`make compose-up`) and redeployed with a fresh DB volume (`docker
      compose down -v` first — the running stack had a stale volume seeded before
      6.1's seed.go change, so the new hotfix run wasn't showing up until the volume
      was recreated). Verified by hand in a real browser against the Sample Project:
      "Compare to previous run" on the hotfix run's page → `/runs/compare/SP-R3/SP-R4`
      with the correct diff (1 regressed, 1 improved, 6 unchanged, 0 added/removed);
      the explicit picker at `/projects/SP/runs/compare` lists only closed runs and
      navigates to the same comparison correctly; Unchanged collapses/expands; dark
      mode renders cleanly (toggled via `testpulse.themeOverride` in localStorage);
      the fully-unchanged void-card edge state confirmed live against a real seeded
      pair (Release 1.0 sign-off vs. the imported run — "No regressions or
      improvements"). The near-zero-overlap edge state has no naturally-occurring
      seeded pair under the 20% threshold and stays covered by
      `RunComparePage.test.tsx`'s dedicated unit test rather than live seed data.
