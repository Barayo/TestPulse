## 1. Prerequisite: land suite pass-rate data

- [ ] 1.1 Same dependency as `rework-suites-landing-ux` — commit/merge
  `add-suite-pass-rate-trend` before or alongside this change; don't build a second
  parallel current-pass-rate read.

## 2. Summary strip

- [ ] 2.1 Write failing tests for the three-cell layout: health ring + status label,
  suite/case count tiles, last-run preview (time, run name, pass rate).
- [ ] 2.2 Implement.
- [ ] 2.3 Write failing tests for the no-runs-yet state ("No runs yet" instead of a
  pass rate/last-run time).
- [ ] 2.4 Implement.

## 3. Library panel

- [ ] 3.1 Write failing tests for the magnitude bar (relative to the panel's largest
  section's case count).
- [ ] 3.2 Implement.
- [ ] 3.3 Write failing tests for inline expand: a section with subsections previews
  its immediate children without navigating away.
- [ ] 3.4 Implement.

## 4. Suites panel

- [ ] 4.1 Write failing tests: colored pass-rate bar + percentage for a suite with a
  closed run, "Never run" for a suite with none.
- [ ] 4.2 Implement.

## 5. Recent runs panel

- [ ] 5.1 Write failing tests for the two-line row treatment (run identity + pass/fail
  segment bar) and the wider-column/accent-border visual weight.
- [ ] 5.2 Implement.

## 6. Verification

- [ ] 6.1 Full unit suite green, coverage gate maintained.
- [ ] 6.2 Manual verification against `docker compose` with real seeded data (light +
  dark theme, populated and empty-project states), matching `mockup.html`'s
  interactions.

## 7. Docs and Sample Project

- [ ] 7.1 Update `docs/test-management.md`'s project landing description.
- [ ] 7.2 Update `apps/api/internal/sampledata/seed.go` (+ test) so the Sample Project
  demonstrates: a section with subsections (for the expand demo), an empty section, a
  never-run suite, and both a healthy and an at-risk suite.

## 8. Ship

- [ ] 8.1 Sync delta specs into `openspec/specs/ui-navigation/spec.md`
  (`/opsx:sync-specs enrich-project-landing-panels`).
- [ ] 8.2 Archive the change, keeping `mockup.html` as the durable design reference.
- [ ] 8.3 Commit + push per the "1 change = 1 commit = 1 push" cadence; wait for CI green.
