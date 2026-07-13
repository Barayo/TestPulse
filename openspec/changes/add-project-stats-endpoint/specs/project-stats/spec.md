## ADDED Requirements

### Requirement: Batched project summary endpoint
The system SHALL expose a single endpoint that returns, for every
non-archived project, its suite count, case count, and latest-run pass
rate — computed server-side so that a client listing or searching all
projects makes exactly one request regardless of how many projects exist.

#### Scenario: Listing summaries for all projects
- **WHEN** a client calls `GET /api/v1/projects/summaries`
- **THEN** the response is an array with one entry per non-archived
  project, each containing `projectId`, `suiteCount`, `caseCount`, and
  `passRate`

#### Scenario: Project with no runs yet
- **WHEN** a project has zero runs
- **THEN** its summary entry's `passRate` is `null`, not an error and not
  a computed value

#### Scenario: Pass rate reflects only the most recent run
- **WHEN** a project has multiple runs with different outcomes
- **THEN** the summary's `passRate` is computed from the run created most
  recently, not an average or aggregate across all of the project's runs

#### Scenario: Request count stays constant as project count grows
- **WHEN** the number of projects in the system increases
- **THEN** a client fetching all project summaries still makes exactly one
  HTTP request, not one request per project
