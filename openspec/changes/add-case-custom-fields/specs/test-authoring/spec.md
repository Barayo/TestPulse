## MODIFIED Requirements

### Requirement: Immutable test case versioning
Every edit to a test case's content SHALL create a new immutable
version; previous versions MUST remain readable forever. The case
always exposes its current version number. Editing a case SHALL
require `caseEdit` permission. Every version SHALL record the actor
who created it (`actorKind`: `user`/`agent`/`unknown`, `actorRefId`),
resolved from the authenticated caller — mirroring how a recorded
result already tracks its actor. A user with `caseEdit` permission
SHALL be able to restore an old version's content, which SHALL create
a new version rather than modifying or reusing the target version's
own version number. A version's content MAY include values for the
project's custom fields (see `case-custom-fields`); those values are
versioned exactly like every other field — immutable once recorded,
never rewritten by a later field/option rename or deletion.

#### Scenario: Editing creates a new version
- **WHEN** a user with `caseEdit` permission edits the steps of a case at version 1
- **THEN** the case's current version becomes 2 and version 1's content is unchanged and still retrievable

#### Scenario: Version history is listable
- **WHEN** a user with `read` permission on the project requests the version history of a case with 3 versions
- **THEN** all 3 versions are returned with their content and creation timestamps

#### Scenario: A permission that doesn't include caseEdit cannot edit a case
- **WHEN** a user whose effective permissions on a project do not include `caseEdit` attempts to edit a case's steps
- **THEN** the request is rejected with `403`

#### Scenario: Restoring an old version creates a new version with its content
- **WHEN** a case is at version 3 and a user with `caseEdit` permission restores version 1
- **THEN** a new version 4 is created with version 1's content, and versions 1 through 3 remain unchanged and readable

#### Scenario: Restoring never reuses a version number
- **WHEN** a case is restored any number of times
- **THEN** every restore produces a strictly higher version number than any that came before it, never reusing or overwriting an existing one

#### Scenario: A new version records who created it
- **WHEN** an authenticated user creates a case or saves an edit
- **THEN** the resulting version's `actorKind` and `actorRefId` reflect that authenticated caller

#### Scenario: Versions predating this capability show no actor
- **WHEN** a version was created before actor tracking existed
- **THEN** it reads back with `actorKind: "unknown"` rather than a fabricated identity

#### Scenario: A custom field value change creates a new version like any other edit
- **WHEN** a user with `caseEdit` permission changes only a custom field's
  value, no other content
- **THEN** a new version is created, and the previous version's recorded
  value for that field is unchanged and still retrievable
