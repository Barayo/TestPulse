## Context

TestPulse has no concept of a requirement or a traceability link today
(confirmed absent from `openspec/specs/` and `apps/api/internal/domain`).
This change adds one, scoped tightly to what issue #126 actually asks for:
link cases to requirements, and show a release-readiness coverage view —
not a general-purpose requirements-management tool with hierarchy or
external sync. The design was brainstormed and approved section-by-section
with the user; this document records the resulting technical decisions,
verified against the real codebase conventions (REST paths, RBAC model,
key-generation scheme, and existing many-to-many patterns) rather than
assumed from the proposal alone.

## Goals / Non-Goals

**Goals:**
- Let a `manageProject`-permitted user create/edit/delete Requirements and
  link/unlink Cases to them from either side.
- Compute, per Release, a worst-case coverage status per Requirement from
  its linked cases' latest results *under that Release's Test Plans*.
- Reuse existing components and patterns wherever a precedent exists
  (`suite_cases`, `CasePicker`, `manageProject`, `Rollup`-style computed
  aggregates, resource-keys infix scheme) rather than inventing new ones.

**Non-Goals:**
- No live Jira/ADO requirement sync — `externalRef` is a free-text field
  only. A sync path would need its own standalone-process design, the way
  `jira-connector` is architected, and is a separate future change.
- No hierarchical/nested requirements — flat list only, matching Tags and
  Custom Fields rather than Folders.
- No new RBAC permission flag — the existing 10-flag `Permission` set
  (`add-project-rbac` design.md D11) is a deliberate design outcome and
  this change does not expand it.
- No project-wide (non-Release-scoped) coverage view, and no bulk
  link/unlink endpoint.
- No `Tabs` UI primitive — this codebase has none yet, and introducing one
  is out of scope for this change.

## Decisions

**D1: `requirement_cases` junction table, mirroring `suite_cases`.**
`suite_cases (suite_id, case_id)`, PK on both columns, `ON DELETE CASCADE`
both directions, is the exact existing precedent for a many-to-many
case-link relationship (`00001_baseline.sql`). `requirement_cases
(requirement_id, case_id)` copies this structure verbatim. Alternative
considered: an array column on `Requirement` like `Suite.CaseIDs` — rejected
because `Suite.CaseIDs` is itself backed by `suite_cases` under the hood
(the array is a store-layer projection, not the storage shape), so copying
the table is copying the real precedent, not the derived one.

**D2: REST paths follow the exact existing sibling shapes.**
- `POST/GET /api/v1/projects/{projectKey}/requirements` (create/list) —
  matches `/api/v1/projects/{projectKey}/releases` and `.../suites`.
- `GET/PATCH/DELETE /api/v1/requirements/{requirementKey}` — matches
  `/api/v1/releases/{releaseKey}` and `/api/v1/suites/{suiteKey}`.
- `PUT/DELETE /api/v1/requirements/{requirementKey}/cases/{caseKey}` —
  copies `/api/v1/suites/{suiteKey}/cases/{caseKey}` (`addCaseToSuite` /
  `removeCaseFromSuite`) verbatim: `PUT` adds the link (204, idempotent —
  linking an already-linked case is a no-op, not an error), `DELETE`
  removes it (204; the case itself is never touched).
- `GET /api/v1/releases/{releaseKey}/requirements-coverage` — matches the
  shape of `/api/v1/releases/{releaseKey}/rollup` (an existing Release
  sub-resource GET returning a computed aggregate, not a stored one).

**D3: Coverage status is computed, never stored, and scoped strictly to
one Release's Test Plans.**
For a Release, the coverage query joins each of the project's Requirements
to their linked cases, then to each case's latest `Result` among Runs whose
Test Plan belongs to *that* Release — not the case's latest result
anywhere. This is one aggregate SQL query per coverage request (matching
the standing aggregation-performance rule that already shaped `Rollup` and
`Test Plan` rollup), not a per-case fetch loop. Status per Requirement:
- Zero linked cases, or any linked case has no Result under this Release's
  Test Plans → `notRun`.
- Else, any linked case's latest-under-this-Release Result is `failed` or
  `blocked` → `failing`.
- Else (all linked cases' latest-under-this-Release Results are `pass`) →
  `covered`.
`skipped` is treated the same as "no informative result" — folded into
`notRun` rather than a fifth status, since a skipped-only case tells you
nothing about coverage either way.

**D4: `manageProject` gates everything — no new permission.**
Requirement CRUD and case-link/unlink both require `manageProject`,
matching the closest existing precedent (Test Plan CRUD). Considered
introducing a dedicated flag (mirroring how `suiteEditMembership` is split
from `suiteCreate`) but rejected: the existing 10-flag set is a documented,
deliberate design boundary, and this feature doesn't have a use case
(distinct from Suite's) that demands finer granularity yet.

**D5: Resource key uses a new `REQ` infix.**
Following `resource-keys`' existing per-entity-type infix scheme (bare for
cases, `R` for runs, `S` for suites), Requirements get `{projectKey}-REQ{n}`
— e.g. `LOGIN-REQ1`. Sequential per project, immutable, never reused, same
as every other keyed entity.

**D6: Frontend reuses `CasePicker` and existing status-pill components.**
The Requirement-side case-linking UI reuses the same `CasePicker` component
Suite membership already uses (same interaction: search/select cases,
add/remove). The Coverage Card section on `ReleaseDetailPage` renders
status via the existing `StatusPill`/`healthColor` components already used
for run/suite health, rather than introducing new status-visualization
components.

## Risks / Trade-offs

- **[Risk]** A Release with many Requirements × many linked cases could
  make the coverage query expensive if not indexed correctly.
  → **Mitigation:** index `requirement_cases(case_id)` and
  `requirement_cases(requirement_id)`, and constrain the Result join to
  the Release's Test Plans' Run IDs via an indexed path (`runs.plan_id`,
  already indexed for the existing Test Plan rollup query) before
  aggregating — same index shape the existing rollup query already relies
  on.
- **[Risk]** Folding `skipped` into `notRun` could look surprising if a
  team deliberately skips a case under a given release and expects that to
  count as "handled."
  → **Mitigation:** documented explicitly in `docs/test-management.md`;
  revisit only if real usage surfaces this as a problem — YAGNI against
  speculative status granularity for v1.
- **[Trade-off]** No bulk link/unlink endpoint means linking many cases to
  one Requirement is N sequential requests from `CasePicker`'s existing
  selection flow.
  → Accepted: matches how Suite membership already works today; a bulk
  endpoint can be added later if it becomes a real pain point (same
  reasoning as it not existing for Suites yet).

## Migration Plan

One new incremental migration (`apps/api/internal/db/migrations/`) adding
`requirements` and `requirement_cases`, following the project's permanent
incremental-migration policy (goose, one file, never edited post-merge).
No backfill needed — both tables start empty; existing Releases/Cases are
unaffected until a user creates their first Requirement. Sample Project
reseeds automatically as part of this change's Sample Project showcase
task.

## Open Questions

None — all decisions were resolved during brainstorming and are recorded
above.
