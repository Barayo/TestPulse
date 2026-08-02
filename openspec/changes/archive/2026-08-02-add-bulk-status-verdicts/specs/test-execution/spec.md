## MODIFIED Requirements

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
affordance, showing a bulk action bar while any item is selected. On an
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
- **THEN** the bulk action bar does not offer a "Mark as" control

#### Scenario: Right-clicking a selected row shows the bulk menu
- **WHEN** more than one item is selected and a user right-clicks a row that is part of that selection
- **THEN** the context menu offers the same bulk actions as the bulk action bar instead of that row's single-item actions

#### Scenario: Right-clicking an unselected row leaves the selection untouched
- **WHEN** items are selected and a user right-clicks a row that is not part of the selection
- **THEN** the context menu shows that row's ordinary single-item actions, and the existing selection is unchanged

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
