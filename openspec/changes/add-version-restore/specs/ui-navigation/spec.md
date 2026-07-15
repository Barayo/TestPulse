## MODIFIED Requirements

### Requirement: Viewing an existing test case
Selecting a test case SHALL open a read-only view of its title, current version, steps, suite memberships, and version history. Each entry in the version history SHALL offer a restore action, gated behind a confirmation explaining that restoring creates a new current version rather than altering history.

#### Scenario: Viewing steps and suite membership
- **WHEN** a user views a test case that belongs to one or more suites
- **THEN** its steps are shown read-only and its suite memberships are shown, independent of its section location

#### Scenario: Version history is visible
- **WHEN** a user views a case that has more than one version
- **THEN** its version history is listed with the current version clearly marked

#### Scenario: Restoring a version requires confirmation
- **WHEN** a user triggers "Restore" on a past version
- **THEN** a confirmation explains that a new version will be created from the selected one and become current, before anything happens

#### Scenario: Restoring updates the current view
- **WHEN** a user confirms restoring a past version
- **THEN** the case view now shows the newly created version as current, with the restored content, and the full version history — including the version just restored from — remains listed
