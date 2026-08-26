## MODIFIED Requirements

### Requirement: Shift+Click selects case rows without checkboxes

The Library's case and folder rows SHALL support selecting multiple rows via
Shift+Click, with no checkbox or other always-visible selection control on
either kind of row. A plain click on a case row SHALL continue to open the
case, and a plain click on a folder row SHALL continue to navigate into it,
unchanged. The first Shift+Click on a row (with no existing selection)
SHALL select only that row and establish it as the range anchor. A
subsequent Shift+Click SHALL extend a contiguous range from the anchor to
the clicked row — spanning both folder and case rows, in the order they
render (folder rows before case rows within the current section) — matching
the run execution board's existing Shift+Click range-select semantics.

#### Scenario: Plain click still opens the case
- **WHEN** a user clicks a case row without holding Shift
- **THEN** the app navigates to that case's detail page, and no selection changes

#### Scenario: Plain click still navigates into the folder
- **WHEN** a user clicks a folder row without holding Shift
- **THEN** the app navigates into that folder, and no selection changes

#### Scenario: First Shift+Click selects one row
- **WHEN** a user Shift+Clicks a case or folder row while nothing is selected
- **THEN** only that row becomes selected, and it becomes the range anchor

#### Scenario: Second Shift+Click extends a range
- **WHEN** a user Shift+Clicks a row after an earlier Shift+Click selected a different row
- **THEN** every row between the anchor and the newly clicked row (inclusive) becomes selected

#### Scenario: A range can span both folder and case rows
- **WHEN** a user Shift+Clicks a case row after an earlier Shift+Click selected a folder row above it in the same list
- **THEN** every folder and case row between them becomes selected

#### Scenario: Selected rows are shown by a background tint
- **WHEN** a case or folder row is selected
- **THEN** it renders with a tint visually distinct from the row's own hover highlight, and with no checkbox or icon added

### Requirement: Keyboard selection mirrors the mouse model

The Library's case and folder rows SHALL support keyboard-only selection: arrow keys
(or j/k) move a focus indicator through every row in the current section — folders
then cases, in render order — scrolling the focused row into view. Space SHALL toggle the
focused row exactly as a first Shift+Click would (selecting it and setting
it as the anchor). Shift+Space SHALL extend the range from the anchor to
the focused row exactly as a subsequent Shift+Click would. Enter SHALL open
the focused case, or navigate into the focused folder.

#### Scenario: Arrow keys move focus and scroll it into view
- **WHEN** a user presses an arrow key (or j/k) while the Library page has keyboard focus
- **THEN** the focus indicator moves to the next/previous row (folder or case), scrolling it into view if it isn't already visible

#### Scenario: Space toggles the focused row
- **WHEN** a user presses Space with a row focused and nothing selected
- **THEN** that row becomes selected and becomes the range anchor

#### Scenario: Shift+Space extends a range
- **WHEN** a user presses Shift+Space with a row focused after an earlier selection set an anchor
- **THEN** every row between the anchor and the focused row (inclusive) becomes selected

#### Scenario: Enter opens the focused case or folder
- **WHEN** a user presses Enter with a case row focused
- **THEN** the app navigates to that case's detail page
- **WHEN** a user presses Enter with a folder row focused
- **THEN** the app navigates into that folder

#### Scenario: Typing in a filter or search field never triggers selection shortcuts
- **WHEN** a user is typing in the Library's search box or any filter control
- **THEN** arrow keys, Space, and Shift+Space behave as normal text/form input and do not move focus or change selection

### Requirement: A floating footer bar acts on the current selection

Once at least one case or folder row is selected, a footer bar SHALL appear fixed to
the bottom of the viewport showing the selected count, a "Select all {N}"
link (hidden once every currently visible row is already selected), a
**Move to…** action, a **Delete** action, and a **Clear** action. The bar
SHALL disappear once the selection becomes empty.

#### Scenario: Footer bar appears on first selection
- **WHEN** a user selects at least one case or folder row
- **THEN** a footer bar appears showing the selected count and the Move to…/Delete/Clear actions

#### Scenario: Select all selects every currently visible row
- **WHEN** a user activates "Select all {N}" in the footer bar
- **THEN** every case and folder currently visible in the list becomes selected, and the "Select all" link disappears

#### Scenario: Clear empties the selection and hides the bar
- **WHEN** a user activates "Clear" in the footer bar
- **THEN** the selection becomes empty and the footer bar disappears

### Requirement: Bulk Move to… and Delete act on every selected case

**Move to…** in the footer bar SHALL open a folder picker; confirming a
target folder SHALL move every selected case into it and reparent every
selected folder under it (subject to the same cycle rejection a single
folder move already enforces — a selected folder that would form a cycle
with the target is skipped, not silently corrupted). **Delete** SHALL open
a confirmation naming the number of cases and, if any folders are selected,
summing each selected folder's own case/subsection preview into the total
before it executes; confirming SHALL delete every selected case and
cascade-delete every selected folder. Both actions SHALL clear the
selection and refresh the case list on success. Neither action requires a
new bulk-specific backend endpoint — each loops the existing single-item
move/delete calls (including, for folders, the single-folder move added
alongside this bulk capability).

#### Scenario: Bulk move relocates every selected case
- **WHEN** a user selects several cases, opens Move to…, and picks a target folder
- **THEN** every selected case's folder becomes the target folder, the selection clears, and the list refreshes

#### Scenario: Bulk move reparents every selected folder
- **WHEN** a user selects one or more folders, opens Move to…, and picks a target folder that is not a descendant of any selected folder
- **THEN** every selected folder's parent becomes the target folder, the selection clears, and the list refreshes

#### Scenario: Bulk delete removes every selected case
- **WHEN** a user selects several cases, opens Delete, and confirms
- **THEN** every selected case is deleted, the selection clears, and the list refreshes

#### Scenario: Bulk delete cascades every selected folder
- **WHEN** a user selects one or more folders (with or without cases also selected), opens Delete, and confirms
- **THEN** every selected folder and its entire subtree is soft-deleted, alongside any directly selected cases

#### Scenario: Bulk delete confirmation names the count
- **WHEN** a user opens Delete with 3 cases selected and no folders
- **THEN** the confirmation dialog states that 3 cases will be deleted

#### Scenario: Bulk delete confirmation sums selected folders' subtree previews
- **WHEN** a user opens Delete with 2 cases and 1 folder selected, and that folder's own preview reports 5 cases and 2 subsections
- **THEN** the confirmation dialog states a total reflecting all directly selected cases plus every selected folder's own preview counts
