## MODIFIED Requirements

### Requirement: Closing a run
Any actor with permission to record results on a run SHALL be able to close
it. Once `closed`, the run's items become read-only: recording a result,
updating an item's status or assignee, and adding an item are all rejected
with `409`. While the close request is in flight, the UI SHALL disable the
close control and label it as in progress; on success, the run's status
SHALL be reflected immediately without waiting on unrelated data to reload.

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

#### Scenario: Close button shows in-progress state
- **WHEN** an actor clicks "Close run" and the request has not yet resolved
- **THEN** the control is disabled and labeled "Closing…"

#### Scenario: Status badge updates without waiting on unrelated reloads
- **WHEN** the close request succeeds
- **THEN** the run's status badge shows `closed` immediately, not only
  after the run's items and summary have also finished reloading

#### Scenario: A generic close failure re-enables the control
- **WHEN** the close request fails for a reason other than session expiry
- **THEN** the control returns to its enabled "Close run" state and an
  error message is shown

#### Scenario: Session expiry during close opens the re-login modal
- **WHEN** the close request fails with `401` because the session has
  expired
- **THEN** the session-expired modal opens, per the session expiry
  requirement in `ui-navigation`, instead of a generic run-lifecycle error

### Requirement: Reopening a closed run requires project-admin permission
Only an actor with the `manageProject` permission on the run's project
SHALL be able to reopen a closed run, returning it to `open`. While the
reopen request is in flight, the UI SHALL disable the reopen control and
label it as in progress; on success, the run's status SHALL be reflected
immediately without waiting on unrelated data to reload.

#### Scenario: An actor with manageProject reopens a closed run
- **WHEN** an actor with `manageProject` permission on the run's project
  reopens a closed run
- **THEN** the run's status becomes `open` and its items accept modification
  again

#### Scenario: An actor without manageProject cannot reopen a closed run
- **WHEN** an actor without `manageProject` permission on the run's project
  attempts to reopen a closed run
- **THEN** the request is rejected with `403`

#### Scenario: Reopen button shows in-progress state
- **WHEN** an actor clicks "Reopen run" and the request has not yet
  resolved
- **THEN** the control is disabled and labeled "Reopening…"

#### Scenario: Status badge updates without waiting on unrelated reloads
- **WHEN** the reopen request succeeds
- **THEN** the run's status badge shows `open` immediately, not only after
  the run's items and summary have also finished reloading

#### Scenario: A generic reopen failure re-enables the control
- **WHEN** the reopen request fails for a reason other than session expiry
- **THEN** the control returns to its enabled "Reopen run" state and an
  error message is shown

#### Scenario: Session expiry during reopen opens the re-login modal
- **WHEN** the reopen request fails with `401` because the session has
  expired
- **THEN** the session-expired modal opens, per the session expiry
  requirement in `ui-navigation`, instead of a generic run-lifecycle error
