## Context

The project detail page (`ProjectPage.tsx`) renders three panels —
Library, Suites, Recent runs — each capped to its top 4 items via
`useProjectLanding()`. This was reviewed against two real seeded projects
(`make seed-demo`'s Banca Móvil and Desktop App) on desktop, and Desktop
App additionally on mobile via the user's own device. Findings, in
priority order:

1. No health signal on the page — you have to open Recent runs and
   mentally average percentages yourself.
2. Visual identity gap — plain bordered boxes, unlike the polished
   `ProjectsPage` cards.
3. Recent runs rows don't scan for risk — plain bar + number, no color.
4. Empty state has no narrative — three independent silent boxes.
5. Fixed 4-row cap undercounts a mature project's content for no
   real reason.

A sixth finding (the global header overflowing on mobile) was scoped out
and fixed separately (issue #31, `49187d5`) since it was app-wide chrome,
not specific to this page, and had no design ambiguity to resolve.

## Goals / Non-Goals

**Goals:**
- Surface the same health signal (`StatusPill`/`ProgressBar`) on the
  detail page that the list already shows for this project.
- Make Recent runs rows scannable by risk, not just by reading numbers.
- Give a genuinely empty project a real "what do I do first" moment.
- Bring panel-shell visual weight in line with `ProjectsPage`.

**Non-Goals:**
- Fixing `useProjectLanding()`'s own scaling shape (it fetches every
  case/suite/run in a project to compute panel totals/top-N lists
  client-side) — real, but pre-existing, and a bigger change than this
  one; flagged as a risk below, not addressed here.
- Sortable/paginated panels, or showing more than the top N items inline
  — the existing "top items + see all" model (ui-navigation's own
  requirement) isn't being revisited, just the visual/informational
  layer around it.
- Any new backend endpoint — every field needed already exists on
  `ProjectSummary`.

## Decisions

**Summary strip data source: `useProjectSummaries()`, filtered to this
project — not `useProjectLanding()`.**
`useProjectLanding()` already fetches every folder, case, suite, and run
in the project just to compute the panel lists — extending it to also
produce project-level totals would mean deriving a count that
`/api/v1/projects/summaries` already computes server-side, redundantly,
client-side. `useProjectSummaries()` is the same hook `ProjectsPage`
already uses; filtering its array to the active `projectId` costs one
more `Array.find()`, no new network pattern, no new backend work.

**Color-code Recent runs rows via `statusBorderClass`, reusing the same
band thresholds as everywhere else.**
No new color logic — `HealthBar.tsx` already exports this function for
exactly this purpose (the project list's expanded cards use it as a
left-edge accent). Applying it as a left border or dot on each run row
keeps the "same bands, different visual output per context" pattern
already established rather than inventing a fourth treatment.

**All-empty checklist only replaces the panels when literally nothing
exists (no cases in any section, no suites, no runs) — not per-panel.**
A project with cases but no suites yet should still see Suites' own
"no suites yet" empty state, not a project-wide takeover — this mirrors
the existing "Empty project shows per-panel empty states" scenario,
which stays true for the *mixed* case. The new all-empty scenario is
additive, not a replacement of that one.

**Panel row cap: revisit as a task, not a proposal-level decision.**
Whether it becomes count-adaptive or just raises from 4 to a higher
fixed number is an implementation detail with no real design ambiguity
once the summary strip exists above it (the strip, not the panels, now
carries the "how healthy is this project" signal) — doesn't need its
own design decision here.

## Risks / Trade-offs

- **`useProjectLanding()`'s client-side aggregation doesn't scale** — a
  project with thousands of cases would fetch all of them just to show
  four rows and a count. Not fixed here (would be its own change); noted
  so a future session doesn't miss it, per the standing aggregation-
  performance caution.
- **Fetching all project summaries to show one project's strip** is the
  same trade-off `ProjectsPage` already makes today (no pagination, see
  backlog #29) — consistent with existing behavior, not a new cost
  introduced by this change.

## Open Questions

None outstanding.
