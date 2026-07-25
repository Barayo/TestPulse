# test-execution

## Purpose

Planning and executing test runs: pinning case versions at the moment a run
is built, tracking each run item's status lifecycle, an append-only result
log per item, assignment/filtering, run summaries, and the run execution
board that ties it all together for a human tester.
## Requirements
### Requirement: Run creation pins case versions
The system SHALL let a user with `runCreate` permission on a project create a test run from a suite and/or an explicit list of cases. Each run item MUST pin the case version that is current at the moment the item is added to the run, and that pin SHALL never change afterwards. Every run SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI. A run item MAY carry an optional `testName` — the literal name reported by an external test runner, independent of the pinned case's own title. Adding an item to an existing run SHALL also require `runCreate` permission.

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

#### Scenario: A run item's testName is independent of the case's title
- **WHEN** a run item carries a `testName` that differs from its pinned case's title
- **THEN** both are shown — the case's own title is not overwritten or replaced by the reported name

#### Scenario: A permission that doesn't include runCreate cannot create a run
- **WHEN** a user whose effective permissions on a project do not include `runCreate` attempts to create a run in it
- **THEN** the request is rejected with `403`

### Requirement: Run open/closed lifecycle
Every run SHALL have a status, `open` or `closed`. Runs are created `open`.

#### Scenario: New run starts open
- **WHEN** a run is created
- **THEN** its status is `open`

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

### Requirement: Run item status lifecycle
Each run item SHALL carry a current status, one of `pending`, `pass`, `failed`, `skipped`, `blocked`, `retest`. Items start as `pending`. `retest` marks an item for re-execution and is set by an explicit action, never as a verdict. Updating a run item's status SHALL require `runRecordResult` permission on the run's project.

#### Scenario: Items start pending
- **WHEN** a run is created with three cases
- **THEN** all three run items have status `pending`

#### Scenario: Recording a verdict updates status
- **WHEN** a user with `runRecordResult` permission records a result with verdict `failed` on a pending item
- **THEN** the item's current status becomes `failed`

#### Scenario: Marking retest
- **WHEN** a user with `runRecordResult` permission marks a `failed` item for retest
- **THEN** the item's status becomes `retest` and a subsequent verdict can be recorded

#### Scenario: Invalid status rejected
- **WHEN** a status update is submitted with a value outside the defined set
- **THEN** the request is rejected with a validation error

### Requirement: Append-only result log
Each run item SHALL have an append-only result log. A result records an actor, verdict (`pass`, `failed`, `skipped`, `blocked`), optional comment, and timestamp. Results MUST NOT be editable or deletable through the API. A result MAY additionally carry optional execution metadata: start time, end time, platform, version, and tags. Recording a result SHALL require `runRecordResult` permission on the run's project.

The actor SHALL default to the authenticated caller who recorded the result; a client MAY still explicitly supply an `actor` display name to override it (e.g. an agent recording a result on behalf of a named human tester). Regardless of an override, the result SHALL also store which real actor (if any) authenticated the request that created it, denormalized so that link survives the actor's own later deletion. A result recorded before this capability existed has no real actor behind it and is marked accordingly, rather than erroring or fabricating an identity.

#### Scenario: Results accumulate
- **WHEN** an item receives verdict `failed`, is marked retest, and then receives verdict `pass`
- **THEN** the result log lists both results in order and the item's current status is `pass`

#### Scenario: Actor defaults to the authenticated caller
- **WHEN** a result is submitted without an `actor`
- **THEN** the result's actor is the display name of whoever authenticated the request (a user's email, or an agent token's name)

#### Scenario: Actor can be overridden while the run is open
- **WHEN** a result is submitted with an explicit `actor` display name, different from the authenticated caller
- **THEN** the result displays the submitted name, while still recording which real actor authenticated the request that created it

#### Scenario: Pre-existing results show as unknown, not broken
- **WHEN** a result recorded before this capability existed is read
- **THEN** its original actor display name is shown, with no real actor linked (`unknown`) rather than an error or a fabricated identity

#### Scenario: A permission that doesn't include runRecordResult cannot record a result
- **WHEN** a user whose effective permissions on a run's project do not include `runRecordResult` attempts to record a result
- **THEN** the request is rejected with `403`

#### Scenario: Execution metadata is optional
- **WHEN** a result is recorded without start time, end time, platform, version, or tags
- **THEN** the result is recorded normally, with those fields absent

#### Scenario: A manually-recorded result can also carry execution metadata
- **WHEN** a user records a verdict through the UI and supplies a platform or version
- **THEN** the result reflects it, the same as a result produced by an import

### Requirement: Run item assignment
The system SHALL let a user with `runRecordResult` permission on a project assign a run item to a person (free-text identity until the identity capability lands); any user with `read` permission MAY filter a run's items by assignee.

#### Scenario: Assign and filter
- **WHEN** two items are assigned to "ana" and one to "luis"
- **THEN** filtering the run's items by assignee "ana" returns exactly the two items

### Requirement: Run summary
The system SHALL provide a per-run summary with item counts by current status, consumable by the UI and future MCP clients, visible to any user with `read` permission on the run's project.

#### Scenario: Summary counts by status
- **WHEN** a run has 2 `pass`, 1 `failed`, and 1 `pending` items
- **THEN** the summary reports those counts and the run's total of 4

### Requirement: Run execution board
The web UI SHALL provide a run execution board: the run's items listed
with status, assignee, and identifying metadata (case title, test name,
platform, tags), plus a run-level status breakdown covering all six
possible statuses (pending/pass/failed/skipped/blocked/retest) and the
overall pass rate. Selecting an item SHALL navigate to a dedicated item
page rather than showing its detail inline.

#### Scenario: Board shows a status breakdown for all statuses
- **WHEN** a user opens a run with items in more than one status
- **THEN** the board shows a visual breakdown covering every status
  present, each with a distinct color

#### Scenario: Item metadata is visible without opening the item
- **WHEN** a run item was created from a JUnit import carrying a test
  name, platform, or tags
- **THEN** that metadata is visible on the item's row in the board's list

#### Scenario: Selecting an item navigates to its own page
- **WHEN** a user selects an item on the board
- **THEN** the app navigates to that item's own page rather than showing
  its detail in a pane alongside the list

### Requirement: Run item detail page
The web UI SHALL provide a dedicated page per run item, reached from the
run execution board, showing the pinned case version's steps and expected
result, item properties (status, test name, platform, tags, pinned
version), and the item's result history. When the run is open and the
viewer has `runRecordResult` permission, the page SHALL provide controls
to record a verdict with an optional comment. When the run is closed, the
page SHALL show the item read-only instead of these controls. The page's
breadcrumb SHALL end at the run, not repeat the item's own heading.

#### Scenario: Execute a case from its detail page
- **WHEN** a user with `runRecordResult` permission opens a pending
  item's page on an open run, reviews its steps, and records verdict
  `pass` with a comment
- **THEN** the item's status updates to `pass` and the result appears in
  the item's history

#### Scenario: Board shows pinned content
- **WHEN** a case was edited after the run was created
- **THEN** the item's page shows the pinned (older) version's content
  with a hint that a newer version exists

#### Scenario: Pinned version renders as a labeled property
- **WHEN** a tester views a run item's page
- **THEN** the pinned version is shown as a labeled `Pinned version: v{n}`
  property in the sidebar, not as an unlabeled sentence

#### Scenario: Closed run shows the item read-only
- **WHEN** a user opens an item's page on a closed run
- **THEN** verdict-recording controls are not shown, and the item's
  content and history are visible read-only

#### Scenario: Item page breadcrumb does not repeat the item's own heading
- **WHEN** a user opens a run item's page
- **THEN** the breadcrumb ends at the run, and the item's identifying
  content appears only in the page's own heading, not as a trailing
  breadcrumb segment

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

