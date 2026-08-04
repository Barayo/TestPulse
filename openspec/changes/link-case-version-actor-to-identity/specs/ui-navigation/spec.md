## MODIFIED Requirements

### Requirement: Editing a test case creates a new version
A user SHALL be able to edit an existing case's title and steps from
its view, and saving SHALL create a new immutable version rather than
modifying the existing one. Each version's row in the Version History
list SHALL show the editing actor's avatar and first name folded into
the existing change-signal line (not a separate line), when that
version has a known actor; the full name is available via a hover
tooltip. A version with no known actor (`actorKind: "unknown"`) SHALL
show its change signal with no avatar, never a placeholder.

#### Scenario: Saving an edit creates a new version
- **WHEN** a user edits a case's steps and saves
- **THEN** the case's current version increases, the new content is shown, and the previous version remains available in the version history

#### Scenario: A version history row shows who made the change
- **WHEN** a version has a known actor
- **THEN** the row shows that actor's avatar and first name next to the change signal, with the full name available on hover

#### Scenario: A version with no known actor shows no avatar
- **WHEN** a version's `actorKind` is `unknown`
- **THEN** its row shows the change signal alone, with no avatar and no placeholder
