## ADDED Requirements

### Requirement: Suite pass-rate trend
The system SHALL let a user query a suite's pass-rate trend: its closed runs, ordered oldest to newest, each with its full status-count breakdown. Open runs SHALL be excluded from the trend, since their in-progress counts do not represent a completed outcome. A suite with no closed runs SHALL return an empty trend rather than an error.

#### Scenario: A suite's closed runs appear in the trend, oldest first
- **WHEN** a suite has been used to create three closed runs, created in sequence
- **THEN** the trend lists all three runs ordered from oldest to newest, each with its own status-count breakdown

#### Scenario: An open run is excluded from the trend
- **WHEN** a suite has one closed run and one still-open run
- **THEN** the trend includes only the closed run

#### Scenario: A suite with no closed runs has an empty trend
- **WHEN** a suite has never been used to create a run, or all its runs are still open
- **THEN** the trend is returned as an empty list, not an error
