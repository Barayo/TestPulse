## Context

`ProjectPage.tsx` + `ProjectLandingPanels.tsx` implement the three-panel landing
(`enrich-project-landing`, already shipped): Library/Suites/Recent runs, each capped to
top items, plus a flat summary strip. Confirmed by reading the components: only
`RunsPanel` has any colored-by-health treatment today; `SuitesPanel`/`FoldersPanel` are
bare text. `ProjectsPage.tsx` (the all-projects list) already has the richer
`StatusPill`/`ProgressBar` card treatment this change is bringing to the landing panels.
A Pepe/Fable-5 mockup (`mockup.html`, this directory), user-approved, is the visual/
interaction source of truth — independent research (general dashboard/summary-panel
conventions) converged on the same two calls: distinct stat tiles over a flat row, and
exactly one secondary signal per panel row rather than maximal density.

## Goals / Non-Goals

**Goals:**
- Summary strip reads as three distinct cells, not one flat line.
- Library and Suites panels reach the same visual richness `RunsPanel` and
  `ProjectsPage.tsx` cards already have.
- Recent runs becomes deliberately the richest panel, reflecting it's the
  highest-frequency scan on this page.

**Non-Goals:**
- No IA change — panel count, capping behavior, "see all" links, and the
  empty-project getting-started checklist are already-settled behavior from
  `enrich-project-landing`; this change is visual only.
- No new backend aggregate beyond what `add-suite-pass-rate-trend` already
  provides for suite pass rate — see that change and `rework-suites-landing-ux`
  for the shared dependency.
- No recursive case-count rollups in the Library panel's magnitude bar — same
  direct-count-only precedent as `rework-library-ux`.

## Decisions

- **Suite pass rate on this page reuses the same source as
  `rework-suites-landing-ux`** (`add-suite-pass-rate-trend`'s `SuiteTrend`,
  latest point) rather than a third parallel read of the same underlying data.
  Both changes share this dependency; landing the trend endpoint unblocks both.
- **The Library panel's inline expand is a light preview, not a tree.** Only
  the panel row itself toggles open/closed to show immediate children inline
  (matching the mockup's "Regression" demo) — full navigation still goes
  through the Library page itself, not a nested browser embedded in the
  landing panel.
- **Recent runs gets more visual weight deliberately**, not because it's
  "more important" abstractly, but because "what happened lately" is the
  highest-frequency scan per the independent research pass — this is a
  content-driven layout decision, not decoration.

## Risks / Trade-offs

- [Depending on `add-suite-pass-rate-trend` landing first, shared with
  `rework-suites-landing-ux`] → Both changes should land after (or bundle) that
  backend work; sequencing captured in the priority ordering, not duplicated
  here.
- [Library panel's inline expand adds a small piece of interactive state to a
  page that's meant to stay a lightweight landing] → Scoped to a single
  toggle per row, no persistence, no navigation — low risk of scope growth.

## Migration Plan

Pure frontend change (plus the shared pass-rate-trend backend dependency
already covered elsewhere). Ships as a regular deploy.
