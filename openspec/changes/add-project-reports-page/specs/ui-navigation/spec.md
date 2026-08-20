## MODIFIED Requirements

### Requirement: Project landing shows top-level structure only
A project's landing page SHALL show three independent panels — Library, Suites, and Recent
runs — each limited to its top items with a "see all" control linking to the full view,
rather than the project's entire content at once, and every item row shown SHALL itself
link directly to that item, not just to the panel's own full-list view. Below those three,
a fourth, full-width Reports panel SHALL summarize the project's overall status (a status
breakdown bar and pass rate, plus a flaky-case count) without requiring navigation away
from the landing page, linking to the full Reports page via a single "Open Reports" action
rather than a "see all N" control, since it summarizes rather than lists. The Library panel
SHALL include a visible entry for test cases that live directly in the project's root
section, not only for named subsections, so a case created before any subsection existed
is never invisible there. Above the panels, the landing SHALL show a summary of the
project's own status as three distinct cells: a health ring with status label, suite/case
count tiles, and a last-run preview (time, run name, and pass rate) rather than a bare
timestamp. Each Library panel row SHALL show a magnitude bar reflecting its case count
relative to the panel's largest section, and a section with subsections SHALL support
expanding inline to preview its immediate children without navigating away. Each Suites
panel row SHALL show a colored pass-rate bar and percentage, or an explicit "Never run"
state for a suite with no runs yet. Each Recent runs row SHALL be color-coded by its
pass-rate band so an at-risk run is distinguishable at a glance, without reading its
percentage, and SHALL show a two-line treatment (run identity plus a pass/fail segment
bar) reflecting that it is the highest-frequency scan on this page.

#### Scenario: Dense project stays legible
- **WHEN** a project has more sections, suites, or runs than fit in a panel
- **THEN** each panel shows only its top items plus a link to the full list, not the full list inline

#### Scenario: Empty project shows per-panel empty states
- **WHEN** a project has cases or suites already, but one panel (e.g. Suites) has nothing in it yet
- **THEN** that panel shows its own empty-state message and call to action, independent of the other panels

#### Scenario: Entirely empty project shows a getting-started checklist instead of three empty panels
- **WHEN** a project has no sections with cases, no suites, and no runs at all
- **THEN** the landing shows a single getting-started checklist in place of the three panels, rather than three independent empty states

#### Scenario: Suite and run rows link directly to their item
- **WHEN** a user clicks a suite row or a run row shown on the landing
- **THEN** the user goes straight to that suite (open, ready to view/edit its cases) or that run's execution board — not just to the panel's full list

#### Scenario: Root-level cases are visible on the landing page
- **WHEN** a project has one or more test cases living directly in its root section (not inside any named subsection)
- **THEN** the Library panel shows a row representing them, distinct from named subsections, that navigates to the root section's contents when clicked

#### Scenario: Summary strip shows three distinct cells
- **WHEN** a user opens a project's landing page
- **THEN** the summary strip shows a health ring with status label, suite/case count tiles, and a last-run preview as three visually separated cells

#### Scenario: Summary strip omits last-run when the project has never run
- **WHEN** a project has no runs yet
- **THEN** the summary strip shows "No runs yet" instead of a pass rate or last-run time, matching the project list's own treatment

#### Scenario: Recent runs are color-coded by risk
- **WHEN** a project's Recent runs panel shows a run with a pass rate below 50%
- **THEN** that row is visually distinguished (e.g. a colored accent) from a healthy run's row, not just differentiated by its printed percentage

#### Scenario: Library panel rows show relative magnitude
- **WHEN** a user views the Library panel with more than one section
- **THEN** each section's row shows a bar sized relative to the panel's largest section's case count

#### Scenario: A section with subsections can be expanded inline
- **WHEN** a user clicks a Library panel row for a section that has subsections
- **THEN** its immediate children preview inline in the panel, without navigating to the Library page

#### Scenario: Suites panel rows show pass-rate health
- **WHEN** a user views the Suites panel and a suite has at least one closed run
- **THEN** its row shows a colored pass-rate bar and percentage matching the healthy/in-progress/at-risk bands

#### Scenario: A never-run suite shows a distinct state on the landing
- **WHEN** a suite shown on the landing has never had a run created from it
- **THEN** its row shows "Never run" rather than a 0% pass rate

#### Scenario: Reports panel is a fourth, full-width row below the other three
- **WHEN** a user opens a project's landing page
- **THEN** the Reports panel spans the full width below Folders, Suites, and Recent runs, rather than sitting alongside them as a fourth same-height column
