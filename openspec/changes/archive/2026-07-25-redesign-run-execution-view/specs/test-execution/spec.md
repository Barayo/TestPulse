## MODIFIED Requirements

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

## ADDED Requirements

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
