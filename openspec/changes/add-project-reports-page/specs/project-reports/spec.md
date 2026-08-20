## ADDED Requirements

### Requirement: Project-wide run status summary
The system SHALL let a caller with `read` permission on a project retrieve
an aggregate count of every run item's current status across every run in
that project, open and closed alike, grouped by status. The response
SHALL carry a `total` and a `counts` map keyed by status
(`pending`/`pass`/`failed`/`skipped`/`blocked`/`retest`), matching the
shape a single run's own summary already returns, minus the run
identifier. An anonymous visitor to a public project SHALL be able to
retrieve the same aggregate via a public equivalent endpoint, matching the
existing public/authenticated pairing used by every other project-scoped
read endpoint.

#### Scenario: Aggregate spans every run regardless of open/closed status
- **WHEN** a project has both open and closed runs with recorded verdicts
- **THEN** the status summary's counts include run items from every run,
  not only open ones

#### Scenario: A project with no runs yet returns a zeroed summary
- **WHEN** a project has no runs
- **THEN** the status summary returns `total: 0` and an empty counts map,
  rather than an error

#### Scenario: Public visitor reads the summary for a public project
- **WHEN** an anonymous visitor requests the status summary for a project
  configured for anonymous access
- **THEN** the same aggregate is returned via the public endpoint, without
  requiring authentication

### Requirement: Project Reports page
The web UI SHALL provide a dedicated page per project at
`/projects/{projectKey}/reports`, reachable from a "Reports" panel on the
project's landing page, showing three sections: a project-wide status
breakdown (the same bar-and-legend component a single run's page already
uses, fed by the project-wide status summary), a list of the project's
currently-flaky cases sorted by descending flakiness rate with each row
linking to that case's own detail page, and an entry point into the
existing run comparison picker. The landing page's own Reports panel
SHALL show, without navigating away, the project-wide pass rate and a
count of currently-flaky cases, with a single action linking to the full
Reports page.

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
