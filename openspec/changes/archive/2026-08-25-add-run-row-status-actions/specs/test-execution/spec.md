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
items are selected. On an open run, while the caller holds permission to
record results, the single-item menu SHALL additionally offer the same
four verdicts (Pass, Failed, Blocked, Skipped) the bulk menu offers,
recording the chosen verdict against that row alone; when that row's
current status is `failed`, the menu SHALL further offer a Retest action
that sets the item's status to `retest` directly, the same action already
available on the item's own detail page. Neither the verdict items nor
Retest SHALL appear when the run is closed or the caller lacks that
permission. When the run was
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

#### Scenario: Right-clicking a single row offers verdict actions on an open run
- **WHEN** a user right-clicks a row that is not part of a multi-selection,
  on an open run, and holds permission to record results
- **THEN** the context menu offers Pass, Failed, Blocked, and Skipped,
  each recording that verdict against that row alone

#### Scenario: Right-clicking a failed row also offers Retest
- **WHEN** a user right-clicks a single row whose current status is
  `failed`, on an open run, with permission to record results
- **THEN** the context menu additionally offers Retest, which sets that
  item's status to `retest`

#### Scenario: Retest is not offered for a non-failed row
- **WHEN** a user right-clicks a single row whose current status is not
  `failed`
- **THEN** the context menu does not offer Retest, regardless of
  permission or run status

#### Scenario: Verdict and Retest actions are absent on a closed run
- **WHEN** a user right-clicks a single row on a closed run
- **THEN** the context menu offers none of the verdict items or Retest,
  regardless of the row's current status or the caller's permission

#### Scenario: Verdict and Retest actions are absent without permission
- **WHEN** a user right-clicks a single row and lacks permission to
  record results
- **THEN** the context menu offers none of the verdict items or Retest,
  regardless of the run's status or the row's current status

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
