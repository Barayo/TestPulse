## 1. Prerequisite: land suite pass-rate data

- [x] 1.1 Already landed (`rework-suites-landing-ux`, shipped earlier this session):
  `domain.Suite.PassRate`/`LastRunAt`, batched in `SuiteRepo.List`. Reused directly —
  `LandingSuite` gained a `passRate` field sourced from the existing `/suites` response,
  no second read.

## 2. Summary strip

- [x] 2.1 Wrote failing tests for the three-cell layout: health ring + status label,
  suite/case count tiles, last-run preview (time, run name, pass rate).
- [x] 2.2 Implemented: new `HealthRing` component (`HealthBar.tsx`, conic-gradient donut)
  + a 3-cell flex layout in `ProjectPage.tsx`, reusing `StatusPill` and the most recent
  `landing.runs[0]` entry for the last-run preview's name/pass rate (`summary.lastRunAt`
  for the time) — no new backend field needed.
- [x] 2.3 Wrote a failing test for the no-runs-yet state ("No runs yet" instead of a
  pass rate/last-run time) — already covered by `StatusPill`'s existing null handling.
- [x] 2.4 Implemented (no change needed beyond 2.2 — `StatusPill`'s null branch already
  renders "No runs yet").

## 3. Library panel

- [x] 3.1 Wrote failing tests for the magnitude bar (relative to the panel's largest
  section's case count) and the empty-section italic/no-bar treatment.
- [x] 3.2 Implemented: `useProjectLanding.ts`'s `LandingFolder` gained `subsectionCount`
  and `children`; `ProjectLandingPanels.tsx`'s new `FolderRow` computes the bar width
  client-side against the panel's own max.
- [x] 3.3 Wrote failing tests for inline expand: a section with subsections previews its
  immediate children without navigating away, and a section with none still navigates
  directly on row click (design.md's explicit decision — a light preview, not a tree).
- [x] 3.4 Implemented.

## 4. Suites panel

- [x] 4.1 Wrote failing tests: colored pass-rate bar + percentage (reusing `HealthBar`,
  the same component `RunsPanel` already used) for a suite with a run, "Never run" for
  one with none.
- [x] 4.2 Implemented.

## 5. Recent runs panel

- [x] 5.1 Wrote failing tests for the two-line row treatment (run identity + pass/fail
  segment bar + fraction) and the featured wider-column/accent-border visual weight.
- [x] 5.2 Implemented: new `healthColorVar` export (`HealthBar.tsx`) for the segment
  bar's inline color, `PanelShell` gained a `featured` prop, `ProjectPage.tsx`'s panel
  grid changed from equal thirds to `1fr 1fr 1.28fr`.

## 5b. Spec correction found during implementation

- [x] The pre-written delta spec said "each panel's entire header SHALL be
  clickable" (carried over from `enrich-project-landing`) — but the actual
  approved `mockup.html` (the "visual/interaction source of truth" per
  design.md) only makes the small "See all ›" control clickable; the header
  itself has no click handler. Followed the mockup, not the stale spec text,
  and corrected the delta spec + removed its now-inaccurate scenario before
  syncing to `openspec/specs/ui-navigation/spec.md`.

## 6. Verification

- [x] 6.1 Full unit suite green (639 tests), coverage gate maintained
  (91.6%/82.1%/90.1%/94.6%, all ≥80%), `tsc -b`/`oxlint` clean. Full e2e suite:
  77/77 (the one failure on first run, "Summary counts by status," was the
  same pre-existing `fullyParallel` contention flake documented earlier this
  session — confirmed via an isolated `--workers=1` re-run, passing in 750ms).
- [x] 6.2 Manual verification against a freshly rebuilt `docker compose` stack with a
  fresh DB (Sample Project, light + dark theme): health ring, count tiles, last-run
  preview, magnitude bars, inline expand (Authentication → Two-Factor), suite health
  bars (Never run / 75% progress / 83% healthy), and the featured Recent runs panel all
  render correctly and match `mockup.html`.

## 7. Docs and Sample Project

- [x] 7.1 Updated `docs/test-management.md`'s "Projects" section with the dashboard's
  new summary strip and per-panel visual treatments.
- [x] 7.2 Found and fixed a real gap while verifying live: `seed.go`'s "Localization"
  section (already created empty, specifically as `rework-library-ux`'s empty-state
  showcase) was the project's *6th* top-level section — invisible on the landing panel,
  which caps at 5. Reordered it to 5th (swapped with Reporting API, which doesn't need
  panel visibility) so the empty-section treatment actually shows on the dashboard, not
  just the full Library page. Verified live: Regression (75%, progress) and Nightly
  (83%, healthy) already gave the Suites panel real band variety — no further seed
  changes needed.

## 8. Ship

- [x] 8.1 Sync delta specs into `openspec/specs/ui-navigation/spec.md`.
- [x] 8.2 Archive the change, keeping `mockup.html` as the durable design reference.
- [x] 8.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
