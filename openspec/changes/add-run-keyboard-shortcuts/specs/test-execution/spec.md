## MODIFIED Requirements

### Requirement: Run execution board
The web UI SHALL provide a run execution board: the run's items listed
with status, assignee, and identifying metadata (case title, test name,
platform, tags), plus a run-level status breakdown covering all six
possible statuses (pending/pass/failed/skipped/blocked/retest) and the
overall pass rate. Selecting an item SHALL navigate to a dedicated item
page rather than showing its detail inline. Right-clicking an item row
SHALL open a context menu offering to open the item's execution page or
jump directly to the case's own page in the Library. When the run was
created from a suite, the board SHALL show a link back to that suite; when
it was not, the board SHALL show an explicit indication that it is an ad hoc
run rather than showing nothing. The board SHALL provide a single-select
status filter that narrows the visible items to one status, and an optional
toggle that groups the full (or filtered) list into status sections ordered
pass, failed, blocked, skipped, retest, pending. The board SHALL support
keyboard navigation of the visible item list: `j`/`k` (or the equivalent
arrow keys) move a focus cursor down/up the visible items in their
displayed order, and `Enter` navigates to the focused item's own page, the
same destination as clicking it. A persistent shortcuts hint SHALL be
visible on the board, and pressing `?` SHALL open an overlay listing every
available shortcut. Keyboard navigation SHALL be ignored while a text
input, textarea, or other editable element has focus.

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

#### Scenario: Right-click offers a shortcut to the case in the Library
- **WHEN** a user right-clicks a run item row
- **THEN** a context menu opens with an option to jump directly to that
  case's own page in the Library, without opening the execution page first

#### Scenario: A run created from a suite links back to it
- **WHEN** a user opens a run whose `suiteKey` is set
- **THEN** the board shows a link to that suite

#### Scenario: An ad hoc run states it has no source suite
- **WHEN** a user opens a run whose `suiteKey` is null
- **THEN** the board explicitly indicates it is an ad hoc run, rather than omitting any mention of a suite

#### Scenario: Filtering to one status for triage
- **WHEN** a user selects the "Failed" status filter chip
- **THEN** only items currently in `failed` status are shown, and a count reflects how many are visible out of the total

#### Scenario: Grouping reorders without hiding
- **WHEN** a user enables "Group by status"
- **THEN** the visible items (respecting any active filter) are reorganized into status-labeled sections in pass/failed/blocked/skipped/retest/pending order, with no item hidden that wasn't already excluded by the filter

#### Scenario: j/k moves the focus cursor through the visible list
- **WHEN** a user presses `j` twice then `k` once while the board's item list has focus
- **THEN** the focus cursor moves down two items then back up one, staying within the currently visible (filtered/grouped) items

#### Scenario: Enter opens the focused item
- **WHEN** a user has moved the focus cursor to an item with `j`/`k` and presses `Enter`
- **THEN** the app navigates to that item's own page

#### Scenario: Keyboard navigation is disabled while typing
- **WHEN** a text input or textarea elsewhere on the page has focus
- **THEN** pressing `j`, `k`, or `Enter` does not move the focus cursor or navigate

#### Scenario: Shortcuts overlay lists every available key
- **WHEN** a user presses `?` on the board
- **THEN** an overlay opens listing the board's keyboard shortcuts, dismissible with `Escape` or `?`

### Requirement: Run item detail page
The web UI SHALL provide a dedicated page per run item, reached from the
run execution board, showing the pinned case version's steps and expected
result, item properties (status, test name, platform, tags, pinned
version), and the item's result history. When the run is open and the
viewer has `runRecordResult` permission, the page SHALL provide controls
to record a verdict with an optional comment. When the run is closed, the
page SHALL show the item read-only instead of these controls. The page's
breadcrumb SHALL end at the run, not repeat the item's own heading. When
the run is open and the viewer has `runRecordResult` permission, the page
SHALL also support single-key verdict recording: `P` records `pass`, `F`
records `failed`, `B` records `blocked`, `S` records `skipped`, and `R`
marks the item for retest when its current status is `failed` (mirroring
the on-screen buttons' own visibility rule). Recording a verdict via a
keyboard shortcut SHALL then navigate to the next `pending` item in the
run's item order, searching forward from the current item only; if none
remains, the app SHALL navigate back to the run execution board instead.
The existing on-screen verdict buttons SHALL retain their current
behavior — recording the result and remaining on the item's page — and
SHALL NOT auto-advance. The page SHALL also support `j`/`k` (or the
equivalent arrow keys) to navigate to the
previous/next item in the run's item order regardless of status, without
returning to the board first. A persistent shortcuts hint SHALL be visible
on the page, omitting the retest key when the item isn't `failed`, and
pressing `?` SHALL open an overlay listing every available shortcut.
Keyboard shortcuts SHALL be ignored while a text input, textarea, or other
editable element (including the comment field and the actor-override
field) has focus.

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

#### Scenario: Single key records a verdict
- **WHEN** a user with `runRecordResult` permission presses `F` on a
  pending item's page
- **THEN** a result with verdict `failed` is recorded, the same as
  clicking the "Failed" button

#### Scenario: Recording a verdict via keyboard auto-advances to the next pending item
- **WHEN** a user presses a verdict key on an item that has a later
  `pending` item in the run
- **THEN** the app navigates to that next pending item's page

#### Scenario: Recording the last pending item's verdict via keyboard returns to the board
- **WHEN** a user presses a verdict key on the only remaining `pending`
  item in the run
- **THEN** the app navigates back to the run execution board

#### Scenario: The on-screen verdict buttons do not auto-advance
- **WHEN** a user clicks the "Pass" (or Failed/Blocked/Skipped) button
  instead of using its keyboard shortcut
- **THEN** the result is recorded and the user remains on the item's page,
  the same as before this capability existed

#### Scenario: Retest key only fires when the item is failed
- **WHEN** a user presses `R` on an item whose current status is not
  `failed`
- **THEN** no action is taken, and the shortcuts hint does not list `R`
  for that item

#### Scenario: j/k moves between items regardless of status
- **WHEN** a user presses `k` on an item's page
- **THEN** the app navigates to the previous item in the run's item
  order, even if that item already has a recorded verdict

#### Scenario: Keyboard shortcuts are disabled while typing
- **WHEN** the comment field or the actor-override field has focus
- **THEN** pressing `P`, `F`, `B`, `S`, `R`, `J`, or `K` types into that
  field instead of recording a verdict or navigating

#### Scenario: Shortcuts overlay lists every available key
- **WHEN** a user presses `?` on the item page
- **THEN** an overlay opens listing the page's keyboard shortcuts,
  dismissible with `Escape` or `?`
