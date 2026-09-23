## Why

As a project member, when I glance at the dashboard's Reports panel, I want to see *which* cases are flaky, not just how many, so I can act without leaving the page. The panel already fetches the full flaky-case list on every dashboard load and throws it away down to a count — the dashboard's least actionable signal today, fixable with zero new backend calls.

## What Changes

- Reports panel on the project landing page renders up to 3 flaky-case rows (title, link to the case, flake rate) beneath the existing "N flaky · cases to watch" pill, sorted by rate descending.
- A "···N more" affordance appears when more than 3 flaky cases exist, reusing the existing `seeAllLabel` idiom already used by `SuitesPanel`/`RunsPanel`.
- No new API calls: the rows are sourced from the `FlakyCase[]` array `useProjectReportsTeaser` already fetches from the same `flaky-cases` endpoint — the hook itself currently discards the array down to `flakyRes.data?.length`, so it needs a small change to expose the array (or its top slice) alongside the count, not just the count.
- Sample Project seed data reviewed to confirm it produces more than 3 flaky cases, so the "···N more" truncation path is demonstrated, not just the ≤3 case.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `project-reports`: the "Project Reports page" requirement's landing-panel scenario changes from "shows the project-wide pass rate and flaky-case count" to also showing the top 3 flaky cases by rate, each linking to its case detail page, with a "see more" affordance when the list is longer.

## Impact

- **Frontend only**: `apps/web/src/components/ProjectLandingPanels.tsx` (`ReportsPanel`) and `apps/web/src/lib/useProjectReportsTeaser.ts` (expose the flaky-case rows, not just the count), plus their test files.
- No backend, API contract, or migration changes — the `flaky-cases` endpoint already returns everything needed (`caseKey`, `caseTitle`, `currentVersion`, `rate`); it's already called today, just under-used.
- `apps/api/internal/sampledata/seed.go` reviewed (and updated if needed) so the Sample Project showcases the truncated ("···N more") state, per this project's standing Sample-Project-showcase rule.
- `docs/test-management.md` updated if it documents the Reports panel's current teaser behavior.
