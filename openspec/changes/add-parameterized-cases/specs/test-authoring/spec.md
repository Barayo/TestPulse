## MODIFIED Requirements

### Requirement: Test case creation
The system SHALL let a user with `caseCreate` permission on a project create test cases within it, with title, description, steps, expected result, priority, and tags. Creating a case establishes version 1. A case MAY additionally carry `platform` (free text), `testType` (free text), and `automated` (boolean, defaults to false), settable at creation or updated later. Every case SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI. A Steps-format case MAY additionally carry a parameter table (see `parameterized-cases`); no other format may.

#### Scenario: A parameterized case's parameter table is part of its version
- **WHEN** a case's parameter table is edited (a row or column added, removed, or changed)
- **THEN** a new immutable version is created, exactly like any other content edit
