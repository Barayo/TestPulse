# library-bulk-select

## Purpose

Multi-select case rows in the Library and apply Move to…/Delete to the
whole selection at once, without checkboxes — Shift+Click ranging (mouse)
and arrow-key/Space/Shift+Space ranging (keyboard), surfaced via a floating
bulk-action footer bar.

## Requirements

### Requirement: Shift+Click selects case rows without checkboxes

The Library's case list SHALL support selecting multiple case rows via
Shift+Click, with no checkbox or other always-visible selection control on
the row. A plain click on a case row SHALL continue to open the case,
unchanged. The first Shift+Click on a row (with no existing selection)
SHALL select only that row and establish it as the range anchor. A
subsequent Shift+Click SHALL extend a contiguous range from the anchor to
the clicked row, matching the run execution board's existing
Shift+Click range-select semantics.

#### Scenario: Plain click still opens the case
- **WHEN** a user clicks a case row without holding Shift
- **THEN** the app navigates to that case's detail page, and no selection changes

#### Scenario: First Shift+Click selects one row
- **WHEN** a user Shift+Clicks a case row while nothing is selected
- **THEN** only that row becomes selected, and it becomes the range anchor

#### Scenario: Second Shift+Click extends a range
- **WHEN** a user Shift+Clicks a case row after an earlier Shift+Click selected a different row
- **THEN** every row between the anchor and the newly clicked row (inclusive) becomes selected

#### Scenario: Selected rows are shown by a background tint
- **WHEN** a case row is selected
- **THEN** it renders with a tint visually distinct from the row's own hover highlight, and with no checkbox or icon added

### Requirement: Keyboard selection mirrors the mouse model

The Library's case list SHALL support keyboard-only selection: arrow keys
(or j/k) move a focus indicator through the case rows only (folder rows are
skipped), scrolling the focused row into view. Space SHALL toggle the
focused row exactly as a first Shift+Click would (selecting it and setting
it as the anchor). Shift+Space SHALL extend the range from the anchor to
the focused row exactly as a subsequent Shift+Click would. Enter SHALL open
the focused case.

#### Scenario: Arrow keys move focus and scroll it into view
- **WHEN** a user presses an arrow key (or j/k) while the Library page has keyboard focus
- **THEN** the focus indicator moves to the next/previous case row, scrolling it into view if it isn't already visible

#### Scenario: Space toggles the focused row
- **WHEN** a user presses Space with a case row focused and nothing selected
- **THEN** that row becomes selected and becomes the range anchor

#### Scenario: Shift+Space extends a range
- **WHEN** a user presses Shift+Space with a case row focused after an earlier selection set an anchor
- **THEN** every row between the anchor and the focused row (inclusive) becomes selected

#### Scenario: Enter opens the focused case
- **WHEN** a user presses Enter with a case row focused
- **THEN** the app navigates to that case's detail page

#### Scenario: Typing in a filter or search field never triggers selection shortcuts
- **WHEN** a user is typing in the Library's search box or any filter control
- **THEN** arrow keys, Space, and Shift+Space behave as normal text/form input and do not move focus or change selection

### Requirement: A floating footer bar acts on the current selection

Once at least one case row is selected, a footer bar SHALL appear fixed to
the bottom of the viewport showing the selected count, a "Select all {N}"
link (hidden once every currently visible case is already selected), a
**Move to…** action, a **Delete** action, and a **Clear** action. The bar
SHALL disappear once the selection becomes empty.

#### Scenario: Footer bar appears on first selection
- **WHEN** a user selects at least one case row
- **THEN** a footer bar appears showing the selected count and the Move to…/Delete/Clear actions

#### Scenario: Select all selects every currently visible case
- **WHEN** a user activates "Select all {N}" in the footer bar
- **THEN** every case currently visible in the list becomes selected, and the "Select all" link disappears

#### Scenario: Clear empties the selection and hides the bar
- **WHEN** a user activates "Clear" in the footer bar
- **THEN** the selection becomes empty and the footer bar disappears

### Requirement: Bulk Move to… and Delete act on every selected case

**Move to…** in the footer bar SHALL open a folder picker; confirming a
target folder SHALL move every selected case into it. **Delete** SHALL open
a confirmation naming the number of cases about to be deleted; confirming
SHALL delete every selected case. Both actions SHALL clear the selection
and refresh the case list on success. Neither action requires a new backend
endpoint — each loops the existing single-case move/delete calls.

#### Scenario: Bulk move relocates every selected case
- **WHEN** a user selects several cases, opens Move to…, and picks a target folder
- **THEN** every selected case's folder becomes the target folder, the selection clears, and the list refreshes

#### Scenario: Bulk delete removes every selected case
- **WHEN** a user selects several cases, opens Delete, and confirms
- **THEN** every selected case is deleted, the selection clears, and the list refreshes

#### Scenario: Bulk delete confirmation names the count
- **WHEN** a user opens Delete with 3 cases selected
- **THEN** the confirmation dialog states that 3 cases will be deleted
