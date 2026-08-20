## Why

As a user, when I open a test case, I want to see its recent pass/fail history at a
glance in the sidebar — not just its properties and version list. `CaseDetailPage`'s
"Results" section has rendered only an empty-state placeholder since it shipped
(`redesign-case-detail-page`, 2026-07-13): `CaseResultsPanel` already has a fully
designed, tested, populated-state renderer (success-rate headline, per-run colored
bars, legend, "Last run" line), explicitly left unwired pending this named follow-up
(its own header comment: "`add-case-result-history` (a follow-up change) owns
fetching real result history"). Closes GitHub issue #80, next in the v0.3 "Insight"
epic (#11) after run comparison (#79).

A Pepe/Fable-5 design gut-check (this session) confirmed the existing bar/legend
design is already right for this sidebar and should be reused as-is — this is a
data-wiring and backend-query change, not a new visual design.

## What Changes

- **`CaseResultsPanel`'s `Verdict` type extended to the real 6-value status
  vocabulary** (`pending, pass, failed, skipped, blocked, retest`) using the
  existing canonical color/texture mapping from `docs/design-system.md`
  (`--chart-1` through `--chart-5`, texture-over-`chart-5` for retest) instead of
  today's narrower `pass | failed | skipped` that can't represent a blocked or
  retest execution at all.
- **`GET /api/v1/cases/{caseKey}/executions` (and its `/api/v1/public/` twin) gain
  `limit` and `order` query parameters**, computed in SQL (`ORDER BY created_at DESC
  LIMIT N`), so "last N executions" is a bounded query rather than a full-history
  fetch aggregated client-side. Default behavior (no params) is unchanged — existing
  callers (`VersionDetailDialog`) keep working as-is.
- **Genuine recency ordering, not version-number ordering**: the new `order=recent`
  mode sorts strictly by `created_at DESC`, correctly handling the case where an
  older pinned version was restored and now has the most recent timestamp — the
  endpoint's existing default order ("by version, then time") is not reused for this
  mode.
- **`CaseDetailPage` wires real data into `CaseResultsPanel`**: fetches the last 7
  executions via the new bounded query, computes a windowed success rate and "last
  run" date, and passes them as the `data` prop — replacing the always-empty state.
- **Small accessibility fix while in this file**: each result bar becomes a
  `<button>` with an `aria-label` carrying the verdict + date, instead of a plain
  `<span>` whose only affordance is a mouse-only `title` tooltip.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `test-execution`: "Querying executions by case version" gains a bounded,
  recency-ordered query mode (`limit`/`order` params) alongside the existing
  version-grouped default.
- `ui-navigation`: "Case detail page" gains a populated Results section (success
  rate, recent-run bars, legend) instead of always showing the empty-state
  placeholder.

## Impact

- **Backend**: `packages/shared/openapi.yaml` (new query params on both execution
  endpoints), `apps/api/internal/service.go` (`CaseExecutions`), `apps/api/internal/
  handlers.go` / `public_handlers.go`, `apps/api/internal/store/runs.go`
  (`ExecutionsByCase` or a new sibling query) — then `make generate`. No migration
  (no schema change, `created_at` is already indexed for this table's other
  queries).
- **Frontend**: `apps/web/src/components/CaseResultsPanel.tsx` (`Verdict` type +
  color/label maps extended, bar → button), `apps/web/src/pages/CaseDetailPage.tsx`
  (fetch + wire `data` prop). No new components, no visual redesign.
- **Docs**: `docs/test-management.md`'s case detail section needs a line describing
  the now-populated Results panel.
- **Sample Project**: seeded cases already have run history across multiple
  statuses (`internal/sampledata/seed.go`) — worth confirming at least one seeded
  case has enough varied-verdict executions to showcase the full bar/legend
  behavior, not just pass/fail.
