## MODIFIED Requirements

### Requirement: Test case creation
The system SHALL let a user with `caseCreate` permission on a project create test cases within it, with title, description, steps, expected result, priority, and tags. Creating a case establishes version 1. A case MAY additionally carry `platform` (free text), `testType` (free text), and `automated` (boolean, defaults to false), settable at creation or updated later. Every case SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI.

A case's content SHALL be authored in one of three formats, chosen at
creation and changeable later: `steps` (structured `action`/`expected`
steps — the default), `text` (free-form narrative in `description`, no
structured steps), or `gherkin` (a free-form `Given/When/Then` source
block). A case not given an explicit format defaults to `steps`.

#### Scenario: Create a test case
- **WHEN** a user with `caseCreate` permission creates a case with a title and steps
- **THEN** the case exists at version 1 and is listed in its project

#### Scenario: Title is required
- **WHEN** a user creates a case without a title
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: A permission that doesn't include caseCreate cannot create a case
- **WHEN** a user whose effective permissions on a project do not include `caseCreate` attempts to create a case
- **THEN** the request is rejected with `403`

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

#### Scenario: A newly created case has a key
- **WHEN** a user creates a test case in a project
- **THEN** the case is created with a `key` assigned, scoped to that project

#### Scenario: A case defaults to structured-steps format
- **WHEN** a user creates a case without specifying a content format
- **THEN** the case is created with `format` set to `steps`

#### Scenario: Creating a free-text case
- **WHEN** a user creates a case with `format` set to `text` and a description
- **THEN** the case is created with that format and its narrative stored in `description`, with no structured steps

#### Scenario: Creating a Gherkin case
- **WHEN** a user creates a case with `format` set to `gherkin` and a `Given/When/Then` source block
- **THEN** the case is created with that format and the source stored and returned on subsequent reads

#### Scenario: Format is selectable in the authoring drawer
- **WHEN** a user creates or edits a case in the web UI
- **THEN** the drawer offers a choice between structured steps, free text, and Gherkin, showing only the fields relevant to the selected format

#### Scenario: Switching format on an existing case
- **WHEN** a user changes an existing case's format to one different from its current format
- **THEN** the new version reflects the new format, and the UI warns before discarding content from the format being abandoned if that content is non-empty
