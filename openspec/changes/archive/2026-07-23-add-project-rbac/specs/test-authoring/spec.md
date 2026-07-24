## MODIFIED Requirements

### Requirement: Project management
The system SHALL let a Tenant Admin create projects, where a project is the container for all test assets. A project MAY carry an optional `description` (free text), settable at creation or updated later. There is no owner concept — access to a project is determined entirely by project membership (see the project-membership capability), assigned by a Tenant Admin after creation. Any user with an effective role on a project (Tester or above) SHALL be able to list and read that project; a Tenant Admin SHALL be able to list and read every project regardless of membership. Renaming, updating the description, and archiving a project SHALL require an effective role of Project Admin or above (or Tenant Admin).

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
- **WHEN** a Project Admin updates their project with a description
- **THEN** the project reflects it on subsequent reads

#### Scenario: Project list is scoped to membership
- **WHEN** a non-Tenant-Admin user with an effective role on two of five existing projects lists projects
- **THEN** only those two projects are returned

#### Scenario: Contributor or Tester cannot update project settings
- **WHEN** a user whose effective role on a project is Contributor or Tester attempts to rename, re-describe, or archive that project
- **THEN** the request is rejected with `403`

### Requirement: Test case creation
The system SHALL let a user with an effective role of Contributor or above on a project create test cases within it, with title, description, steps, expected result, priority, and tags. Creating a case establishes version 1.

#### Scenario: Create a test case
- **WHEN** a Contributor creates a case with a title and steps
- **THEN** the case exists at version 1 and is listed in its project

#### Scenario: Title is required
- **WHEN** a Contributor creates a case without a title
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Tester cannot create a case
- **WHEN** a user whose effective role on a project is Tester attempts to create a case
- **THEN** the request is rejected with `403`

### Requirement: Immutable test case versioning
Every edit to a test case's content SHALL create a new immutable version; previous versions MUST remain readable forever. The case always exposes its current version number. Editing a case SHALL require an effective role of Contributor or above.

#### Scenario: Editing creates a new version
- **WHEN** a Contributor edits the steps of a case at version 1
- **THEN** the case's current version becomes 2 and version 1's content is unchanged and still retrievable

#### Scenario: Version history is listable
- **WHEN** a user with an effective role on the project requests the version history of a case with 3 versions
- **THEN** all 3 versions are returned with their content and creation timestamps

#### Scenario: Tester cannot edit a case
- **WHEN** a user whose effective role on a project is Tester attempts to edit a case's steps
- **THEN** the request is rejected with `403`

### Requirement: Test suite grouping
The system SHALL let a user with an effective role of Contributor or above on a project create suites within it and manage an n:m membership between suites and test cases.

#### Scenario: Add cases to a suite
- **WHEN** a Contributor adds two cases to a suite
- **THEN** the suite lists both cases, and each case can also belong to other suites

#### Scenario: Removing a case from a suite does not delete the case
- **WHEN** a Contributor removes a case from a suite
- **THEN** the case no longer appears in the suite but still exists in the project

#### Scenario: Tester cannot modify suite membership
- **WHEN** a user whose effective role on a project is Tester attempts to add or remove a case from a suite
- **THEN** the request is rejected with `403`

### Requirement: Soft deletion protects run history
Deleting a test case SHALL be a soft delete: the case disappears from authoring lists but its versions remain readable wherever runs reference them. Deleting a case SHALL require an effective role of Project Admin or above.

#### Scenario: Deleted case referenced by a run
- **WHEN** a Project Admin deletes a case that appears in a past run
- **THEN** the run still shows the pinned case version content, and the case no longer appears in the project's case list

#### Scenario: Contributor cannot delete a case
- **WHEN** a user whose effective role on a project is Contributor attempts to delete a case
- **THEN** the request is rejected with `403`

### Requirement: Project-level case folders
The system SHALL let a user with an effective role of Contributor or above on a project organize test cases into a nested folder tree, scoped per project and independent of suite membership. Every project SHALL have a root folder created automatically with the project. Every test case SHALL belong to exactly one folder at a time, defaulting to the project's root folder when not specified.

#### Scenario: New project has a root folder
- **WHEN** a project is created
- **THEN** it has a root folder that new cases default into when no folder is specified

#### Scenario: Create a nested folder
- **WHEN** a Contributor creates a subfolder inside an existing folder
- **THEN** the new folder appears as a child of that folder, and folders can be nested to arbitrary depth

#### Scenario: Case defaults into the root folder
- **WHEN** a Contributor creates a case without specifying a folder
- **THEN** the case is placed in the project's root folder

#### Scenario: Move a case to a different folder
- **WHEN** a Contributor moves a case from one folder to another
- **THEN** the case appears only in the destination folder, and its suite memberships are unaffected

#### Scenario: Folders are independent of suites
- **WHEN** a case lives in a folder and also belongs to two suites
- **THEN** moving the case to a different folder does not change its suite memberships, and adding/removing it from a suite does not change its folder

#### Scenario: Tester cannot create or move folders
- **WHEN** a user whose effective role on a project is Tester attempts to create a folder or move a case between folders
- **THEN** the request is rejected with `403`

### Requirement: Deleting a folder reparents its contents
Deleting a non-empty folder SHALL move its direct child folders and cases to the deleted folder's parent (or to the project's root folder, if the deleted folder was itself a root-level folder), rather than deleting or orphaning them. The root folder itself MUST NOT be deletable. Deleting a folder SHALL require an effective role of Project Admin or above.

#### Scenario: Delete a folder with cases
- **WHEN** a Project Admin deletes a folder containing cases and having no subfolders
- **THEN** those cases move to the deleted folder's parent folder

#### Scenario: Root folder cannot be deleted
- **WHEN** a Project Admin attempts to delete a project's root folder
- **THEN** the request is rejected

#### Scenario: Contributor cannot delete a folder
- **WHEN** a user whose effective role on a project is Contributor attempts to delete a folder
- **THEN** the request is rejected with `403`
