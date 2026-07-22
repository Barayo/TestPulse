## Why

The Sample Project (`add-sample-project`) shipped with a deliberately lean
demonstration: 2 sections, 5 cases, 2 suites, 3 runs. That's enough to prove
the seeding mechanism works, but too thin to actually showcase the product —
a project this small doesn't show what a real, lived-in test suite looks
like, and doesn't deliberately exercise every data-driven visual the app
already renders (the project health badge, and the case-version "Flaky"
signal in particular). The user asked directly for richer content:
more sections, suites, cases, and — most importantly — enough recorded
results to show every feature "as they are implemented."

## What Changes

- `sampledata.Seed` (the Sample Project's content builder) grows
  significantly: 5 sections instead of 2, roughly 25-30 cases instead of 5
  (covering every `Priority` value, varied tags, `platform` spanning
  web/mobile/api/desktop, `testType` spanning functional/e2e/api/
  regression, and a mix of automated/manual), 4 suites instead of 2, and
  several more runs.
- The chronologically **last** run created ends with a high pass rate
  (≥85%), since a project's health badge is driven only by its most
  recently created run — this is the one number the seed data needs to get
  right for the project list's "Healthy" showcase state to actually appear.
- **New**: at least one case is deliberately made "flaky" — its pinned
  version appears in two or more runs with different recorded verdicts,
  without an edit in between — so `VersionDetailDialog`'s real "Flaky"
  badge has something genuine to show. This wasn't a deliberate part of
  the original seed; it's the one new *behavior* this change adds, not
  just more volume.
- The multi-version case history demonstration gets a second example (a
  case edited twice, reaching version 3), alongside the existing one.
- The JUnit-XML import demonstration keeps its shape (matched + at least
  one unmatched case) but draws from the larger case pool.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `sample-data`: the "Sample Project content demonstrates core
  capabilities" requirement's minimums are raised (sections, suites,
  cases) and a new requirement is added for the deliberate flaky-version
  signal.

## Impact

- **Backend only**: `apps/api/internal/sampledata/seed.go` — no new
  service/store methods, no migration, no contract change. Existing
  helpers in `apps/api/internal/sampledata/helpers.go` (`Filler`,
  `CaseWithSteps`, `Suite`, `RunWithVerdicts`) are reused as-is.
- **Tests**: `apps/api/internal/sampledata/seed_test.go`'s existing
  integration tests are extended to assert the new minimums and the new
  flaky-signal behavior.
- **Verification**: re-run the manual compose-stack check and `make e2e`
  (same as `add-sample-project`'s own task 10) — a much larger seed must
  not slow startup unacceptably or break any existing e2e scenario that
  runs against the shared stack.
- **Explicitly not touched**: `Project.isSample`, the "Sample" badge, the
  `test-authoring`/`ui-navigation` capabilities, and anything about
  `CaseResultsPanel`'s (still-unwired) bar chart or the unbuilt
  `add-reporting` v0.3 trend features — none of that exists to seed data
  for yet.
