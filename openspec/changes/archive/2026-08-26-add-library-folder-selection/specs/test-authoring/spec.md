## ADDED Requirements

### Requirement: Moving a folder to a different parent

The system SHALL let a user with `sectionEdit` permission move (reparent) a
folder to a different parent folder within the same project. The move
SHALL be rejected when the target is the folder itself or any descendant
of the folder — a cycle — regardless of client-side filtering, since the
server is the authoritative guard. The project's root folder MUST NOT be
moved (it has no parent to leave, and no folder may become its parent).
Moving a folder SHALL NOT change which suites its cases belong to, the
same independence folders and suites already have for a single case.

#### Scenario: Move a folder to a different parent
- **WHEN** a user with `sectionEdit` permission moves a folder to a different, non-descendant parent
- **THEN** the folder (and its entire existing subtree) now appears under the new parent, and no longer under the old one

#### Scenario: Moving a folder into its own descendant is rejected
- **WHEN** a user attempts to move a folder into one of its own subfolders
- **THEN** the request is rejected and the folder's parent is unchanged

#### Scenario: Moving a folder into itself is rejected
- **WHEN** a user attempts to move a folder to itself as its own parent
- **THEN** the request is rejected and the folder's parent is unchanged

#### Scenario: The root folder cannot be moved
- **WHEN** a user attempts to move a project's root folder
- **THEN** the request is rejected

#### Scenario: A permission that doesn't include sectionEdit cannot move a folder
- **WHEN** a user whose effective permissions on a project do not include `sectionEdit` attempts to move a folder
- **THEN** the request is rejected with `403`

## MODIFIED Requirements

### Requirement: Destructive actions are tucked behind a per-row menu and require confirmation

The web UI SHALL present every destructive or reorganizing row action (case: "Move to…", "Delete"; folder: "Move to…", "Delete"; section-tree node: "New section") through a closed-by-default contextual menu attached to that row, opened via either a visible trigger or a right-click anywhere on the row — never a standalone always-visible delete icon, an app-wide mode toggle, or a right-click-only trigger with no visible affordance. Right-clicking a row SHALL open its menu at the cursor position and SHALL NOT show the browser's native context menu. A row's menu SHALL include "Delete" only when the actor's effective project permissions include `caseDelete` (for a case row) or `sectionDelete` (for a folder row); SHALL include "Move to…" on a folder row only when the actor's effective permissions include `sectionEdit`. A folder row's trigger SHALL render whenever the actor has `sectionEdit`, `sectionDelete`, or both — rendering neither item, and hiding the trigger entirely, only when the actor has neither permission. A case row's trigger SHALL always render "Move to…" regardless of permission, since moving a case requires no explicit permission check today. Every delete action, once selected from the menu, SHALL show a confirmation dialog stating what will be removed before it executes; for a folder, the dialog states the number of cases and subfolders in its subtree. Canceling the dialog SHALL make no change.

#### Scenario: Row menu is closed by default
- **WHEN** a user with delete permission opens the Library view
- **THEN** no row's menu is open, and no delete or move action is visible until a row's own menu trigger is clicked

#### Scenario: Opening a case row's menu reveals Move and, with permission, Delete
- **WHEN** a user with `caseDelete` permission opens a case row's menu
- **THEN** the menu lists "Move to…" and, below a divider, "Delete"

#### Scenario: A case row's menu omits Delete without caseDelete permission
- **WHEN** a user whose effective permissions do not include `caseDelete` opens a case row's menu
- **THEN** the menu lists "Move to…" only

#### Scenario: Opening a folder row's menu with both permissions reveals Move to… and Delete
- **WHEN** a user with both `sectionEdit` and `sectionDelete` permission opens a folder row's menu
- **THEN** the menu lists "Move to…" and, below a divider, "Delete"

#### Scenario: A folder row's menu offers Move to… without sectionDelete permission
- **WHEN** a user with `sectionEdit` but not `sectionDelete` opens a folder row's menu
- **THEN** the menu lists "Move to…" only

#### Scenario: A folder row's menu offers Delete without sectionEdit permission
- **WHEN** a user with `sectionDelete` but not `sectionEdit` opens a folder row's menu
- **THEN** the menu lists "Delete" only

#### Scenario: A folder row's menu trigger is not shown without either permission
- **WHEN** a user whose effective project permissions include neither `sectionEdit` nor `sectionDelete` opens the Library view
- **THEN** no menu trigger is shown on any folder row

#### Scenario: Deleting a folder requires confirming its subtree size
- **WHEN** a user selects "Delete" from a folder row's menu, for a folder containing cases and subfolders
- **THEN** a confirmation dialog states how many cases and subfolders will be removed before the deletion proceeds

#### Scenario: Canceling a delete confirmation makes no change
- **WHEN** a user selects "Delete" from a row's menu and then cancels the confirmation dialog
- **THEN** no request is made and the case or folder remains exactly as it was

#### Scenario: Right-clicking a case or folder row opens its menu at the cursor
- **WHEN** a user right-clicks a case or folder row in the content list
- **THEN** that row's menu opens at the cursor position, listing the same items the visible trigger would, and the browser's native context menu does not appear

#### Scenario: The section tree's "New section" action has a visible trigger, not just right-click
- **WHEN** a user views a folder node in the section tree
- **THEN** a visible menu trigger is present on that node offering "New section", in addition to the same action being reachable via right-click at the cursor
