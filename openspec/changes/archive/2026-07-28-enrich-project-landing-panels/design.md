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
- No new backend aggregate for suite pass rate — `rework-suites-landing-ux`
  already adds a batched `PassRate`/`LastRunAt` to `domain.Suite`
  (`SuiteRepo.List`'s existing query, one extra grouped query for every suite
  in the project); this change reuses that field.
- No recursive case-count rollups in the Library panel's magnitude bar — same
  direct-count-only precedent as `rework-library-ux`.

## Decisions

- **Suite pass rate on this page reuses `rework-suites-landing-ux`'s batched
  `domain.Suite.PassRate`** (already returned by `GET /projects/{projectKey}/suites`,
  no separate call needed) rather than a second read of the same data. This
  change therefore depends on `rework-suites-landing-ux` landing first, not
  on `add-suite-pass-rate-trend` (corrected — the trend endpoint's per-suite,
  closed-runs-only shape was never right for a panel of many suites; see
  `rework-suites-landing-ux/design.md`'s revised Decisions for why).
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

- [Depending on `rework-suites-landing-ux` landing first, for its batched
  suite pass-rate field] → Sequencing captured in the priority ordering
  (this change is priority #7, after #3).
- [Library panel's inline expand adds a small piece of interactive state to a
  page that's meant to stay a lightweight landing] → Scoped to a single
  toggle per row, no persistence, no navigation — low risk of scope growth.

## Migration Plan

Pure frontend change (plus the shared pass-rate-trend backend dependency
already covered elsewhere). Ships as a regular deploy.
