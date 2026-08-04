## MODIFIED Requirements

### Requirement: Immutable test case versioning
Every edit to a test case's content SHALL create a new immutable
version; previous versions MUST remain readable forever. The case
always exposes its current version number. Editing a case SHALL
require `caseEdit` permission. Every version SHALL record the actor
who created it (`actorKind`: `user`/`agent`/`unknown`, `actorRefId`),
resolved from the authenticated caller — mirroring how a recorded
result already tracks its actor.

#### Scenario: Editing creates a new version
- **WHEN** a user with `caseEdit` permission edits the steps of a case at version 1
- **THEN** the case's current version becomes 2 and version 1's content is unchanged and still retrievable

#### Scenario: Version history is listable
- **WHEN** a user with `read` permission on the project requests the version history of a case with 3 versions
- **THEN** all 3 versions are returned with their content and creation timestamps

#### Scenario: A permission that doesn't include caseEdit cannot edit a case
- **WHEN** a user whose effective permissions on a project do not include `caseEdit` attempts to edit a case's steps
- **THEN** the request is rejected with `403`

#### Scenario: A new version records who created it
- **WHEN** an authenticated user creates a case or saves an edit
- **THEN** the resulting version's `actorKind` and `actorRefId` reflect that authenticated caller

#### Scenario: Versions predating this capability show no actor
- **WHEN** a version was created before actor tracking existed
- **THEN** it reads back with `actorKind: "unknown"` rather than a fabricated identity
