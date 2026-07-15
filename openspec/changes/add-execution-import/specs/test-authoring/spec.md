## MODIFIED Requirements

### Requirement: Test case creation
The system SHALL let users create test cases within a project with title, description, steps, expected result, priority, and tags. Creating a case establishes version 1. A case MAY carry an optional `externalId`, settable at creation or updated later, used to match results reported by an external test runner to this case.

#### Scenario: Create a test case
- **WHEN** a user creates a case with a title and steps
- **THEN** the case exists at version 1 and is listed in its project

#### Scenario: Title is required
- **WHEN** a user creates a case without a title
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: External id is optional
- **WHEN** a user creates a case without an externalId
- **THEN** the case is created with no externalId, matching no imported results until one is set

#### Scenario: External id can be set later
- **WHEN** a user updates an existing case with an externalId
- **THEN** the case reflects it on subsequent reads and future imports can match against it
