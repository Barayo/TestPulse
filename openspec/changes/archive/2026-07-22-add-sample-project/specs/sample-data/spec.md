## ADDED Requirements

### Requirement: Automatic Sample Project on a fresh instance
The system SHALL create one populated Sample Project automatically the first time it starts with zero projects, and SHALL NOT re-create it afterward — including after it is deleted.

#### Scenario: Fresh instance gets a Sample Project
- **WHEN** the server starts against a database with zero projects
- **THEN** a project named "Sample Project" is created, marked as a sample

#### Scenario: Existing instance is never re-seeded
- **WHEN** the server starts against a database that already has at least one project
- **THEN** no Sample Project is created, whether or not one already exists

#### Scenario: A deleted Sample Project is never recreated
- **WHEN** a Sample Project is deleted and the server restarts
- **THEN** no new Sample Project is created — the instance has zero projects, exactly as left

#### Scenario: A seeding failure does not prevent the server from starting
- **WHEN** the Sample Project seeding step encounters an error
- **THEN** the server still starts and serves requests normally

### Requirement: Sample Project content demonstrates core capabilities
The Sample Project SHALL contain, at creation: multiple sections with test cases carrying varied classification fields (priority, tags, platform, testType, automated); at least two suites; an open run with recorded verdicts; a closed run; a run created via JUnit-XML import including at least one unmatched case; and at least one case with more than one version.

#### Scenario: Sample Project has an open and a closed run
- **WHEN** the Sample Project is seeded
- **THEN** it contains at least one run with status `open` and at least one with status `closed`

#### Scenario: Sample Project demonstrates JUnit-XML import
- **WHEN** the Sample Project is seeded
- **THEN** it contains a run created via import, and the import's response included at least one unmatched case key

#### Scenario: Sample Project demonstrates case versioning
- **WHEN** the Sample Project is seeded
- **THEN** at least one of its cases has a current version greater than 1

### Requirement: The Sample Project is an ordinary project
The Sample Project SHALL be archivable and otherwise indistinguishable from any other project in its handling — no special protection, no restricted permissions.

#### Scenario: Sample Project can be archived like any project
- **WHEN** an authorized actor archives the Sample Project
- **THEN** it is archived exactly as any other project would be, with no special error or restriction
