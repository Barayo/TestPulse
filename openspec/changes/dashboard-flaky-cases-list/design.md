## Context

`useProjectReportsTeaser.ts:42-55` already fetches the full `FlakyCase[]` array (from the same `flaky-cases`/`public/flaky-cases` endpoint `ProjectReportsPage.tsx` uses) on every dashboard load, but collapses it to `flakyRes.data?.length` before handing it to `ReportsPanel`, which renders only a count pill. This is a small, two-file frontend change — no new architecture, dependency, or data flow, so this design doc stays short.

`ReportsPanel` currently carries a deliberate prior-change comment (`ProjectLandingPanels.tsx:371-376`, from `add-project-reports-page` design.md D7): "a summary *across* the other three panels, not a fourth peer list... never 'see all N ›' — this panel summarizes, it doesn't list." This change intentionally supersedes that constraint for the flaky-cases sub-section specifically — the data is already being fetched and paid for, and Pepe's dashboard-enrichment review judged the count-only pill the single least actionable signal on the page. The panel's status-breakdown half keeps its summarize-only behavior unchanged; the comment needs updating, not the whole panel's role.

## Goals / Non-Goals

**Goals:**
- Surface the top 3 flaky cases (by rate, descending) inline in the existing Reports panel, each linking to its case detail page.
- Show a "see more" affordance when there are more than 3.
- Zero new network calls.

**Non-Goals:**
- Changing the dedicated Reports page's own (already-complete) flaky cases list — this change touches only the landing-panel teaser.
- Any backend or `useProjectReportsTeaser` data-shape change — the array and its fields (`caseKey`, `caseTitle`, `currentVersion`, `rate`) are already sufficient.
- Pagination or interaction beyond "see more" linking to the full Reports page (the existing pattern for every other panel's overflow).

## Decisions

**`useProjectReportsTeaser` returns the full sorted `FlakyCase[]` array (as `flakyCases`), alongside the existing `flakyCount`, rather than a pre-truncated top-3.** Sort by `rate` descending using the exact same `.slice().sort((a, b) => b.rate - a.rate)` pattern `ProjectReportsPage.tsx:49` already uses (the backend's `flaky-cases` endpoint orders by case key, not rate — confirmed via `store/flaky.go:27`'s `ORDER BY c.key`, so sorting is a client concern in both places already, not new). Keep `flakyCount` as a separate field (rather than deriving it as `flakyCases.length` at every call site) since it's already the established field name and shape other code may rely on. Truncation to 3 stays in `ReportsPanel`, since "how many rows this particular panel shows" is a presentation concern, not something the shared hook should bake in.

**Cap at 3 rows, matching Pepe's reviewed design.** Alternative considered: make the cap configurable — rejected, no second caller exists and every sibling panel (`SuitesPanel`, `RunsPanel`) hardcodes its own cap the same way.

**Reuse the existing `seeAllLabel` idiom for overflow**, linking to `/projects/:projectKey/reports` (the full Reports page, which already lists every flaky case sorted the same way per the `project-reports` spec's existing "Flaky cases are sorted by rate" scenario) rather than expanding inline. Keeps this panel a teaser, consistent with every other landing panel's role.

**Flake rate styling reuses the existing destructive-tint token** already used elsewhere for warning-severity numeric badges, rather than introducing a new visual treatment.

## Risks / Trade-offs

- [Risk] Sample Project may not currently seed more than 3 flaky cases, leaving the "see more" path undemonstrated → Mitigation: task explicitly checks seed.go's flaky-case count and adds more if needed, per CLAUDE.md's Sample-Project-showcase rule.
- [Risk] Long case titles could overflow the panel's fixed width → Mitigation: reuse the existing `truncate`/`line-clamp` Tailwind utility already applied to other panel rows in this file, not a new pattern.

## Migration Plan

None — additive frontend-only change, no data migration, no API contract change, no feature flag needed (small enough to ship directly).
