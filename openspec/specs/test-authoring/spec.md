# test-authoring

## Purpose

Creating and organizing test assets: projects, versioned test cases (with a
mandatory nested folder tree for browsing/organization), and suites (an
independent n:m grouping used for execution).
## Requirements
### Requirement: Project management
The system SHALL let a Tenant Admin create projects, where a project is the container for all test assets. A project MAY carry an optional `description` (free text), settable at creation or updated later. There is no owner concept — access to a project is determined entirely by project membership (see `project-membership`), assigned by a Tenant Admin after creation. Every project SHALL be assigned an immutable, unique `key` at creation (see `resource-keys`), used to address it in the API and UI. Every project SHALL carry an `isSample` flag, `false` unless the project is the automatically-created Sample Project (see `sample-data`). Any user with `read` permission on a project SHALL be able to list and read it; a Tenant Admin SHALL be able to list and read every project regardless of membership. Renaming, updating the description, and archiving a project SHALL require `manageProject` permission (or Tenant Admin).

#### Scenario: Create a project
- **WHEN** a Tenant Admin submits a new project with a name
- **THEN** the project is created and appears in the project list

#### Scenario: Non-Tenant-Admin cannot create a project
- **WHEN** a non-Tenant-Admin user submits a new project
- **THEN** the request is rejected with `403`

#### Scenario: Project name is required
- **WHEN** a Tenant Admin submits a project without a name
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Description is optional
- **WHEN** a Tenant Admin creates a project with only a name
- **THEN** the project is created with an empty description

#### Scenario: Description can be set later
- **WHEN** a user with `manageProject` permission updates their project with a description
- **THEN** the project reflects it on subsequent reads

#### Scenario: A newly created project has a key
- **WHEN** a Tenant Admin creates a project
- **THEN** the project is created with a `key` assigned, with no separate step required

#### Scenario: Normally-created projects are never marked sample
- **WHEN** a Tenant Admin creates a project through the normal create action
- **THEN** the project's `isSample` flag is `false`

#### Scenario: Project list is scoped to membership
- **WHEN** a non-Tenant-Admin user with a role on two of five existing projects lists projects
- **THEN** only those two projects are returned

#### Scenario: A permission that doesn't include manageProject cannot update project settings
- **WHEN** a user whose effective permissions on a project do not include `manageProject` attempts to rename, re-describe, or archive that project
- **THEN** the request is rejected with `403`

### Requirement: Test case creation
The system SHALL let a user with `caseCreate` permission on a project create test cases within it, with title, description, steps, expected result, priority, and tags. Creating a case establishes version 1. A case MAY additionally carry `platform` (free text), `testType` (free text), and `automated` (boolean, defaults to false), settable at creation or updated later. Every case SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI.

#### Scenario: Create a test case
- **WHEN** a user with `caseCreate` permission creates a case with a title and steps
- **THEN** the case exists at version 1 and is listed in its project

#### Scenario: Title is required
- **WHEN** a user creates a case without a title
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: A permission that doesn't include caseCreate cannot create a case
- **WHEN** a user whose effective permissions on a project do not include `caseCreate` attempts to create a case
- **THEN** the request is rejected with `403`

#### Scenario: Classification fields are optional
- **WHEN** a user creates a case without platform, testType, or automated
- **THEN** the case is created with those fields empty and `automated` defaulting to false

#### Scenario: Classification fields can be set later
- **WHEN** a user updates an existing case with a platform, testType, and automated status
- **THEN** the case reflects all three on subsequent reads

#### Scenario: Classification fields are editable from the case authoring drawer
- **WHEN** a user creates or edits a case in the web UI
- **THEN** the drawer shows editable controls for priority, tags, platform, test type, and automated status, not just title and steps

#### Scenario: Editing a case from the UI preserves fields the drawer doesn't show
- **WHEN** a user edits a case's title or steps from the UI without changing its description or expected result
- **THEN** the case's description and expected result are unchanged in the new version, not reset to empty

#### Scenario: A newly created case has a key
- **WHEN** a user creates a test case in a project
- **THEN** the case is created with a `key` assigned, scoped to that project

### Requirement: Immutable test case versioning
Every edit to a test case's content SHALL create a new immutable version; previous versions MUST remain readable forever. The case always exposes its current version number. Editing a case SHALL require `caseEdit` permission.

#### Scenario: Editing creates a new version
- **WHEN** a user with `caseEdit` permission edits the steps of a case at version 1
- **THEN** the case's current version becomes 2 and version 1's content is unchanged and still retrievable

#### Scenario: Version history is listable
- **WHEN** a user with `read` permission on the project requests the version history of a case with 3 versions
- **THEN** all 3 versions are returned with their content and creation timestamps

#### Scenario: A permission that doesn't include caseEdit cannot edit a case
- **WHEN** a user whose effective permissions on a project do not include `caseEdit` attempts to edit a case's steps
- **THEN** the request is rejected with `403`

### Requirement: Test suite grouping
The system SHALL let a user with `suiteCreate` permission create suites within a project, and a user with `suiteEditMembership` permission manage an n:m membership between suites and test cases. Every suite SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI.

#### Scenario: Add cases to a suite
- **WHEN** a user with `suiteEditMembership` permission adds two cases to a suite
- **THEN** the suite lists both cases, and each case can also belong to other suites

#### Scenario: Removing a case from a suite does not delete the case
- **WHEN** a user with `suiteEditMembership` permission removes a case from a suite
- **THEN** the case no longer appears in the suite but still exists in the project

#### Scenario: A newly created suite has a key
- **WHEN** a user with `suiteCreate` permission creates a suite in a project
- **THEN** the suite is created with a `key` assigned, scoped to that project

#### Scenario: A permission that doesn't include suiteEditMembership cannot modify suite membership
- **WHEN** a user whose effective permissions on a project do not include `suiteEditMembership` attempts to add or remove a case from a suite
- **THEN** the request is rejected with `403`

### Requirement: Soft deletion protects run history
Deleting a test case SHALL be a soft delete: the case disappears from authoring lists but its versions remain readable wherever runs reference them. Deleting a case SHALL require `caseDelete` permission.

#### Scenario: Deleted case referenced by a run
- **WHEN** a user with `caseDelete` permission deletes a case that appears in a past run
- **THEN** the run still shows the pinned case version content, and the case no longer appears in the project's case list

#### Scenario: A permission that doesn't include caseDelete cannot delete a case
- **WHEN** a user whose effective permissions on a project do not include `caseDelete` attempts to delete a case
- **THEN** the request is rejected with `403`

### Requirement: Project-level case folders
The system SHALL let a user with `sectionCreate` permission organize test cases into a nested folder tree, scoped per project and independent of suite membership. Every project SHALL have a root folder created automatically with the project. Every test case SHALL belong to exactly one folder at a time, defaulting to the project's root folder when not specified. Moving a case between folders SHALL require `caseEdit` permission.

#### Scenario: New project has a root folder
- **WHEN** a project is created
- **THEN** it has a root folder that new cases default into when no folder is specified

#### Scenario: Create a nested folder
- **WHEN** a user with `sectionCreate` permission creates a subfolder inside an existing folder
- **THEN** the new folder appears as a child of that folder, and folders can be nested to arbitrary depth

#### Scenario: Case defaults into the root folder
- **WHEN** a user creates a case without specifying a folder
- **THEN** the case is placed in the project's root folder

#### Scenario: Move a case to a different folder
- **WHEN** a user with `caseEdit` permission moves a case from one folder to another
- **THEN** the case appears only in the destination folder, and its suite memberships are unaffected

#### Scenario: Folders are independent of suites
- **WHEN** a case lives in a folder and also belongs to two suites
- **THEN** moving the case to a different folder does not change its suite memberships, and adding/removing it from a suite does not change its folder

#### Scenario: A permission that doesn't include sectionCreate cannot create or move folders
- **WHEN** a user whose effective permissions on a project do not include `sectionCreate` attempts to create a folder
- **THEN** the request is rejected with `403`

### Requirement: Deleting a folder cascades to its subtree
Deleting a folder SHALL soft-delete that folder and every folder and test case anywhere in its subtree, rather than reparenting them. A soft-deleted folder or case no longer appears in folder listings, the folder tree, or the project's case list, but its data (and, for a case, its version history) is preserved and remains visible wherever a run references it, matching the existing soft-deletion guarantee for individually deleted cases. The root folder itself MUST NOT be deletable. Deleting a folder SHALL require `sectionDelete` permission.

#### Scenario: Delete a folder with cases
- **WHEN** a user with `sectionDelete` permission deletes a folder containing cases and having no subfolders
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

#### Scenario: A permission that doesn't include sectionDelete cannot delete a folder
- **WHEN** a user whose effective permissions on a project do not include `sectionDelete` attempts to delete a folder
- **THEN** the request is rejected with `403`

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

