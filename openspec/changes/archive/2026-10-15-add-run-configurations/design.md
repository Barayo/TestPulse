## Context

TestPulse has no concept of a run/case "configuration" axis (#129).
Existing prior art directly informs this design:
- `CaseContent.Platform`/`TestType` are deliberately free text, not
  enums (`add-case-classification-fields` design.md: "web/iOS/Android/
  API" taxonomies vary too much between teams for a fixed list to be
  worth the migration friction"). `Result.Platform`/`Tags` are also
  free text, populated via execution import, but never aggregated into
  any coverage view today.
- `Run` has no field editable after creation except `Status`/`Archived`
  (via dedicated `close`/`reopen`/`archive`/`unarchive` endpoints) — no
  generic update/rename endpoint exists.
- Runs already group under an optional Test Plan
  (`introduce-release-test-plan`; `Run.TestPlanID`), with
  `Service.ListRunsByTestPlan` already fetching a plan's runs, and
  `TestPlanDetailPage.tsx` already rendering that list.
- `RunItem.CurrentStatus` is already the live, current status for a
  case within a run — exactly the value a coverage-matrix cell needs,
  no execution-history (`Result`) lookup required.
- This project has a standing caution against client-side aggregation
  loops (design for DB scale from day one) — the matrix must be computed
  server-side via a batched query, not N per-run fetches from the
  browser.

Design dialogue with the user settled two forks before this document
was written: (1) `Configuration` is free text, following the existing
precedent, not a new managed entity; (2) "running once per configuration"
means one Run per configuration, grouped by Test Plan — not a per-item
cross-product within a single run. A UI mock (Pepe, Fable 5) was
produced against the real `TestPlanDetailPage.tsx` and validated by the
user before this design was finalized.

## Goals / Non-Goals

**Goals:**
- Let a run carry an optional free-text `Configuration` label, set once
  at creation.
- Let a Test Plan's runs be viewed as a case × configuration coverage
  matrix, surfacing gaps (a case not yet run under some configuration)
  at a glance.
- Compute the matrix server-side in a bounded number of queries,
  regardless of how many runs/cases the plan has.

**Non-Goals:**
- No managed `Configuration` entity/admin CRUD screen — free text only,
  exactly like `Platform`/`Tags`.
- No RunItem-level cross-product expansion (one run covering multiple
  configurations via N×M items) — a run is scoped to exactly one
  configuration value (or none).
- No cross-Test-Plan matrix — scoped to one plan's runs.
- No merge/collision handling for two runs in the same plan sharing the
  same `Configuration` label — each run is its own column regardless.
- No change to `NewRunPage.tsx`'s or `CreateRun`'s existing fields
  beyond adding the one new optional field.

## Decisions

**D1 — `Configuration` is a new optional string column on `test_runs`,
available on any run.** Not restricted to Test-Plan-scoped runs —
consistent with how `Platform`/`Tags` are unconditionally available
elsewhere, and avoids conditional UI (the field only being visible
inside a Test Plan flow would be a surprising, arbitrary restriction).
Set via `RunInput.Configuration` at creation; immutable afterward, same
as `Run.Name` (no rename endpoint exists for either).

**D2 — The coverage matrix is a new Test-Plan-scoped endpoint, not a
client-side join.** `GET /api/v1/plans/{planKey}/coverage-matrix`
calls the existing `ListRunsByTestPlan` for the plan's runs, then a new
batched store method, `Runs.ItemsByRunIDs(ctx, runIDs []string)`
(`WHERE run_id = ANY($1)`, one query regardless of run count), then
pivots in memory: each run is a column (labeled `Configuration` if
non-empty, else `Name`); each distinct case across all returned items
is a row; each cell is that item's `CurrentStatus`, keyed by
`(caseID, runID)`. A case absent from a given run's items is simply
absent from that `(caseID, runID)` pair — the handler/frontend renders
that as an empty cell.

**D3 — Response shape mirrors Pepe's validated mock's data needs.**
```
{
  "configurations": [{"runKey": "...", "label": "Chrome"}, ...],
  "cases": [
    {
      "caseKey": "...", "title": "...",
      "cells": { "<runKey>": {"runItemKey": "...", "status": "pass"} }
    }
  ]
}
```
`cells` is sparse — a run key absent from a case's `cells` map is the
gap case the matrix exists to surface. `runItemKey` lets the frontend
link each filled cell to its run item (`RunPage`'s existing per-item
route), matching the mock's "cells are clickable" decision.

**D4 — UI: a new full-width "Coverage Matrix" card below
`TestPlanDetailPage.tsx`'s existing plan-grid, per the validated mock.**
Sticky first column (case names) + `overflow-x-auto`, reusing the same
wide-content-scroll idiom as `CaseParametersView.tsx`/
`ReleaseDetailPage.tsx`. Cells reuse `StatusBadge` as-is (dot+label,
including its existing blocked/failed shared-red-dot behavior —
unchanged, not "fixed" here). Gap cells render a plain `—`, matching
`PropertyRow`'s empty-value convention — not a badge, not a link. A
small neutral (not red/green) chip near the card title communicates gap
count ("2 gaps · not yet run"), plus a muted meta-line ("3
configurations · 8 cases · 22 of 24 combinations run"), both per the
mock. The section renders only once the plan has ≥1 run (the existing
Runs card already owns the "no runs yet" empty state); a plan with runs
but zero recorded items gets the mock's dedicated empty-state treatment.
No separate mobile layout, consistent with the project's standing rule
against parallel mobile-only render paths.

**D5 — `NewRunPage.tsx` gains one new optional text input,
`Configuration`.** Alongside the existing Name/Suite/Test-Plan fields;
sent as `configuration` in `POST /api/v1/projects/{projectKey}/runs`'s
body only when non-empty (same `...(x ? {...} : {})` spread pattern the
form already uses for `suiteKey`/`testPlanKey`).

**D6 — Sample Project showcase.** `seed.go` gains a Test Plan with 3
runs (e.g. Chrome/Firefox/iOS Safari configurations) sharing most but
not all cases, with a realistic pass/fail/skip mix and at least one
genuine gap (a case present in two runs' item lists but not the third) —
so the Sample Project's own coverage matrix demonstrates the gap-
detection behavior out of the box, not just a fully-green grid.

## Risks / Trade-offs

- **Risk:** A plan with many runs × many cases makes the matrix wide/
  tall. → Mitigation: sticky column + horizontal scroll (D4) handles
  width; no pagination needed for a reasonable number of cases per plan
  (same scale assumption as existing run-item lists).
- **Trade-off:** Duplicate `Configuration` labels across runs in the
  same plan aren't merged (explicit non-goal) — accepted as a rare
  user-error case, not worth collision-handling complexity for a v1.
- **Risk:** `ItemsByRunIDs`'s in-memory pivot loads every item from
  every run in the plan into the API process at once. → Mitigation:
  bounded by a Test Plan's realistic run/case count (same order of
  magnitude as a single run's item list today, just multiplied by a
  handful of configurations) — revisit with real pagination only if
  usage proves otherwise.

## Migration Plan

One additive migration (`00028_*.sql`): `ALTER TABLE test_runs ADD
COLUMN configuration text`. Nullable, no backfill needed — existing
runs simply have no configuration, rendering as their own `Name` in any
future matrix. No rollback complexity; reverting the column addition in
a follow-up migration (never editing this one in place, per the
project's permanent migration policy) would be safe since nothing else
depends on the column existing.

## Open Questions

None — all forks raised during brainstorming (free-text vs. managed
entity, run-level vs. item-level axis, duplicate-label handling) were
resolved with the user above.
