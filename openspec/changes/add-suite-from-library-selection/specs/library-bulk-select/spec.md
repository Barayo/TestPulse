## MODIFIED Requirements

### Requirement: A floating footer bar acts on the current selection

Once at least one row is selected, a footer bar SHALL appear fixed to the
bottom of the viewport showing the selected count, a "Select all {N}" link
(hidden once every currently visible entry is already selected), a
**Move to…** action, a **Create suite from N cases…** action (only when the
resolved case count — direct cases plus every case recursively inside every
selected folder, deduplicated — is greater than zero and the user has
permission to create suites), a **Delete** action, and a **Clear** action.
The bar SHALL disappear once the selection becomes empty.

#### Scenario: Footer bar appears on first selection
- **WHEN** a user selects at least one row
- **THEN** a footer bar appears showing the selected count and the Move to…/Delete/Clear actions

#### Scenario: Select all selects every currently visible entry
- **WHEN** a user activates "Select all {N}" in the footer bar
- **THEN** every entry currently visible in the list becomes selected, and the "Select all" link disappears

#### Scenario: Clear empties the selection and hides the bar
- **WHEN** a user activates "Clear" in the footer bar
- **THEN** the selection becomes empty and the footer bar disappears

#### Scenario: Create-suite action counts cases recursively inside a selected folder
- **WHEN** a user has permission to create suites and selects a folder containing 4 cases (no cases selected directly)
- **THEN** the footer bar shows a "Create suite from 4 cases…" action

#### Scenario: Create-suite action sums direct and folder-recursive cases without double-counting
- **WHEN** a user selects a folder containing 4 cases plus 2 cases selected directly elsewhere, and none of the 2 directly-selected cases are inside that folder
- **THEN** the footer bar shows a "Create suite from 6 cases…" action

#### Scenario: Create-suite action is absent when the resolved case count is zero
- **WHEN** a user selects only folders that contain no cases anywhere in their subtree
- **THEN** the footer bar does not show a create-suite action

#### Scenario: Create-suite action is absent without permission
- **WHEN** a user without suite-create permission selects at least one case
- **THEN** the footer bar does not show a create-suite action

## ADDED Requirements

### Requirement: Bulk create a suite from the selection, recursively resolving selected folders

**Create suite from N cases…** in the footer bar SHALL open a dialog naming
the number of cases about to become suite members and asking for a suite
name, where N is the resolved case count: every directly-selected case,
plus every case anywhere (at any depth) inside every selected folder's
subtree, deduplicated. Confirming SHALL create a new suite with that name,
add every resolved case to it as a member, clear the Library selection, and
navigate to the new suite's detail page. Cancelling or dismissing the
dialog SHALL leave the Library selection unchanged. Folder resolution SHALL
happen entirely client-side, using data already loaded by the Library page
— this action SHALL require no dedicated bulk-membership backend endpoint
and no new fetch, looping the existing single-case suite-membership call
once per resolved case.

#### Scenario: Confirming creates a suite from directly-selected cases
- **WHEN** a user selects 3 cases (no folders), opens "Create suite from 3 cases…", enters a name, and confirms
- **THEN** a new suite is created with that name, all 3 cases become its members, the Library selection clears, and the app navigates to the new suite's detail page

#### Scenario: Selecting a folder pulls in every case in its subtree, recursively
- **WHEN** a user selects a folder that directly contains 2 cases and has a subfolder containing 2 more cases, opens "Create suite from 4 cases…", enters a name, and confirms
- **THEN** the new suite's members are all 4 cases from both levels of the folder's subtree

#### Scenario: A mixed folder+case selection unions both without duplicating overlap
- **WHEN** a user selects a folder containing 4 cases and separately selects 2 cases outside that folder, opens "Create suite from 6 cases…", enters a name, and confirms
- **THEN** the new suite has exactly 6 members with no duplicates

#### Scenario: The dialog states how many cases will become members
- **WHEN** a user opens "Create suite from 5 cases…"
- **THEN** the dialog describes that 5 cases from the selection will become the new suite's members

#### Scenario: The confirm button is disabled until a name is entered
- **WHEN** a user opens the create-suite dialog and has not yet typed a suite name
- **THEN** the confirm button is disabled

#### Scenario: Cancelling leaves the selection untouched
- **WHEN** a user opens the create-suite dialog and cancels or dismisses it
- **THEN** no suite is created and the Library selection remains exactly as it was
