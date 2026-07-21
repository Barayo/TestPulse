## ADDED Requirements

### Requirement: Querying executions by case version
The system SHALL let a caller list every execution (run item) that has ever pinned a given
case, across all runs, grouped by the pinned version, with each execution's run and current
status — not scoped to a single run the way the run execution board's item list is.

#### Scenario: Executions grouped by version
- **WHEN** a case has been included in three different runs, two of which pinned version 1 and one of which pinned version 2
- **THEN** querying the case's executions returns all three, each annotated with its pinned version, run, and current status

#### Scenario: A case with no execution history
- **WHEN** a case has never been added to any run
- **THEN** querying the case's executions returns an empty list, not an error
