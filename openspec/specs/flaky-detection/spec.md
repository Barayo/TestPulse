# flaky-detection

## Purpose

Promotes flakiness from an incidental per-version badge (visible only inside a case
version's execution-history dialog) to a first-class, queryable signal: a computed
rate per case, scoped to its current version, and a project-scoped query for every
currently-flaky case — so "which cases are flaky right now" is answerable without
opening cases one at a time.

## Requirements

### Requirement: Per-case flakiness signal
The system SHALL compute a case's flakiness as a rate and a boolean, scoped to the
case's *current version* only: among that version's `pass`/`failed`/`blocked`
executions (excluding `pending`/`skipped`/`retest`), the rate SHALL be
`min(passCount, failedOrBlockedCount) / (passCount + failedOrBlockedCount)`, and the
case SHALL be considered currently flaky when that rate is greater than zero. A case
whose current version has fewer than one execution of each outcome (all-pass, all-fail,
or no executions at all) SHALL have a rate of zero and SHALL NOT be considered flaky.

#### Scenario: Mixed results on the current version are flaky
- **WHEN** a case's current version has 2 `pass` and 1 `failed` execution
- **THEN** its flakiness rate is greater than zero and it is reported as currently flaky

#### Scenario: All-pass current version is not flaky
- **WHEN** a case's current version has only `pass` executions
- **THEN** its flakiness rate is zero and it is not reported as currently flaky

#### Scenario: A case with no executions on its current version is not flaky
- **WHEN** a case's current version has never been executed
- **THEN** its flakiness rate is zero and it is not reported as currently flaky

#### Scenario: Flakiness resets when a new version is created
- **WHEN** a case's current version was flaky, and the case is then edited, creating a new version with no executions yet
- **THEN** the case's flakiness rate is zero under the new current version

### Requirement: Querying currently-flaky cases for a project
The system SHALL let a caller with `read` permission on a project list every currently
flaky case in that project — key, title, current version, and flakiness rate —
computed by a single server-side query, not a per-case loop. A project with no
currently flaky cases SHALL return an empty list, not an error.

#### Scenario: Flaky cases are listed for a project
- **WHEN** a project has three cases, two of which are currently flaky
- **THEN** querying the project's flaky cases returns exactly those two, each with its key, title, rate, and current version

#### Scenario: A project with no flaky cases returns an empty list
- **WHEN** none of a project's cases are currently flaky
- **THEN** querying the project's flaky cases returns an empty list
