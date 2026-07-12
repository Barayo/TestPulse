# test-authoring

## ADDED Requirements

### Requirement: Project management
The system SHALL let users create, list, rename, and archive projects, where a project is the container for all test assets.

#### Scenario: Create a project
- **WHEN** a user submits a new project with a name
- **THEN** the project is created and appears in the project list

#### Scenario: Project name is required
- **WHEN** a user submits a project without a name
- **THEN** the request is rejected with a validation error naming the field

### Requirement: Test case creation
The system SHALL let users create test cases within a project with title, description, steps, expected result, priority, and tags. Creating a case establishes version 1.

#### Scenario: Create a test case
- **WHEN** a user creates a case with a title and steps
- **THEN** the case exists at version 1 and is listed in its project

#### Scenario: Title is required
- **WHEN** a user creates a case without a title
- **THEN** the request is rejected with a validation error naming the field

### Requirement: Immutable test case versioning
Every edit to a test case's content SHALL create a new immutable version; previous versions MUST remain readable forever. The case always exposes its current version number.

#### Scenario: Editing creates a new version
- **WHEN** a user edits the steps of a case at version 1
- **THEN** the case's current version becomes 2 and version 1's content is unchanged and still retrievable

#### Scenario: Version history is listable
- **WHEN** a user requests the version history of a case with 3 versions
- **THEN** all 3 versions are returned with their content and creation timestamps

### Requirement: Test suite grouping
The system SHALL let users create suites within a project and manage an n:m membership between suites and test cases.

#### Scenario: Add cases to a suite
- **WHEN** a user adds two cases to a suite
- **THEN** the suite lists both cases, and each case can also belong to other suites

#### Scenario: Removing a case from a suite does not delete the case
- **WHEN** a user removes a case from a suite
- **THEN** the case no longer appears in the suite but still exists in the project

### Requirement: Soft deletion protects run history
Deleting a test case SHALL be a soft delete: the case disappears from authoring lists but its versions remain readable wherever runs reference them.

#### Scenario: Deleted case referenced by a run
- **WHEN** a case that appears in a past run is deleted
- **THEN** the run still shows the pinned case version content, and the case no longer appears in the project's case list

### Requirement: Project-level case folders
The system SHALL let users organize test cases into a nested folder tree, scoped per project and independent of suite membership. Every project SHALL have a root folder created automatically with the project. Every test case SHALL belong to exactly one folder at a time, defaulting to the project's root folder when not specified.

#### Scenario: New project has a root folder
- **WHEN** a project is created
- **THEN** it has a root folder that new cases default into when no folder is specified

#### Scenario: Create a nested folder
- **WHEN** a user creates a subfolder inside an existing folder
- **THEN** the new folder appears as a child of that folder, and folders can be nested to arbitrary depth

#### Scenario: Case defaults into the root folder
- **WHEN** a user creates a case without specifying a folder
- **THEN** the case is placed in the project's root folder

#### Scenario: Move a case to a different folder
- **WHEN** a user moves a case from one folder to another
- **THEN** the case appears only in the destination folder, and its suite memberships are unaffected

#### Scenario: Folders are independent of suites
- **WHEN** a case lives in a folder and also belongs to two suites
- **THEN** moving the case to a different folder does not change its suite memberships, and adding/removing it from a suite does not change its folder

### Requirement: Deleting a folder reparents its contents
Deleting a non-empty folder SHALL move its direct child folders and cases to the deleted folder's parent (or to the project's root folder, if the deleted folder was itself a root-level folder), rather than deleting or orphaning them. The root folder itself MUST NOT be deletable.

#### Scenario: Delete a folder with cases
- **WHEN** a user deletes a folder containing cases and having no subfolders
- **THEN** those cases move to the deleted folder's parent folder

#### Scenario: Root folder cannot be deleted
- **WHEN** a user attempts to delete a project's root folder
- **THEN** the request is rejected
