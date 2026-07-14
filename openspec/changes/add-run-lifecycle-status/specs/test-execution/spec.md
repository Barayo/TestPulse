## ADDED Requirements

### Requirement: Run open/closed lifecycle
Every run SHALL have a status, `open` or `closed`. Runs are created `open`.

#### Scenario: New run starts open
- **WHEN** a run is created
- **THEN** its status is `open`

### Requirement: Closing a run
Any actor who can write to an open run SHALL be able to close it. Once
`closed`, the run's items become read-only: recording a result, updating an
item's status or assignee, and adding an item are all rejected with `409`.

#### Scenario: Closing an open run
- **WHEN** an authenticated actor closes an open run
- **THEN** the run's status becomes `closed`

#### Scenario: Closed run rejects a new result
- **WHEN** a result is submitted for an item on a closed run
- **THEN** the request is rejected with `409`, and the item's result log is
  unchanged

#### Scenario: Closed run rejects a status update
- **WHEN** an item's status or assignee is updated on a closed run
- **THEN** the request is rejected with `409`

#### Scenario: Closed run rejects adding an item
- **WHEN** a case is added as a new item to a closed run
- **THEN** the request is rejected with `409`

### Requirement: Reopening a closed run is admin-only
Only an actor with the `admin` role SHALL be able to reopen a closed run,
returning it to `open`.

#### Scenario: Admin reopens a closed run
- **WHEN** an actor with role `admin` reopens a closed run
- **THEN** the run's status becomes `open` and its items accept modification
  again

#### Scenario: Non-admin cannot reopen a closed run
- **WHEN** an actor without the `admin` role attempts to reopen a closed run
- **THEN** the request is rejected with `403`
