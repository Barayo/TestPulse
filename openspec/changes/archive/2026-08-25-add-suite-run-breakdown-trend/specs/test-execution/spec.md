## MODIFIED Requirements

### Requirement: Suite pass-rate trend
The system SHALL let a user query a suite's pass-rate trend: its closed runs, ordered oldest to newest, each with its full status-count breakdown. Open runs SHALL be excluded from the trend by default, since their in-progress counts do not represent a completed outcome. A suite with no closed runs SHALL return an empty trend rather than an error. The trend SHALL be capped to the suite's most recent 15 qualifying runs, still ordered oldest to newest within that window, rather than growing unbounded as a suite accumulates history. An `includeOpen` option SHALL additionally include the suite's current open run, if one exists, as a trailing point after the closed ones, marked as open so callers can render it distinctly from a settled, closed run's counts.

#### Scenario: A suite's closed runs appear in the trend, oldest first
- **WHEN** a suite has been used to create three closed runs, created in sequence
- **THEN** the trend lists all three runs ordered from oldest to newest, each with its own status-count breakdown

#### Scenario: An open run is excluded from the trend by default
- **WHEN** a suite has one closed run and one still-open run, and `includeOpen` is not set
- **THEN** the trend includes only the closed run

#### Scenario: A suite with no closed runs has an empty trend
- **WHEN** a suite has never been used to create a run, or all its runs are still open
- **THEN** the trend is returned as an empty list, not an error

#### Scenario: The trend is capped to the most recent 15 runs
- **WHEN** a suite has more than 15 closed runs
- **THEN** the trend includes only the 15 most recent, still ordered oldest to newest within that window

#### Scenario: includeOpen adds the current open run as a trailing point
- **WHEN** a suite has closed runs and one current open run, and the caller requests `includeOpen`
- **THEN** the trend's last point is the open run, marked as open, after every closed point

#### Scenario: includeOpen with no current open run is unaffected
- **WHEN** a suite has only closed runs (no open run exists) and the caller requests `includeOpen`
- **THEN** the trend is identical to the default (closed-only) trend
