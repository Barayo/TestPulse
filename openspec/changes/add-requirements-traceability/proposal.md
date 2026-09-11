## Why

As a QA lead, when I need to prove a release is ready to ship, I want to see
which requirements are covered by which test cases and their current
pass/fail state, so I don't have to reconstruct coverage by hand for an
audit or a go/no-go call. TestPulse has no concept of a requirement or a
traceability link today — without it, TestPulse is a test *runner*, not
test *management*: it can't answer "is requirement X covered" or "what's
blocking release readiness," a capability TestRail, Zephyr/Xray, and qTest
all treat as standard (GitHub issue #126).

## What Changes

- Add a new `Requirement` entity: project-scoped, flat (no hierarchy), with
  `name`, `description`, an optional free-text `externalRef` (no live
  Jira/ADO sync), and an immutable `key`.
- Add many-to-many linking between Requirements and test Cases, editable
  from either side (a Requirement's detail page, or a Case's detail page).
- Add a Release-scoped coverage matrix: for a given Release, each linked
  Requirement's status (`notRun` / `failing` / `covered`) is computed via a
  worst-case rollup across its linked cases' latest results among that
  Release's Test Plans specifically — not a project-wide latest-ever
  result.
- Reuse the existing `manageProject` permission for Requirement CRUD and
  linking — no new RBAC permission flag.

## Capabilities

### New Capabilities
- `requirements-traceability`: Requirement CRUD, case↔requirement linking
  (both directions), and the Release-scoped coverage matrix computation.

### Modified Capabilities
(none — this change is additive; it reads existing Release/Test Plan/Run
execution data without changing any of their existing requirements)

## Impact

- **API**: new `packages/shared/openapi.yaml` paths for Requirement CRUD,
  link/unlink, and a Release's coverage matrix; `apps/api/internal/domain`,
  `store`, `service`, `server` gain the corresponding Requirement types and
  handlers.
- **DB**: one new migration adding `requirements` and `requirement_cases`
  tables (the latter mirroring the existing `suite_cases` junction table).
- **Frontend**: new `RequirementsPage` and `RequirementDetailPage`; a new
  "Requirements" panel on `CaseDetailPage`; a new "Requirements Coverage"
  Card section on `ReleaseDetailPage`; reuses the existing `CasePicker`
  component.
- **Docs**: `docs/test-management.md` gains a Requirements section.
- **Sample Project**: `apps/api/internal/sampledata/seed.go` seeds a few
  Requirements linked to sample cases, with a mixed coverage state visible
  on a seeded Release.
