## MODIFIED Requirements

### Requirement: Project Reports page
The web UI SHALL provide a dedicated page per project at
`/projects/{projectKey}/reports`, reachable from a "Reports" panel on the
project's landing page, showing three sections: a project-wide status
breakdown (the same bar-and-legend component a single run's page already
uses, fed by the project-wide status summary), a list of the project's
currently-flaky cases sorted by descending flakiness rate with each row
linking to that case's own detail page, and an entry point into the
existing run comparison picker. The landing page's own Reports panel
SHALL show, without navigating away, the project-wide pass rate, a
compact sparkline of the last 10 runs' pass rates (oldest to newest), a
count of currently-flaky cases, and up to the 3 highest-rate flaky cases
(title and rate, each linking to that case's own detail page) sorted by
descending flakiness rate, with a single action linking to the full
Reports page. When more than 3 flaky cases exist, the panel SHALL show a
"see more" affordance linking to the full Reports page's complete flaky
cases list, matching the "see all N" idiom already used by the landing
page's other panels.

#### Scenario: Reports page assembles all three sections
- **WHEN** a user with read access to a project opens its Reports page
- **THEN** the page shows the project-wide status breakdown, a flaky
  cases list, and a way to start a run comparison

#### Scenario: Flaky cases are sorted by rate, most volatile first
- **WHEN** the Reports page's flaky cases list has more than one entry
- **THEN** the case with the highest flakiness rate appears first

#### Scenario: A flaky case row links to its own page
- **WHEN** a user clicks a row in the Reports page's flaky cases list
- **THEN** the app navigates to that case's own detail page

#### Scenario: Landing panel teases the Reports page without navigating away
- **WHEN** a user views the project landing page
- **THEN** a "Reports" panel shows the project's overall pass rate and
  flaky-case count, with a single "Open Reports" action linking to the
  full page

#### Scenario: Empty project shows an honest empty state, not run-scoped copy
- **WHEN** a project with no runs yet opens its Reports page
- **THEN** the status breakdown section shows project-scoped empty-state
  copy, not the wording a single run's own empty status breakdown uses

#### Scenario: Landing panel lists the top flaky cases, not just a count
- **WHEN** a project has 1 to 3 currently-flaky cases
- **THEN** the landing page's Reports panel shows every one of them as a
  row (title and rate, descending by rate), each linking to that case's
  own detail page, and shows no "see more" affordance

#### Scenario: Landing panel truncates to 3 with a "see more" affordance
- **WHEN** a project has more than 3 currently-flaky cases
- **THEN** the landing page's Reports panel shows only the 3
  highest-rate cases as rows, followed by a "see more" affordance
  linking to the full Reports page's complete flaky cases list

#### Scenario: No flaky cases means no list, only the existing empty pill
- **WHEN** a project has zero currently-flaky cases
- **THEN** the landing page's Reports panel shows no flaky-case rows and
  no "see more" affordance, unchanged from today's zero-count display

#### Scenario: Sparkline shows the trend across the last 10 runs
- **WHEN** a project has 10 or more runs
- **THEN** the landing page's Reports panel shows a 10-bar sparkline,
  oldest run on the left and most recent on the right, each bar's height
  proportional to that run's pass rate

#### Scenario: Sparkline shows fewer bars for a project with under 10 runs
- **WHEN** a project has between 1 and 9 runs
- **THEN** the sparkline shows exactly that many bars, oldest to newest,
  rather than padding with empty placeholders

#### Scenario: No sparkline for a project with zero runs
- **WHEN** a project has no runs yet
- **THEN** the landing page's Reports panel shows no sparkline, unchanged
  from today's no-runs empty state
