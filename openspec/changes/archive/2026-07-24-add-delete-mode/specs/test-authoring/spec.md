## MODIFIED Requirements

### Requirement: Deleting a folder cascades to its subtree
Deleting a folder SHALL soft-delete that folder and every folder and test case anywhere in its subtree, rather than reparenting them. A soft-deleted folder or case no longer appears in folder listings, the folder tree, or the project's case list, but its data (and, for a case, its version history) is preserved and remains visible wherever a run references it, matching the existing soft-deletion guarantee for individually deleted cases. The root folder itself MUST NOT be deletable.

#### Scenario: Delete a folder with cases
- **WHEN** a user deletes a folder containing cases and having no subfolders
- **THEN** every case in that folder is soft-deleted and no longer appears in the project's case list

#### Scenario: Delete a folder with nested subfolders
- **WHEN** a user deletes a folder that has one or more child folders, themselves containing cases
- **THEN** every descendant folder and every case at any depth within the deleted folder's subtree is soft-deleted

#### Scenario: A deleted folder referenced by a run keeps history intact
- **WHEN** a folder is deleted and one of its former cases appears in a past run
- **THEN** the run still shows the pinned case version content, same as when a case is deleted directly

#### Scenario: Root folder cannot be deleted
- **WHEN** a user attempts to delete a project's root folder
- **THEN** the request is rejected

## ADDED Requirements

### Requirement: Destructive actions require delete mode and confirmation
The web UI SHALL hide every delete affordance (case delete, folder delete) behind an explicit "delete mode" toggle in the Library view, off by default each time the view is opened. The toggle itself SHALL only be visible to an actor whose effective project permissions include `caseDelete` or `sectionDelete`. Every delete action, once triggered, SHALL show a confirmation dialog stating what will be removed before it executes; for a folder, the dialog states the number of cases and subfolders in its subtree. Canceling the dialog SHALL make no change.

#### Scenario: Delete affordances are hidden until delete mode is enabled
- **WHEN** a user with delete permission opens the Library view without enabling delete mode
- **THEN** no delete button or selection control is shown on any folder or case row

#### Scenario: Enabling delete mode reveals delete actions
- **WHEN** a user with delete permission toggles delete mode on
- **THEN** delete actions become available on folder and case rows

#### Scenario: Delete mode is unavailable without delete permission
- **WHEN** a user whose effective project permissions include neither `caseDelete` nor `sectionDelete` opens the Library view
- **THEN** the delete mode toggle is not shown at all

#### Scenario: Deleting a folder requires confirming its subtree size
- **WHEN** a user in delete mode triggers delete on a folder containing cases and subfolders
- **THEN** a confirmation dialog states how many cases and subfolders will be removed before the deletion proceeds

#### Scenario: Canceling a delete confirmation makes no change
- **WHEN** a user triggers delete on a case or folder and then cancels the confirmation dialog
- **THEN** no request is made and the case or folder remains exactly as it was
