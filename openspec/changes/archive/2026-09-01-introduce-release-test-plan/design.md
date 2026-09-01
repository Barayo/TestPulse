## Context

Today `test_runs` has a single parent: `project_id` (baseline migration,
`apps/api/internal/store/runs.go`). There is no entity between Project and
Run. Two real needs (GH #15) can't be modeled: (a) tracking several
concurrently-supported releases with their own lifecycle status, and (b)
grouping the several platform-specific runs that exercise one release, with
a rolled-up pass rate across them.

Constraints carried in from the issue and CLAUDE.md:
- Never edit a shipped migration; this ships as a new file
  (`00011_release_test_plan.sql`).
- Any rollup (pass rate across a release/plan's runs) must be a server-side
  aggregate query, following the batched-`GROUP BY` pattern already used by
  `ProjectRepo.Summaries` (`apps/api/internal/store/projects.go:294-439`) —
  never a client-side fetch-and-count loop.
- `testpulse.fly.dev` has real data; the migration must not require a wipe
  (rules out a NOT NULL FK with no default on `test_runs`).

## Goals / Non-Goals

**Goals:**
- Release: identity, name, description, status (`active`/`maintained`/`eol`),
  scoped to a Project, listable/filterable by status.
- Test Plan: identity, name, description, scoped to a Release, groups Runs.
- Optional Test Plan scoping on Run creation/listing, fully backward
  compatible with today's direct-under-Project runs.
- Server-side rollup: pass rate + run counts per Test Plan, and per Release
  (aggregated across its Test Plans).

**Non-Goals:**
- Detailed UI screen design (deferred to implementation, Pepe mock-first per
  standing practice — this document scopes domain/API/data model only).
- Changing `Suite` or `Folder` — both stay exactly as they are (case
  organization, not execution scope), per the issue's own analysis.
- Making Release/Test Plan mandatory for existing or new runs. This change
  is purely additive.
- New granular RBAC permissions (see Decision 4).

## Decisions

**D1 — Test Plan is optional on Run, not a new required parent.**
`test_runs.test_plan_id` is a nullable FK (`ON DELETE SET NULL`). A Run can
still be created directly under a Project, exactly as today. Alternative
considered: make Test Plan mandatory (matches the issue's literal
`Project → Release → Test Plan → Run` hierarchy diagram) — rejected because
it would force every existing team and every existing test/e2e flow that
creates a run directly under a project to change, for no benefit to teams
that don't need release tracking (most current usage, including the Sample
Project's simpler runs). Optionality lets Company-A/B-style teams opt in
without disrupting the common case.

**D2 — Naming: "Test Plan" (not ISTQB-aligned), flagged in the UI's own
copy.** We adopt the TestRail/Xray/Zephyr convention (an execution-scope
grouping), not ISTQB's "Test Plan" (a planning document). No renaming
alternative (e.g. "Cycle", "Execution Plan") tests better against the tools
our users already migrate from, so we keep the industry-common name and
accept the ISTQB mismatch as a documented, deliberate choice (docs/ will
call this out explicitly for ISTQB-certified readers).

**D3 — Release status is a closed enum, validated like `Priority`.**
`active` / `maintained` / `eol`, default `active`. Follows the existing
flat-enum-with-`Validate()`-check precedent (`Priority`,
`CaseContent.Format`) rather than a separate status-history table — no
current requirement needs status transition history, only current state.

**D4 — Reuse `PermManageProject` for Release/Test Plan CRUD; `PermRead` for
listing.** Alternative considered: new granular permissions
(`releaseManage`, `testPlanManage`) mirroring `suiteCreate`/`runCreate` —
rejected for this change to avoid also expanding the Role-editor UI
(`RolesPage`) and RBAC test matrix inside an already-large change. Release
lifecycle changes are infrequent, project-structural decisions, closer to
project settings than to daily case/run authoring. Can be split into
granular permissions later as a follow-up if real usage shows the need.

**D5 — Rollup aggregation: two batched `GROUP BY` queries, not a
recursive/CTE join across all three levels.** Test-Plan-level rollup:
`test_run_items GROUP BY run_id` joined to `test_runs.test_plan_id`, one
query per Test Plan detail view (same shape as `ProjectRepo.Summaries`'s
pass-rate subquery). Release-level rollup re-aggregates the per-Test-Plan
numbers (`GROUP BY test_plan_id` rolled into `GROUP BY release_id` via a
second batched query keyed by the release's plan IDs), avoided a single
3-way-join query since Release and Test Plan detail views are fetched
independently and each needs its own scoped total, not a combined one.

**D6 — Human-readable keys via the existing `claimEntityKey` mechanism.**
Releases and Test Plans get keys the same way Runs do today
(`claimEntityKey(ctx, tx, projectID, "release", "%s-REL%d")` /
`"%s-PLAN%d"`), keeping URLs consistent with the rest of the app
(`/projects/{key}/releases/{releaseKey}`).

## Risks / Trade-offs

- **[Risk]** Optional Test Plan scoping (D1) means the UI must clearly show
  "unscoped" runs alongside release-scoped ones, or teams lose visibility
  into ad-hoc runs once they adopt releases. → **Mitigation**: UI design
  (Pepe, implementation phase) must explicitly design the "runs without a
  release" view, not just the release-scoped list.
- **[Risk]** Reusing `PermManageProject` (D4) means any project admin can
  create/edit releases, with no finer-grained delegation (e.g. a release
  manager role). → **Mitigation**: acceptable for v1 given no current
  requirement for that split; documented as a deliberate deferral, not an
  oversight.
- **[Risk]** Adding a new nav level risks the same "reworked navigation
  twice" concern the issue originally raised. → **Mitigation**: nav level is
  additive/optional (D1) — projects that never create a Release see no UI
  change at all.

## Migration Plan

1. New migration `00011_release_test_plan.sql`: `releases` table (id, key,
   project_id FK, name, description, status, created_at); `test_plans` table
   (id, key, release_id FK, name, description, created_at); `test_runs` gains
   nullable `test_plan_id` FK `ON DELETE SET NULL`. No backfill needed — all
   existing runs simply have `test_plan_id = NULL`, which is a valid,
   supported state (D1).
2. `make generate` after the OpenAPI schema additions, checked into the same
   commit per contract-first policy.
3. Rollback: dropping the migration is safe pre-release (no other change
   depends on these tables yet); post-release rollback would need a
   follow-up migration dropping the new tables/column, acceptable since
   they're purely additive and unreferenced by anything else.

## Open Questions

- None blocking — D1–D6 resolve the ambiguities the issue itself flagged
  (naming, optionality, aggregation pattern). UI screen layout is
  intentionally left open for the implementation-phase Pepe design pass.
