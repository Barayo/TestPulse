## MODIFIED Requirements

### Requirement: Test case creation
The system SHALL let users create test cases within a project with title, description, steps, expected result, priority, and tags. Creating a case establishes version 1. A case MAY additionally carry `platform` (free text), `testType` (free text), and `automated` (boolean, defaults to false), settable at creation or updated later.

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
