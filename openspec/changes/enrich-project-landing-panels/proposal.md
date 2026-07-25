## Why

The project landing page's summary strip and panels are functionally complete but
visually flat compared to what the rest of the app now looks like: the Library and
Suites panels are bare text rows while `ProjectsPage.tsx` and `RunsPanel` already use a
richer, colored-by-health visual language. The user asked for the same enrichment pass
already applied to Suites and Library. A Pepe/Fable-5 design pass validated via an
interactive mockup (approved by the user) is the basis for this change.

## What Changes

- Summary strip becomes three cells (divided, not a flat row): a health ring +
  status label on the left, suite/case count tiles in the middle, and a
  last-run preview (time, run name, pass rate) on the right instead of a bare
  timestamp.
- Library panel rows get a magnitude bar (case count relative to the panel's
  largest section) and a distinct dashed/italic treatment for an empty
  section; at least one section (with subsections) supports inline expand to
  preview its children without navigating away.
- Suites panel rows get the same colored pass-rate bar + percentage treatment
  Recent runs already has, with "Never run" (not a fake 0%) for a suite with
  no runs yet.
- Recent runs panel becomes the visually "senior" panel of the three (wider
  column, accent border, two-line rows with a pass/fail segment bar) — the
  highest-frequency scan on this page earns more visual weight rather than
  all three panels staying interchangeable.
- No IA change — still three independent panels, still capped to top items
  with a "see all" link, still an all-or-nothing getting-started checklist for
  a fully empty project (all already-settled behavior from
  `enrich-project-landing`, unchanged here).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-navigation`: "Project landing shows top-level structure only" gains the
  richer summary-strip layout, per-panel visual treatments, and the Library
  panel's inline expand.

## Impact

- `apps/web/src/pages/ProjectPage.tsx`, `apps/web/src/components/ProjectLandingPanels.tsx`
  — summary strip and all three panels.
- Suite pass-rate data: same dependency as `rework-suites-landing-ux` — needs
  `add-suite-pass-rate-trend`'s current-pass-rate read landed first (see that
  change's design.md for why a second parallel read shouldn't be built).
- `docs/test-management.md` — update the project landing description.
- `apps/api/internal/sampledata/seed.go` — verify the Sample Project has a
  section with subsections (to demonstrate the expand), an empty section, a
  never-run suite, and a healthy vs. at-risk suite pairing.
