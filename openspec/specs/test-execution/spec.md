# test-execution

## Purpose

Planning and executing test runs: pinning case versions at the moment a run
is built, tracking each run item's status lifecycle, an append-only result
log per item, assignment/filtering, run summaries, and the run execution
board that ties it all together for a human tester.
## Requirements
### Requirement: Run creation pins case versions
The system SHALL let a user with `runCreate` permission on a project create a test run from a suite and/or an explicit list of cases. Each run item MUST pin the case version that is current at the moment the item is added to the run, and that pin SHALL never change afterwards. Every run SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI. A run item MAY carry an optional `testName` — the literal name reported by an external test runner, independent of the pinned case's own title. Adding an item to an existing run SHALL also require `runCreate` permission. A run created from a suite SHALL record that suite's key; a run created without a suite (an explicit case list, or an imported run) SHALL have no suite reference. A run's recorded suite SHALL NOT change after creation, and deleting the suite later SHALL NOT affect the run or its items — only the suite reference itself is cleared.

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

#### Scenario: A run created from a suite records that suite
- **WHEN** a run is created with a source suite
- **THEN** the run's `suiteKey` reflects that suite's key

#### Scenario: A run created without a suite has no suite reference
- **WHEN** a run is created from an explicit case list with no suite, or via execution import
- **THEN** the run's `suiteKey` is absent (`null`)

#### Scenario: Deleting a suite does not affect runs created from it
- **WHEN** a suite that was used to create a run is later deleted
- **THEN** the run and its items are unaffected, and the run's `suiteKey` becomes `null`

### Requirement: Run open/closed lifecycle
Every run SHALL have a status, `open` or `closed`. Runs created via
`POST /runs` (an actor explicitly starting a run) are created `open`. Runs
created via bulk import are the one exception: they are created `closed`
from the start (see `execution-import`), since every item they contain
already carries a final verdict at creation time.

#### Scenario: New run starts open
- **WHEN** a run is created via `POST /runs`
- **THEN** its status is `open`

#### Scenario: New imported run starts closed
- **WHEN** a run is created via bulk import
- **THEN** its status is `closed`, per the import-specific requirement in
  `execution-import`

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

### Requirement: Deleting a run
The system SHALL let a user with the `runDelete` permission on a run's project permanently delete that run. Deletion SHALL remove the run and every run item and result scoped to it; it is not reversible and requires no further precondition (unlike project deletion, a run does not need to be archived first — runs have no archived state).

#### Scenario: Delete a run
- **WHEN** a user with `runDelete` on the project deletes an existing run
- **THEN** the run, its items, and every recorded result for those items are permanently removed, and the run no longer appears in the project's run list

#### Scenario: Deleting a run does not affect the cases it referenced
- **WHEN** a run pinning specific case versions is deleted
- **THEN** the underlying test cases and their version history are unaffected — only the run's own items and results are removed

#### Scenario: Insufficient permission
- **WHEN** a user without `runDelete` on the project attempts to delete a run
- **THEN** the request is rejected and the run is not deleted

### Requirement: Automatic run retention
The system SHALL let a Tenant Admin configure a single, instance-wide run-retention age threshold, in days. A closed run older than the threshold, measured from its own `createdAt`, SHALL be automatically and permanently deleted by a background process the same way a manual run deletion would. A threshold of `0` SHALL mean the policy is off — no run is ever auto-deleted. Open runs SHALL never be auto-deleted regardless of age.

#### Scenario: Threshold off by default
- **WHEN** an instance has never had `runRetentionDays` configured
- **THEN** it defaults to `0` and no run is ever automatically deleted

#### Scenario: Closed run past the threshold is auto-deleted
- **WHEN** a Tenant Admin sets `runRetentionDays` to a positive number and a closed run's `createdAt` is older than that many days
- **THEN** the background worker permanently deletes the run, its items, and its results, the same as a manual `runDelete`

#### Scenario: Open runs are never auto-deleted
- **WHEN** an open run's `createdAt` is older than the configured `runRetentionDays`
- **THEN** the run is left untouched by the automatic sweep

#### Scenario: Automatic deletion is audited as a system actor
- **WHEN** the background worker deletes a run automatically
- **THEN** an audit log entry is recorded with actor kind `system`, distinct from a human- or agent-triggered deletion

#### Scenario: Only a Tenant Admin can change the threshold
- **WHEN** a user without Tenant Admin standing attempts to change `runRetentionDays`
- **THEN** the request is rejected and the threshold is unchanged

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
Each run item SHALL have an append-only result log. A result records an actor, verdict (`pass`, `failed`, `skipped`, `blocked`), optional comment, and timestamp. Results MUST NOT be editable or deletable through the API. A result MAY additionally carry optional execution metadata: start time, end time, platform, version, and tags. Recording a result SHALL require `runRecordResult` permission on the run's project. A bulk verdict action recording the same verdict against multiple selected items SHALL produce one independent result row per item — identical in shape to, and indistinguishable in the log from, that many individual recordings — never a single combined or summarized entry.

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

#### Scenario: A bulk verdict produces one row per item, not a batch record
- **WHEN** a user bulk-records `failed` against 3 selected items
- **THEN** the result log gains exactly 3 new rows, one per item, each independently attributed to the same actor and timestamped individually

### Requirement: Run item assignment
The system SHALL let a user with `runRecordResult` permission on a project assign a run item to a real user or team who is a member of that project — free text is no longer accepted as an assignment input. Each run item SHALL reference its assignee via a real foreign key (`assigneeUserId` xor `assigneeTeamId`), enforced by the database; if the referenced user or team is later deleted, the item SHALL automatically revert to unassigned rather than retaining a dangling reference. Any user with `read` permission MAY filter a run's items by assignee. The web UI SHALL provide an assign control on each run item's board row, reached via the row's existing right-click/`⋯` menu, offering a search-and-pick list scoped to the project's actual members (people and teams, listed separately). The board SHALL provide an assignee filter alongside the existing status filter: one chip per distinct assignee present in the run, plus an explicit `Unassigned` chip and an `All` chip, composing with the status filter and grouping without hiding any item that neither filter excludes. The board SHALL support selecting multiple items and assigning them all to one real user or team in one action. Run creation SHALL accept an optional default assignee (a real project member), applied to every item in the newly created run.

#### Scenario: Assign and filter
- **WHEN** two items are assigned to the user Ana and one to the user Luis
- **THEN** filtering the run's items by assignee Ana returns exactly the two items

#### Scenario: Assigning an item from the board
- **WHEN** a user with `runRecordResult` permission opens an item's row menu, chooses "Assign to…", and picks a project member from the list
- **THEN** the item's assignee updates to that real user, and the row reflects it without a full page reload

#### Scenario: The picker lists the project's real members, not free text
- **WHEN** a user opens the assign dialog for an item
- **THEN** the list shows the project's actual users and teams, separately labeled, and offers no way to type an arbitrary name instead

#### Scenario: Assigning to a non-member is rejected
- **WHEN** an assignment request references a user or team id that is not a member of the item's project
- **THEN** the request is rejected rather than silently creating the assignment

#### Scenario: Deleting the assigned user or team reverts the item to unassigned
- **WHEN** a user or team that is currently assigned to a run item is deleted
- **THEN** the item's assignee becomes null (`Unassigned`) automatically, with no dangling reference left behind

#### Scenario: Filtering to Unassigned
- **WHEN** a user selects the "Unassigned" assignee filter chip on a run with both assigned and unassigned items
- **THEN** only items with no assignee are shown

#### Scenario: Assignee filter composes with the status filter
- **WHEN** a user has an assignee filter and a status filter both active
- **THEN** only items matching both are shown

#### Scenario: Bulk-assigning selected items
- **WHEN** a user selects several items on the board and assigns them all to the user Ana in one action
- **THEN** every selected item's assignee becomes Ana

#### Scenario: A new run's items inherit its default assignee
- **WHEN** a user creates a run with a default assignee of the user Ana
- **THEN** every item in that run is assigned to Ana immediately after creation

#### Scenario: A run created without a default assignee leaves items unassigned
- **WHEN** a user creates a run without specifying a default assignee
- **THEN** every item in that run starts unassigned, unchanged from today's behavior

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
page rather than showing its detail inline. Right-clicking an item row
SHALL open a context menu offering to open the item's execution page or
jump directly to the case's own page in the Library — unless that row is
part of an active multi-item selection (more than one item checked), in
which case the context menu SHALL instead offer the same bulk actions
available in the bulk action bar (assign the selection, mark it with a
verdict); right-clicking a row that is not part of the current selection
SHALL always show the single-item menu regardless of whether other rows
are selected, and opening a context menu SHALL NOT itself change which
items are selected. When the run was
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
input, textarea, or other editable element has focus. The board SHALL
support selecting multiple items via a checkbox per row and a "select all"
affordance, showing a bulk action bar while any item is selected. Each
row's checkbox SHALL render at reduced opacity while the board is at rest
(no hover, no keyboard focus on that row, no active selection), returning
to full opacity when that row is hovered, when it carries the keyboard
focus cursor, or whenever at least one item anywhere in the list is
selected; the header "select all" affordance is exempt from this and SHALL
always render at full opacity. In addition to the checkbox, the board SHALL
support two selection shortcuts: pressing Space SHALL toggle the selection
state of the item currently under the keyboard focus cursor, and
Shift-clicking a row SHALL add the contiguous range of items between the
most recently toggled row and the clicked row to the existing selection
without clearing it — or, if no row has been toggled yet in the current
session, SHALL select just the clicked row and establish it as the anchor
for a subsequent range selection. On an
open run, the bulk action bar SHALL offer a "Mark as" control listing all
four verdicts (Pass, Failed, Blocked, Skipped) that records the chosen
verdict against every selected item in one action; this control SHALL NOT
be offered when the run is closed.

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

#### Scenario: Selecting items shows a bulk action bar
- **WHEN** a user checks one or more item rows
- **THEN** a bulk action bar appears showing how many items are selected and the actions available for that selection

#### Scenario: Select all selects every visible item
- **WHEN** a user activates "select all" while the board shows a filtered subset of items
- **THEN** only the currently visible items become selected, not items hidden by the active filter

#### Scenario: Bulk-recording a verdict for selected items
- **WHEN** a user selects several items on an open run, opens "Mark as", and picks "Pass"
- **THEN** every selected item receives a `pass` result and its current status updates accordingly

#### Scenario: The "Mark as" control is unavailable on a closed run
- **WHEN** a user selects items on a closed run
- **THEN** the bulk action bar does not offer any verdict-recording action

#### Scenario: Right-clicking a selected row shows the bulk menu
- **WHEN** more than one item is selected and a user right-clicks a row that is part of that selection
- **THEN** the context menu offers the same bulk actions as the bulk action bar instead of that row's single-item actions

#### Scenario: Right-clicking an unselected row leaves the selection untouched
- **WHEN** items are selected and a user right-clicks a row that is not part of the selection
- **THEN** the context menu shows that row's ordinary single-item actions, and the existing selection is unchanged

#### Scenario: A row's checkbox is quiet at rest and returns to full opacity when relevant
- **WHEN** no item on the board is selected and a row is neither hovered nor under the keyboard focus cursor
- **THEN** that row's checkbox renders at reduced opacity, and it returns to full opacity as soon as the row is hovered, gains the keyboard focus cursor, or any item anywhere in the list becomes selected

#### Scenario: The "select all" checkbox is always fully visible
- **WHEN** the board is at rest with nothing selected
- **THEN** the header "select all" checkbox renders at full opacity, unlike the per-row checkboxes

#### Scenario: Space toggles the keyboard-focused item
- **WHEN** a user has moved the focus cursor to an item with `j`/`k` and presses Space
- **THEN** that item's selection state toggles, the same as clicking its checkbox, and the page does not scroll

#### Scenario: Shift-click extends the selection as a range
- **WHEN** a user has already selected one item and Shift-clicks a row further down the visible list
- **THEN** every item between the two, inclusive, is added to the selection, and any items already selected remain selected

#### Scenario: Shift-click with no prior selection selects just that row
- **WHEN** a user Shift-clicks a row before toggling or selecting anything else on the board
- **THEN** only that row becomes selected, and it becomes the anchor for the next Shift-click's range

### Requirement: Run item detail page
The web UI SHALL provide a dedicated page per run item, reached from the
run execution board, showing the pinned case version's steps and expected
result, item properties (status, test name, platform, tags, pinned
version, assignee), and the item's result history. The assignee property
SHALL be shown as "Unassigned" when absent, and SHALL offer an "Assign
to…" control matching the one on the board. When the run is open and the
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
equivalent arrow keys) to navigate to the previous/next item in the run's
item order regardless of status, without returning to the board first. A
persistent shortcuts hint SHALL be visible on the page, omitting the
retest key when the item isn't `failed`, and pressing `?` SHALL open an
overlay listing every available shortcut. Keyboard shortcuts SHALL be
ignored while a text input, textarea, or other editable element (including
the comment field and the actor-override field) has focus.

#### Scenario: Execute a case from its detail page
- **WHEN** a user with `runRecordResult` permission opens a pending
  item's page on an open run, reviews its steps, and records verdict
  `pass` with a comment
- **THEN** the item's status updates to `pass` and the result appears in
  the item's history

#### Scenario: Item page shows and updates the assignee
- **WHEN** a user opens an item's page and uses its "Assign to…" control
  to assign it to "ana"
- **THEN** the Properties panel shows "ana" as the assignee without a
  full page reload, the same as assigning from the board

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

### Requirement: A result may carry attachments
A result MAY additionally carry zero or more image attachments (`run-result-attachments`), alongside its existing actor, verdict, comment, and execution metadata. Attachments SHALL NOT change how a verdict is recorded or how the item's current status is derived.

#### Scenario: A result with an attachment records normally
- **WHEN** a user records a verdict with one attached screenshot
- **THEN** the result is recorded exactly as it would be without the attachment, with the image additionally visible in its history entry

#### Scenario: A result without any attachment is unaffected
- **WHEN** a user records a verdict without attaching anything
- **THEN** the result behaves exactly as it did before this capability existed


### Requirement: Comparing two runs
The system SHALL let a user query a categorized comparison between two closed runs
from the same project, joined by case key. A case whose verdict went from `pass` to
`failed` or `blocked` SHALL be categorized as regressed; from `failed` or `blocked` to
`pass` SHALL be categorized as improved; present in both runs with any other pairing of
statuses SHALL be categorized as unchanged; present only in the newer run SHALL be
categorized as added; present only in the older run SHALL be categorized as removed.
"Older" and "newer" SHALL be determined by each run's creation time, independent of the
order the two run keys are supplied in. Comparing an open run, or two runs from
different projects, SHALL be rejected.

#### Scenario: A case that regressed is categorized correctly
- **WHEN** a case's verdict is `pass` in the older run and `failed` (or `blocked`) in the newer run
- **THEN** the comparison lists that case under regressed

#### Scenario: A case that improved is categorized correctly
- **WHEN** a case's verdict is `failed` or `blocked` in the older run and `pass` in the newer run
- **THEN** the comparison lists that case under improved

#### Scenario: A case with the same verdict in both runs is unchanged
- **WHEN** a case has the same verdict, or any pairing other than the regressed/improved transitions, in both runs
- **THEN** the comparison lists that case under unchanged

#### Scenario: A case only in the newer run is added
- **WHEN** a case appears in the newer run's items but not the older run's
- **THEN** the comparison lists that case under added, with no older-run status

#### Scenario: A case only in the older run is removed
- **WHEN** a case appears in the older run's items but not the newer run's
- **THEN** the comparison lists that case under removed, with no newer-run status

#### Scenario: Run order in the request doesn't affect older/newer categorization
- **WHEN** a comparison request supplies the newer run's key before the older run's key
- **THEN** the response still categorizes by actual creation time, not request order

#### Scenario: Comparing an open run is rejected
- **WHEN** a comparison is requested where either run is still open
- **THEN** the request is rejected

#### Scenario: Comparing runs from different projects is rejected
- **WHEN** a comparison is requested for two runs belonging to different projects
- **THEN** the request is rejected
