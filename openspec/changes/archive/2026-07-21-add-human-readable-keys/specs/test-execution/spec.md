## MODIFIED Requirements

### Requirement: Run creation pins case versions
The system SHALL let users create a test run from a suite and/or an explicit list of cases. Each run item MUST pin the case version that is current at the moment the item is added to the run, and that pin SHALL never change afterwards. Every run SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI.

#### Scenario: Run pins versions at creation
- **WHEN** a run is created containing a case whose current version is 2, and the case is later edited to version 3
- **THEN** the run item still references version 2 and displays version 2's content

#### Scenario: Case added to an open run pins the then-current version
- **WHEN** a case is added to an already-created run after the case reached version 3
- **THEN** that run item pins version 3

#### Scenario: Newer version hint
- **WHEN** a run item's pinned version is older than the case's current version
- **THEN** the run item indicates that a newer version of the case exists

#### Scenario: A newly created run has a key
- **WHEN** a user creates a run in a project
- **THEN** the run is created with a `key` assigned, scoped to that project
