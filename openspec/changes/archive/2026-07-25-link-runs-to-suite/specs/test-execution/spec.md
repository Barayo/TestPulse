## MODIFIED Requirements

### Requirement: Run creation pins case versions
The system SHALL let a user with `runCreate` permission on a project create a test run from a suite and/or an explicit list of cases. Each run item MUST pin the case version that is current at the moment the item is added to the run, and that pin SHALL never change afterwards. Every run SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI. A run item MAY carry an optional `testName` — the literal name reported by an external test runner, independent of the pinned case's own title. Adding an item to an existing run SHALL also require `runCreate` permission. A run created from a suite SHALL record that suite's key; a run created without a suite (an explicit case list, or an imported run) SHALL have no suite reference. A run's recorded suite SHALL NOT change after creation, and deleting the suite later SHALL NOT affect the run or its items — only the suite reference itself is cleared.

#### Scenario: Run pins versions at creation
- **WHEN** a run is created containing a case whose current version is 2, and the case is later edited to version 3
- **THEN** the run item still references version 2 and displays version 2's content

#### Scenario: Case added to an open run pins the then-current version
- **WHEN** a case is added to an already-created run after the case reached version 3
- **THEN** that run item pins version 3

#### Scenario: Newer version hint
- **WHEN** a run item's pinned version is older than the case's current version
- **THEN** the run item indicates that a newer version of the case exists

#### Scenario: A newly created run has a key
- **WHEN** a user creates a run in a project
- **THEN** the run is created with a `key` assigned, scoped to that project

#### Scenario: A run item's testName is independent of the case's title
- **WHEN** a run item carries a `testName` that differs from its pinned case's title
- **THEN** both are shown — the case's own title is not overwritten or replaced by the reported name

#### Scenario: A permission that doesn't include runCreate cannot create a run
- **WHEN** a user whose effective permissions on a project do not include `runCreate` attempts to create a run in it
- **THEN** the request is rejected with `403`

#### Scenario: A run created from a suite records that suite
- **WHEN** a run is created with a source suite
- **THEN** the run's `suiteKey` reflects that suite's key

#### Scenario: A run created without a suite has no suite reference
- **WHEN** a run is created from an explicit case list with no suite, or via execution import
- **THEN** the run's `suiteKey` is absent (`null`)

#### Scenario: Deleting a suite does not affect runs created from it
- **WHEN** a suite that was used to create a run is later deleted
- **THEN** the run and its items are unaffected, and the run's `suiteKey` becomes `null`
