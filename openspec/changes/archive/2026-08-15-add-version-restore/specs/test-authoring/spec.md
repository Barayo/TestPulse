## MODIFIED Requirements

### Requirement: Immutable test case versioning
Every edit to a test case's content SHALL create a new immutable version; previous versions MUST remain readable forever. The case always exposes its current version number. A user SHALL be able to restore an old version's content, which SHALL create a new version rather than modifying or reusing the target version's own version number.

#### Scenario: Editing creates a new version
- **WHEN** a user edits the steps of a case at version 1
- **THEN** the case's current version becomes 2 and version 1's content is unchanged and still retrievable

#### Scenario: Version history is listable
- **WHEN** a user requests the version history of a case with 3 versions
- **THEN** all 3 versions are returned with their content and creation timestamps

#### Scenario: Restoring an old version creates a new version with its content
- **WHEN** a case is at version 3 and a user restores version 1
- **THEN** a new version 4 is created with version 1's content, and versions 1 through 3 remain unchanged and readable

#### Scenario: Restoring never reuses a version number
- **WHEN** a case is restored any number of times
- **THEN** every restore produces a strictly higher version number than any that came before it, never reusing or overwriting an existing one
