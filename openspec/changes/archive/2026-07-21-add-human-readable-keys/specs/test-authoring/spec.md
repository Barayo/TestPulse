## MODIFIED Requirements

### Requirement: Project management
The system SHALL let users create, list, rename, and archive projects, where a project is the container for all test assets. A project MAY carry an optional `description` (free text) and an optional `ownerId` (a reference to a user), settable at creation or updated later. Every project SHALL be assigned an immutable, unique `key` at creation (see `resource-keys`), used to address it in the API and UI.

#### Scenario: Create a project
- **WHEN** a user submits a new project with a name
- **THEN** the project is created and appears in the project list

#### Scenario: Project name is required
- **WHEN** a user submits a project without a name
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Description and owner are optional
- **WHEN** a user creates a project with only a name
- **THEN** the project is created with an empty description and no owner

#### Scenario: Description and owner can be set later
- **WHEN** a user updates an existing project with a description and an owner
- **THEN** the project reflects both on subsequent reads

#### Scenario: Owner's account is later deactivated
- **WHEN** a project's owner is a user who is later deactivated
- **THEN** the project still shows that user as its owner, not a blank or error

#### Scenario: A newly created project has a key
- **WHEN** a user creates a project
- **THEN** the project is created with a `key` assigned, with no separate step required

### Requirement: Test case creation
The system SHALL let users create test cases within a project with title, description, steps, expected result, priority, and tags. Creating a case establishes version 1. A case MAY additionally carry `platform` (free text), `testType` (free text), and `automated` (boolean, defaults to false), settable at creation or updated later. Every case SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI.

#### Scenario: Create a test case
- **WHEN** a user creates a case with a title and steps
- **THEN** the case exists at version 1 and is listed in its project

#### Scenario: Title is required
- **WHEN** a user creates a case without a title
- **THEN** the request is rejected with a validation error naming the field

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

### Requirement: Test suite grouping
The system SHALL let users create suites within a project and manage an n:m membership between suites and test cases. Every suite SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI.

#### Scenario: Add cases to a suite
- **WHEN** a user adds two cases to a suite
- **THEN** the suite lists both cases, and each case can also belong to other suites

#### Scenario: Removing a case from a suite does not delete the case
- **WHEN** a user removes a case from a suite
- **THEN** the case no longer appears in the suite but still exists in the project

#### Scenario: A newly created suite has a key
- **WHEN** a user creates a suite in a project
- **THEN** the suite is created with a `key` assigned, scoped to that project
