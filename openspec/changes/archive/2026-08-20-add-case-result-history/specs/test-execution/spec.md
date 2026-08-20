## MODIFIED Requirements

### Requirement: Querying executions by case version
The system SHALL let a caller list every execution (run item) that has ever pinned a given
case, across all runs, grouped by the pinned version, with each execution's run and current
status — not scoped to a single run the way the run execution board's item list is. The
system SHALL additionally let a caller request the case's most recent executions ordered
strictly by recency (`created_at` descending) rather than by pinned version, bounded by a
caller-supplied limit, so a caller does not need to fetch the case's entire execution
history to show a short recent-activity window.

#### Scenario: Executions grouped by version
- **WHEN** a case has been included in three different runs, two of which pinned version 1 and one of which pinned version 2
- **THEN** querying the case's executions returns all three, each annotated with its pinned version, run, and current status

#### Scenario: A case with no execution history
- **WHEN** a case has never been added to any run
- **THEN** querying the case's executions returns an empty list, not an error

#### Scenario: Requesting recent executions ordered by recency
- **WHEN** a caller requests a case's executions with recency ordering and a limit, and an older pinned version was restored so it now has the most recent timestamp
- **THEN** the returned executions are ordered strictly by when they occurred, most recent first — not by pinned version number — and the restored older version's most recent execution sorts first

#### Scenario: Recent-executions request is capped
- **WHEN** a caller requests a case's recent executions with a limit smaller than its total execution count
- **THEN** only that many executions are returned, the most recent ones, and the underlying query never fetches the case's full history to produce them

#### Scenario: Recent-executions request rejects an unbounded or excessive limit
- **WHEN** a caller requests recency-ordered executions without a limit, or with a limit above the system's maximum
- **THEN** the request is rejected rather than silently returning the case's entire history
