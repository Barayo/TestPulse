## Context

`CaseResultsPanel` (`apps/web/src/components/CaseResultsPanel.tsx`) has shipped
with a tested, populated-state renderer since `redesign-case-detail-page`
(2026-07-13) but has never been called with a `data` prop — `CaseDetailPage`
always renders its empty-state chrome. The panel's own header comment names
this exact follow-up. `docs/design-system.md`'s "Empty states" section already
records the intended continuation: reuse the existing bar/legend renderer,
`--chart-1/2/3` colors, no new component.

The data source, `GET /api/v1/cases/{caseKey}/executions`, is served by one
shared Go handler (`listCaseExecutions`, `apps/api/internal/server/handlers.go:337`)
wired to two routes with different middleware — member (`handlers.go:63`,
permission-gated) and public (`public_handlers.go:57`, public-project-gated).
Both hit the same `Service.CaseExecutions` → `RunRepo.ExecutionsByCase` path.
The query returns **every** execution, ordered by `(case_version, created_at)`
— version first, time second — with no `LIMIT`. A version can be restored
(existing feature), so an old version number does not imply an old timestamp;
sorting by version is not a proxy for recency.

## Goals / Non-Goals

**Goals:**
- Populate `CaseResultsPanel` with real data: a windowed success rate, the
  last 7 executions as colored bars, "last run" date.
- Make "last N executions, most recent first" a real bounded query, not a
  client-side slice of a full-history fetch (per the project's standing
  aggregation-at-scale caution).
- Extend `CaseResultsPanel`'s `Verdict` vocabulary to the real 6-value
  `Status` enum so every execution status is representable.

**Non-Goals:**
- No visual redesign of `CaseResultsPanel` — Pepe's gut-check confirmed the
  existing bars/legend/tooltip design is already right for this sidebar; only
  the `Verdict` type's coverage changes, not its rendering logic.
- No change to `VersionDetailDialog`'s own executions fetch (version-grouped,
  unbounded) — it has a different job (has this version regressed across
  runs?) and keeps calling the endpoint with no query params, unchanged
  response shape.
- No new hover/focus tooltip component — native `title` stays, per Pepe.

## Decisions

**One endpoint, additive query params, not a new endpoint.** `GET
/api/v1/cases/{caseKey}/executions?order=recent&limit=7` reuses the existing
route (and its public twin) rather than adding
`/cases/{caseKey}/executions/recent`. Both existing callers
(`VersionDetailDialog`, and any external/MCP consumer) already work with no
params — this is purely additive. `order` takes exactly two values today:
unset (existing default: `case_version, created_at ASC` — unchanged) or
`recent` (`created_at DESC`). `limit` is only meaningful paired with
`order=recent` and is rejected as a 400 if given alone, avoiding an
ill-defined "give me 7 rows in version order" mode nothing needs.

**SQL-level `LIMIT`, computed via a second query path in
`RunRepo.ExecutionsByCase`, not client-side slicing.** The existing query
stays untouched (default order, no `LIMIT`, still used by
`VersionDetailDialog`); a new `ExecutionsByCaseRecent(ctx, caseID, limit)`
method runs `... ORDER BY created_at DESC LIMIT $2`. Two small, obviously-
different SQL statements are clearer than one query branching on a runtime
order flag, and match the project's established pattern of separate query
methods over conditionally-built SQL (see `SuiteRepo.latestRunStats`'s two
separate queries from `rework-suite-run-flow`, same reasoning: `LastRunAt`
vs `PassRate` needed genuinely different `WHERE`/`ORDER BY` clauses, not one
query trying to serve both).

**Success rate is windowed (last-N), not all-time**, matching
`CaseResultsPanel`'s existing caption text ("success · last {n} runs").
Computed as `pass_count / total_count` over exactly the fetched window (7
items or fewer if the case has fewer executions) — `Service.CaseExecutions`
callers already exist; a new `Service.RecentCaseExecutions(ctx, caseID,
limit)` wraps the store call and stays a thin passthrough, no aggregation
logic in the service layer. `CaseDetailPage` computes `successRate` and
`lastRunAt` from the returned slice client-side (7 items, not 900 — this is
exactly the bounded case the store-level `LIMIT` makes safe to do in the
browser).

**`Verdict` extended to all 6 `Status` values using the canonical
`design-system.md` mapping**, not `VersionDetailDialog`'s narrower 3-color
ad hoc collapse (which maps `blocked`→red, `pending`/`retest`→muted — a
shortcut acceptable for a secondary dialog, wrong as this panel's canonical
vocabulary). `blocked` gets `--chart-4`; `pending` gets `--chart-5`; `retest`
reuses `--chart-5` with `RunStatusBreakdown.tsx`'s existing diagonal-texture
`backgroundImage`, not a new pattern. A `pending` execution (no verdict
recorded yet) still gets a bar — an item can be `current_status: pending`
and legitimately appear in the last-7 window if it was just added to a run;
showing nothing for it would silently undercount `{n} runs` in the caption.

**Bars become `<button>`s with `aria-label`, keep native `title` too.**
Pepe flagged this as pre-existing and non-blocking, but since the file is
already being touched: swap `<span>` → `<button type="button">` per bar so
keyboard focus can reach it (still no visual change — same classes, `title`
stays as the mouse-hover affordance, `aria-label` carries the same string
for screen readers). Buttons are inert (no `onClick`) — this is a focus-
reachability fix, not a new interaction.

## Risks / Trade-offs

- **[Risk]** A case with a long history but very few *distinct* runs
  recently (e.g., re-recorded many times against the same run) could show a
  window that looks like "last 7 runs" but is actually 7 results from 2-3
  runs. → Out of scope: the query is explicitly "last 7 executions" per the
  issue's own wording, not "last 7 distinct runs" — matches
  `CaseResultsPanel`'s existing caption grammar (`{data.recent.length}`, an
  item count) and needs no new dedup logic.
- **[Risk]** Adding `order`/`limit` params without validation could let a
  caller pass `limit=100000`. → Cap `limit` server-side (reject `>50` with
  400) even though the only current caller asks for 7 — keeps the new param
  from becoming an unbounded-fetch escape hatch later.
- **[Trade-off]** Two store methods (`ExecutionsByCase` /
  `ExecutionsByCaseRecent`) instead of one parameterized query is minor
  duplication (same `JOIN`, different `ORDER BY`/`LIMIT`) — accepted per the
  `SuiteRepo.latestRunStats` precedent above; the alternative (one query
  with conditional SQL fragments) has been a real source of bugs in this
  codebase before (D10 of `rework-suite-run-flow`).

## Migration Plan

No migration — no schema change, `created_at` already has whatever indexing
the table's other time-ordered queries rely on. Deploy is a normal API +
web release; both new query params are additive and default to today's
existing behavior when omitted, so no coordinated rollout ordering is
needed.

## Open Questions

None — Pepe's design gut-check and the codebase investigation above resolved
every open question this change started with (bars vs. dots, tooltip
pattern, verdict vocabulary, query shape).
