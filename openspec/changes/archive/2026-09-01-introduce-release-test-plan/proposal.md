## Why

Runs attach directly to a Project today (`test_runs.project_id`), with no way to
group them by release or track a release's own lifecycle. Two real-world needs
from prior teams can't be modeled: tracking several concurrently-supported
releases with their own status (active/maintained/EOL), and rolling up pass
rate across the several platform-specific runs (iOS, Android, ...) that
belong to one release. GH issue #15.

## What Changes

- Add **Release** as a new entity scoped to a Project: identity, name,
  description, and a status (`active` / `maintained` / `eol`), listable and
  filterable by status.
- Add **Test Plan** as a new entity scoped to a Release: the execution-scope
  grouping (TestRail/Xray/Zephyr convention — distinct from ISTQB's "Test
  Plan" planning document; naming call recorded in design.md), used to group
  the Runs that exercise one release (e.g. one Test Plan per platform).
- Runs gain an **optional** `testPlanId` scope. A Run can still be created
  directly under a Project (today's flow, unchanged) or scoped to a Test
  Plan — this is additive, not a breaking change to existing runs or the
  existing run-creation API.
- Add server-side rollup aggregation: pass rate and run counts across a Test
  Plan's runs, and across a Release's Test Plans — single aggregate queries
  (`GROUP BY`), following the `project-stats` batched-query precedent, never
  a client-side fetch-and-count loop.
- Web UI gains a new navigation level for projects that use it: Project →
  Releases → Test Plan → Runs. Detailed screen design is deferred to
  implementation (Pepe design-mock-first, per standing practice) — this
  proposal and its design.md scope the domain/API/data model only.
- Sample Project (`seed.go`) gains at least one Release with two Test Plans
  (demonstrating the multi-platform-per-release use case) to showcase the
  capability.

## Capabilities

### New Capabilities
- `release-management`: Release entity — CRUD, status lifecycle
  (active/maintained/eol), listing/filtering, and release-level rollup
  reporting (pass rate/status aggregated across the release's Test Plans).
- `test-plans`: Test Plan entity — CRUD, scoped to a Release, groups Runs,
  and Test-Plan-level rollup reporting (pass rate aggregated across the
  plan's Runs).

### Modified Capabilities
- `test-execution`: Run creation gains an optional Test Plan scope (a Run
  MAY belong to a Test Plan in addition to its Project); Run listing/filtering
  gains a Test Plan filter. Existing direct-under-Project run creation is
  unchanged.
- `ui-navigation`: new optional navigation level (Releases, Test Plans) under
  a project, for projects that use it.

## Impact

- `apps/api/internal/domain/domain.go`: new `Release`, `TestPlan` structs and
  validation; `Run` gains optional `TestPlanID`/`TestPlanKey`.
- New migration `00011_...sql` (per permanent incremental-migration policy):
  `releases`, `test_plans` tables; `test_runs` gains a nullable
  `test_plan_id` FK. Existing rows are unaffected (column is nullable, no
  backfill required).
- `apps/api/internal/store/`: new `releases.go`, `test_plans.go`; `runs.go`
  gains optional scoping and a Test Plan filter on `List`.
- `packages/shared/openapi.yaml`: new `Release`, `TestPlan` schemas and
  CRUD/list endpoints; `Run`/run-creation request gains optional
  `testPlanId`.
- `apps/web/src/`: new pages for Release list/detail and Test Plan
  list/detail; run creation flow gains an optional Test Plan picker; new
  routes under `/projects/:projectKey/releases/...`.
- `apps/api/internal/sampledata/seed.go` and `seed_test.go`: showcase data.
- `docs/`: test-management / API docs describe the new entities.
