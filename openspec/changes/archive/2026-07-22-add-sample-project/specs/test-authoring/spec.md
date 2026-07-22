## MODIFIED Requirements

### Requirement: Project management
The system SHALL let users create, list, rename, and archive projects, where a project is the container for all test assets. A project MAY carry an optional `description` (free text) and an optional `ownerId` (a reference to a user), settable at creation or updated later. Every project SHALL be assigned an immutable, unique `key` at creation (see `resource-keys`), used to address it in the API and UI. Every project SHALL carry an `isSample` flag, `false` unless the project is the automatically-created Sample Project (see `sample-data`).

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

#### Scenario: Normally-created projects are never marked sample
- **WHEN** a user creates a project through the normal create action
- **THEN** the project's `isSample` flag is `false`
