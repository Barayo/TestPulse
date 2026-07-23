# test-execution

## Purpose

Planning and executing test runs: pinning case versions at the moment a run
is built, tracking each run item's status lifecycle, an append-only result
log per item, assignment/filtering, run summaries, and the run execution
board that ties it all together for a human tester.
## Requirements
### Requirement: Run creation pins case versions
The system SHALL let users create a test run from a suite and/or an explicit list of cases. Each run item MUST pin the case version that is current at the moment the item is added to the run, and that pin SHALL never change afterwards. Every run SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI. A run item MAY carry an optional `testName` — the literal name reported by an external test runner, independent of the pinned case's own title.

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

### Requirement: Run open/closed lifecycle
Every run SHALL have a status, `open` or `closed`. Runs are created `open`.

#### Scenario: New run starts open
- **WHEN** a run is created
- **THEN** its status is `open`

### Requirement: Closing a run
Any actor with permission to record results on a run SHALL be able to close
it. Once `closed`, the run's items become read-only: recording a result,
updating an item's status or assignee, and adding an item are all rejected
with `409`.

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

### Requirement: Reopening a closed run requires project-admin permission
Only an actor with the `manageProject` permission on the run's project
SHALL be able to reopen a closed run, returning it to `open`.

#### Scenario: An actor with manageProject reopens a closed run
- **WHEN** an actor with `manageProject` permission on the run's project
  reopens a closed run
- **THEN** the run's status becomes `open` and its items accept modification
  again

#### Scenario: An actor without manageProject cannot reopen a closed run
- **WHEN** an actor without `manageProject` permission on the run's project
  attempts to reopen a closed run
- **THEN** the request is rejected with `403`

### Requirement: Run item status lifecycle
Each run item SHALL carry a current status, one of `pending`, `pass`, `failed`, `skipped`, `blocked`, `retest`. Items start as `pending`. `retest` marks an item for re-execution and is set by an explicit action, never as a verdict.

#### Scenario: Items start pending
- **WHEN** a run is created with three cases
- **THEN** all three run items have status `pending`

#### Scenario: Recording a verdict updates status
- **WHEN** a result with verdict `failed` is recorded on a pending item
- **THEN** the item's current status becomes `failed`

#### Scenario: Marking retest
- **WHEN** a user marks a `failed` item for retest
- **THEN** the item's status becomes `retest` and a subsequent verdict can be recorded

#### Scenario: Invalid status rejected
- **WHEN** a status update is submitted with a value outside the defined set
- **THEN** the request is rejected with a validation error

### Requirement: Append-only result log
Each run item SHALL have an append-only result log. A result records an actor, verdict (`pass`, `failed`, `skipped`, `blocked`), optional comment, and timestamp. Results MUST NOT be editable or deletable through the API. A result MAY additionally carry optional execution metadata: start time, end time, platform, version, and tags.

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

#### Scenario: Execution metadata is optional
- **WHEN** a result is recorded without start time, end time, platform, version, or tags
- **THEN** the result is recorded normally, with those fields absent

#### Scenario: A manually-recorded result can also carry execution metadata
- **WHEN** a user records a verdict through the UI and supplies a platform or version
- **THEN** the result reflects it, the same as a result produced by an import

### Requirement: Run item assignment
The system SHALL let users assign a run item to a person (free-text identity until the identity capability lands) and filter a run's items by assignee.

#### Scenario: Assign and filter
- **WHEN** two items are assigned to "ana" and one to "luis"
- **THEN** filtering the run's items by assignee "ana" returns exactly the two items

### Requirement: Run summary
The system SHALL provide a per-run summary with item counts by current status, consumable by the UI and future MCP clients.

#### Scenario: Summary counts by status
- **WHEN** a run has 2 `pass`, 1 `failed`, and 1 `pending` items
- **THEN** the summary reports those counts and the run's total of 4

### Requirement: Run execution board
The web UI SHALL provide a run execution board: the run's items with status and assignee, a detail pane showing the pinned case version's steps and expected result, and controls to record a verdict with an optional comment without leaving the board. The detail pane SHALL render the pinned version as a labeled `Label: value` property, consistent with the rest of the app's scalar-property presentation, rather than as an unlabeled prose sentence.

#### Scenario: Execute a case from the board
- **WHEN** a tester opens a run, selects a pending item, reviews its steps, and records verdict `pass` with a comment
- **THEN** the item's status chip updates to `pass` on the board and the result appears in the item's log

#### Scenario: Board shows pinned content
- **WHEN** a case was edited after the run was created
- **THEN** the board's detail pane shows the pinned (older) version's content with a hint that a newer version exists

#### Scenario: Pinned version renders as a labeled property
- **WHEN** a tester views a run item's detail pane
- **THEN** the pinned version is shown as a labeled `Pinned version: v{n}` property, not as an unlabeled sentence

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

