## Why

As a QA engineer, when I need to verify a suite passes across every
browser/OS/device combination we support, I want to run it once per
configuration and see a matrix of results (case × configuration), so I
can tell at a glance which combinations are covered and which are
failing, instead of tracking it in a spreadsheet. TestPulse has no
concept of a run "configuration" today — confirmed absent from the
codebase (GitHub issue #129, surfaced by a QA-architect gap assessment
against TestRail/Qase/Zephyr/Tuskr/Kiwi TCMS).

## What Changes

- Add an optional, free-text `Configuration` field to `Run`, set once at
  creation (like `Name`) — same spirit as the existing free-text
  `Platform`/`Tags` fields on cases, deliberately not a managed/enum
  entity (consistent with `add-case-classification-fields`'s prior
  decision against fixed taxonomies).
- Add a new `GET /api/v1/plans/{planKey}/coverage-matrix` endpoint that
  pivots a Test Plan's runs into a case × run grid: rows are the union
  of cases across the plan's runs, columns are each run (labeled by its
  `Configuration` if set, else its `Name`), cells are that run's current
  status for that case (empty if the case isn't in that run).
- Add a "Coverage Matrix" section to the Test Plan detail page
  (`TestPlanDetailPage.tsx`), per the validated Pepe mock.
- Add a `Configuration` input to the new-run form (`NewRunPage.tsx`).

## Capabilities

### New Capabilities

- `run-configurations`: a free-text configuration label on a run, and a
  Test-Plan-scoped coverage matrix pivoting a plan's runs by that label.

### Modified Capabilities

(none — no existing capability's requirements change; `Run`'s existing
behavior is additive-only.)

## Impact

- `apps/api/internal/db/migrations/00028_*.sql` (new column on
  `test_runs`).
- `apps/api/internal/domain/domain.go` (`Run.Configuration`), `service.go`
  (`RunInput.Configuration`, new `CoverageMatrix` service method),
  `store/runs.go` (new batched `ItemsByRunIDs`), `server/handlers.go`
  (new endpoint), `packages/shared/openapi.yaml` (contract).
- `apps/web/src/pages/NewRunPage.tsx` (new field),
  `TestPlanDetailPage.tsx` (new section).
- `apps/api/internal/sampledata/seed.go` (Sample Project showcase: a Test
  Plan with multiple configuration-tagged runs demonstrating the
  matrix, including at least one coverage gap).
- `docs/` (behavior/API docs for the new field and endpoint).
