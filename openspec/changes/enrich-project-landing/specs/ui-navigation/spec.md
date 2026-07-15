## MODIFIED Requirements

### Requirement: Project landing shows top-level structure only
A project's landing page SHALL show three independent panels — Library, Suites, and Recent
runs — each limited to its top items with a link to the full view, rather than the
project's entire content at once. Each panel's entire header SHALL be clickable to that
same full view, and every item row shown SHALL itself link directly to that item, not just
to the panel's own full-list view. Above the panels, the landing SHALL show a summary of
the project's own status — status label, pass-rate bar, suite/case totals, and last-run
time — matching the same presentation used on the project list. Each Recent runs row SHALL
be color-coded by its pass-rate band so an at-risk run is distinguishable at a glance,
without reading its percentage.

#### Scenario: Dense project stays legible
- **WHEN** a project has more sections, suites, or runs than fit in a panel
- **THEN** each panel shows only its top items plus a link to the full list, not the full list inline

#### Scenario: Empty project shows per-panel empty states
- **WHEN** a project has cases or suites already, but one panel (e.g. Suites) has nothing in it yet
- **THEN** that panel shows its own empty-state message and call to action, independent of the other panels

#### Scenario: Entirely empty project shows a getting-started checklist instead of three empty panels
- **WHEN** a project has no sections with cases, no suites, and no runs at all
- **THEN** the landing shows a single getting-started checklist in place of the three panels, rather than three independent empty states

#### Scenario: Panel header is clickable beyond "see all"
- **WHEN** a user clicks anywhere on a panel's header (its icon or title), not only the "see all" text
- **THEN** the user navigates to that panel's full view, same as clicking "see all"

#### Scenario: Suite and run rows link directly to their item
- **WHEN** a user clicks a suite row or a run row shown on the landing
- **THEN** the user goes straight to that suite (open, ready to view/edit its cases) or that run's execution board — not just to the panel's full list

#### Scenario: Summary strip shows the project's own status
- **WHEN** a user opens a project's landing page
- **THEN** a summary strip above the panels shows the project's status label, pass-rate bar, suite count, case count, and time since its last run — the same data and presentation the project list already shows for it

#### Scenario: Summary strip omits last-run when the project has never run
- **WHEN** a project has no runs yet
- **THEN** the summary strip shows "No runs yet" instead of a pass rate or last-run time, matching the project list's own treatment

#### Scenario: Recent runs are color-coded by risk
- **WHEN** a project's Recent runs panel shows a run with a pass rate below 50%
- **THEN** that row is visually distinguished (e.g. a colored accent) from a healthy run's row, not just differentiated by its printed percentage
