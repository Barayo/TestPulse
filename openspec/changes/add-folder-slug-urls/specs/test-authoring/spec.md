## MODIFIED Requirements

### Requirement: Project-level case folders
The system SHALL let a user with `sectionCreate` permission organize test cases into a nested folder tree, scoped per project and independent of suite membership. Every project SHALL have a root folder created automatically with the project. Every test case SHALL belong to exactly one folder at a time, defaulting to the project's root folder when not specified. Moving a case between folders SHALL require `caseEdit` permission, and the destination folder MUST belong to the same project as the case — the server is the authoritative guard against a cross-project destination, regardless of client-side filtering. A folder's name (and its derived slug) MUST be unique among its siblings under the same parent folder, enforced both when the folder is created and when an existing folder is moved into a new parent (see `folder-slug-urls`'s sibling-uniqueness requirement).

#### Scenario: Moving a case into another project's folder is rejected
- **WHEN** a user attempts to move a case into a folder that belongs to a different project than the case's own
- **THEN** the request is rejected and the case's folder is unchanged

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
