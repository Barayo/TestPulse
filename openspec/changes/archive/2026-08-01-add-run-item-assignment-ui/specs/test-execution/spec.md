## MODIFIED Requirements

### Requirement: Run item assignment
The system SHALL let a user with `runRecordResult` permission on a project assign a run item to a person (free-text identity until the identity capability lands); any user with `read` permission MAY filter a run's items by assignee. The web UI SHALL provide an assign control on each run item's board row, reached via the row's existing right-click/`⋯` menu, offering a free-text field that also lists assignees already used elsewhere in the same run for quick reuse. The board SHALL provide an assignee filter alongside the existing status filter: one chip per distinct assignee present in the run, plus an explicit `Unassigned` chip and an `All` chip, composing with the status filter and grouping without hiding any item that neither filter excludes. The board SHALL support selecting multiple items and assigning them all in one action. Run creation SHALL accept an optional default assignee, applied to every item in the newly created run.

#### Scenario: Assign and filter
- **WHEN** two items are assigned to "ana" and one to "luis"
- **THEN** filtering the run's items by assignee "ana" returns exactly the two items

#### Scenario: Assigning an item from the board
- **WHEN** a user with `runRecordResult` permission opens an item's row menu, chooses "Assign to…", and enters a name
- **THEN** the item's assignee updates, and the row reflects it without a full page reload

#### Scenario: Recent assignees are suggested
- **WHEN** a user opens the assign dialog for an item in a run where other items are already assigned to "ana" and "luis"
- **THEN** both names are offered as quick suggestions in the field

#### Scenario: Filtering to Unassigned
- **WHEN** a user selects the "Unassigned" assignee filter chip on a run with both assigned and unassigned items
- **THEN** only items with no assignee are shown

#### Scenario: Assignee filter composes with the status filter
- **WHEN** a user has an assignee filter and a status filter both active
- **THEN** only items matching both are shown

#### Scenario: Bulk-assigning selected items
- **WHEN** a user selects several items on the board and assigns them all to "ana" in one action
- **THEN** every selected item's assignee becomes "ana"

#### Scenario: A new run's items inherit its default assignee
- **WHEN** a user creates a run with a default assignee of "ana"
- **THEN** every item in that run is assigned to "ana" immediately after creation

#### Scenario: A run created without a default assignee leaves items unassigned
- **WHEN** a user creates a run without specifying a default assignee
- **THEN** every item in that run starts unassigned, unchanged from today's behavior

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
input, textarea, or other editable element has focus. The board SHALL
support selecting multiple items via a checkbox per row and a "select all"
affordance, showing a bulk action bar while any item is selected.

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
