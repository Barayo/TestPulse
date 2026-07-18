## MODIFIED Requirements

### Requirement: Run creation pins case versions
The system SHALL let a user with an effective role of Tester or above on a project create a test run from a suite and/or an explicit list of cases. Each run item MUST pin the case version that is current at the moment the item is added to the run, and that pin SHALL never change afterwards.

#### Scenario: Run pins versions at creation
- **WHEN** a Tester creates a run containing a case whose current version is 2, and the case is later edited to version 3
- **THEN** the run item still references version 2 and displays version 2's content

#### Scenario: Case added to an open run pins the then-current version
- **WHEN** a case is added to an already-created run after the case reached version 3
- **THEN** that run item pins version 3

#### Scenario: Newer version hint
- **WHEN** a run item's pinned version is older than the case's current version
- **THEN** the run item indicates that a newer version of the case exists

#### Scenario: User with no membership cannot create a run
- **WHEN** a user with no effective role on a project attempts to create a run in it
- **THEN** the request is rejected with `403`

### Requirement: Run item status lifecycle
Each run item SHALL carry a current status, one of `pending`, `pass`, `failed`, `skipped`, `blocked`, `retest`. Items start as `pending`. `retest` marks an item for re-execution and is set by an explicit action, never as a verdict. Updating a run item's status SHALL require an effective role of Tester or above on the run's project.

#### Scenario: Items start pending
- **WHEN** a run is created with three cases
- **THEN** all three run items have status `pending`

#### Scenario: Recording a verdict updates status
- **WHEN** a Tester records a result with verdict `failed` on a pending item
- **THEN** the item's current status becomes `failed`

#### Scenario: Marking retest
- **WHEN** a Tester marks a `failed` item for retest
- **THEN** the item's status becomes `retest` and a subsequent verdict can be recorded

#### Scenario: Invalid status rejected
- **WHEN** a status update is submitted with a value outside the defined set
- **THEN** the request is rejected with a validation error

### Requirement: Append-only result log
Each run item SHALL have an append-only result log. A result records actor, verdict (`pass`, `failed`, `skipped`, `blocked`), optional comment, and timestamp. Results MUST NOT be editable or deletable through the API. Recording a result SHALL require an effective role of Tester or above on the run's project.

#### Scenario: Results accumulate
- **WHEN** an item receives verdict `failed`, is marked retest, and then receives verdict `pass`
- **THEN** the result log lists both results in order and the item's current status is `pass`

#### Scenario: Actor is required
- **WHEN** a result is submitted without an actor
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: User with no membership cannot record a result
- **WHEN** a user with no effective role on a run's project attempts to record a result
- **THEN** the request is rejected with `403`

### Requirement: Run item assignment
The system SHALL let a user with an effective role of Tester or above on a project assign a run item to a person (free-text identity until the identity capability lands) and filter a run's items by assignee.

#### Scenario: Assign and filter
- **WHEN** two items are assigned to "ana" and one to "luis"
- **THEN** filtering the run's items by assignee "ana" returns exactly the two items

### Requirement: Run summary
The system SHALL provide a per-run summary with item counts by current status, consumable by the UI and future MCP clients, visible to any user with an effective role on the run's project.

#### Scenario: Summary counts by status
- **WHEN** a run has 2 `pass`, 1 `failed`, and 1 `pending` items
- **THEN** the summary reports those counts and the run's total of 4

### Requirement: Run execution board
The web UI SHALL provide a run execution board: the run's items with status and assignee, a detail pane showing the pinned case version's steps and expected result, and controls to record a verdict with an optional comment without leaving the board. Recording a verdict from the board SHALL require an effective role of Tester or above.

#### Scenario: Execute a case from the board
- **WHEN** a tester with an effective role of Tester or above opens a run, selects a pending item, reviews its steps, and records verdict `pass` with a comment
- **THEN** the item's status chip updates to `pass` on the board and the result appears in the item's log

#### Scenario: Board shows pinned content
- **WHEN** a case was edited after the run was created
- **THEN** the board's detail pane shows the pinned (older) version's content with a hint that a newer version exists
