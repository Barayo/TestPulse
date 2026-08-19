## Context

Building blocks already shipped by earlier `add-reporting` sub-issues:
- `run.suiteKey` (#75) links a run to its source suite; `RunPage.tsx` already renders a
  "From suite: X" link when set.
- `RunStatusBreakdown.tsx` (#76) — a stacked status bar + color-coded legend, the app's
  one established "run status chart" component, already used on `RunPage.tsx`.
- `GET /api/v1/suites/{suiteKey}/trend` (#77) — a suite's closed runs, oldest→newest,
  each with full status counts. Powers a built-but-unwired `SuitePassRateTrend.tsx`
  sparkline (built ahead of #81's capstone page, not yet consumed anywhere).
- `GET /api/v1/runs/{runKey}/items` — already returns `caseKey` + `currentStatus` per
  item, everything needed to diff two runs case-by-case.

A full visual design pass (Pepe, Fable 5) grounded every layout/component decision in
the app's existing conventions — see the published mock referenced in tasks.md and the
Decisions section below for what was reused vs. newly designed.

## Goals / Non-Goals

**Goals:**
- Let a user compare two closed runs (same project) and see what regressed, improved,
  or stayed the same at the item level, plus what cases were added/removed between them.
- Make the common case (comparing a run to its suite's immediately-prior closed run)
  reachable in one click from `RunPage.tsx`.
- Compute the diff server-side so the same data is usable by MCP agents later, per the
  epic's "UI and agents both consume this" framing.

**Non-Goals:**
- Comparing open (in-progress) runs, or runs from different projects.
- Detecting content drift (a case's title/steps changing between the two pinned
  versions) — only verdict transitions are diffed. A real scope cut, not a silent gap;
  `VersionDetailDialog`'s existing field-diff covers content drift for a single case
  already, if this is ever wanted for comparison too.
- Any change to `RunStatusBreakdown.tsx` itself — reused exactly as-is.

## Decisions

**1. Server-computed diff, new endpoint `GET /api/v1/runs/{runKey}/compare/{otherRunKey}`
(+ public variant).**
Fetches both runs' items, joins by `caseKey`, categorizes:
- **Regressed**: pass → (failed | blocked)
- **Improved**: (failed | blocked) → pass
- **Unchanged**: present in both, any other same-or-equivalent transition
- **Added**: present only in the newer run
- **Removed**: present only in the older run

"Older/newer" is always resolved by `createdAt`, regardless of which key appears first
in the URL — `{runKey}` and `{otherRunKey}` are just two run keys, not an implied order.
Both runs must be closed and belong to the same project; otherwise 400. Response shape:

```
RunComparison:
  olderRun: { runKey, runName, createdAt, total, counts }   # RunStatusBreakdown-shaped
  newerRun: { runKey, runName, createdAt, total, counts }
  regressed: RunComparisonItem[]
  improved: RunComparisonItem[]
  unchanged: RunComparisonItem[]
  added: RunComparisonItem[]
  removed: RunComparisonItem[]

RunComparisonItem: { caseKey, caseTitle, statusOlder?, statusNewer? }
  # statusOlder absent for Added, statusNewer absent for Removed
```

**Scale note (flagged by Pepe's review, resolved here):** this joins both runs' full
item lists in memory, same order of magnitude as `RunPage.tsx`'s existing per-run item
fetch — no new scale class introduced, but also no virtualization. Acceptable for now
(matches the existing `RunPage.tsx` item list, which also isn't virtualized); revisit if
a project's run sizes grow enough to matter, same threshold that would already be a
problem for `RunPage.tsx` today.

**2. Two routes, matching this app's existing addressing convention: runs are
addressed directly by key (`/runs/:runKey`, not nested under a project — confirmed by
the existing "Routes address projects, cases, runs, and suites by key" requirement),
while the picker itself needs project scoping since it's reached from within a
project's context.**
- `/projects/{projectKey}/runs/compare` (new `RunComparePickerPage.tsx`, small) — two
  `<select>`s scoped to that project's closed runs, reusing `RunsPage.tsx`'s existing
  closed-runs query. Submitting navigates to the comparison route below.
- `/runs/compare/{runKeyA}/{runKeyB}` (new `RunComparePage.tsx`, the actual comparison)
  — self-sufficient like `RunPage.tsx`, no project context needed in the URL. If a
  back-link to the project is needed, fetch either run's own `Run` record
  (`GET /runs/{runKey}`, already returns `projectKey`) rather than adding a field to
  `RunComparison`'s response.
Both routes register in `PROJECT_CONTENT_ROUTES` (anonymous-capable, matching every
other run-related route) rather than `ACCOUNT_ONLY_ROUTES`.

**3. Visual layout — Pepe's decisions, reusing existing components/patterns
throughout rather than inventing new diff chrome:**
- **Header**: two `Card`s side by side (stacks to a column under 640px), each an exact
  instance of `RunPage.tsx`'s existing chart-card pattern (`tp-label` caption "OLDER
  RUN"/"NEWER RUN", run name, status `Badge`, suite/date meta line copied verbatim, then
  `RunStatusBreakdown` unmodified). A small arrow chip between them (rotates 90° on
  mobile) is the only new visual element in the header — left/right position + the
  caption is the whole "older vs newer" signal, no new color coding invented.
- **Regressed/Improved**: each its own `Card`, header uses `TrendingDownIcon`/
  `TrendingUpIcon` tinted `text-destructive`/`text-primary`, count as plain text
  (`{label} · {count}`, matching `RunPage.tsx`'s own status sub-group convention — not a
  `Badge`, per the design system's badge-is-for-fixed-enums rule). Rows reuse
  `RunItemRow`'s shape (title + muted meta line + status indicator) and
  `ContentDiffView.tsx`'s existing "old → new" transition glyph (old value `opacity-55`,
  new at full opacity) — the one existing "diffing two versions of a thing" idiom in the
  codebase, reused rather than duplicated. Row background: `border-destructive/20
  bg-destructive/5` (Regressed) / `border-primary/20 bg-primary/5` (Improved) — the
  exact tint recipe already validated elsewhere (`CaseStepsList.tsx`'s expected-result
  callout), deliberately diverging from that callout's "never tint verdict-adjacent
  content" rule since here the content *is* a verdict transition, not descriptive text.
- **Unchanged**: collapsed by default, expand/collapse via the same `ChevronRightIcon`
  rotate idiom `ProjectLandingPanels.tsx` already uses for inline expansion — not
  `CaseSidebarSection` (that's for a desktop/mobile breakpoint duality, not an
  always-collapsed state) and not native `<details>`. Expanded rows are the plainest
  version of the row shape (no tint, no border, just title + a single `StatusBadge`).
- **Added/Removed**: two-column grid below Unchanged (Removed left / Added right,
  mirroring the header's older-left/newer-right spatial logic), plainest treatment on
  the page — reuses `ContentDiffView.tsx`'s exact added/removed text vocabulary (plain
  for Added, `muted` + `line-through` for Removed).
- **Edge states**: a fully-unchanged comparison (no Regressed, no Improved) collapses
  those two buckets into one full-width dashed void-card (`CaseStepsList.tsx`'s empty-
  state recipe) with a teal "healthy" icon — one clear void, not two independently-empty
  boxes sitting next to populated siblings. A near-zero-overlap comparison (mostly
  Added/Removed) does **not** reuse that good-news framing — an inline notice above the
  buckets (`RunPage.tsx`'s "Showing X of Y" text idiom) states how few cases ran in both
  runs, so the near-empty Regressed/Improved/Unchanged sections read as "nothing to
  compare" rather than false reassurance.

**4. Sample Project showcase.** `seed.go` gets a second run added to an existing
suite-linked project with at least one case that genuinely regressed (pass → failed)
between the two runs, and ideally one that recovered (failed → pass), so the comparison
view has real data to demonstrate rather than only synthetic/empty states.

## Risks / Trade-offs

- **[Risk]** The comparison endpoint's in-memory join isn't virtualized/paginated. →
  **Mitigation:** same order of magnitude as `RunPage.tsx`'s existing unvirtualized item
  fetch — not a new scale problem, just an existing one this feature doesn't make worse.
- **[Risk]** Content drift (case title/steps changing between pinned versions) is
  invisible in this diff. → **Mitigation:** explicit Non-Goal, not a silent gap —
  `VersionDetailDialog` already covers content diffing for a single case.
- **[Risk]** "Compare to previous run" quick action requires suite-trend data the page
  may not already have loaded. → **Mitigation:** `RunPage.tsx` already fetches suite
  info when `run.suiteKey` is set (for the "From suite" link) — extending that fetch to
  include the trend (or a lighter "is there a prior closed run" check) is a small
  addition to an existing call, not a new data-fetching pattern.

## Migration Plan

No data migration. New endpoint, new route, new seed content — all additive. Existing
`RunStatusBreakdown`/`RunPage.tsx`/suite-trend code paths are reused unchanged.

## Open Questions

None outstanding — visual design fully resolved by Pepe's pass; scale/content-drift
concerns explicitly scoped out above rather than left ambiguous.
