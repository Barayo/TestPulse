## ADDED Requirements

### Requirement: A Kiwi TCMS import maps a product's test plan tree directly to a folder hierarchy, not to TestPulse Suites
The system SHALL map each of a Kiwi TCMS product's root test plans (no parent plan) to a top-level TestPulse folder, and each test plan with a parent plan to a nested folder beneath its parent's mapped folder, recursively preserving the product's own test plan tree. TestPulse's own Suite construct (a named selection of cases for scoping a run) SHALL NOT be created, modified, or otherwise touched by a Kiwi TCMS import.

#### Scenario: A root test plan becomes a top-level folder
- **WHEN** a Kiwi TCMS product has a test plan with no parent plan
- **THEN** the import creates a corresponding top-level TestPulse folder for that test plan

#### Scenario: A nested test plan becomes a nested folder
- **WHEN** a Kiwi TCMS test plan has a parent plan
- **THEN** the import creates a nested TestPulse folder beneath the folder mapped from its parent plan

### Requirement: A test case linked to multiple test plans in the imported scope is imported once, and every such case is named in the report
The system SHALL create each Kiwi TCMS test case as exactly one TestPulse case, in the folder mapped from the first test plan it is linked to that is encountered while walking the imported test plan tree. A test case linked to more than one test plan within the imported scope SHALL be named individually in the import job's report — never silently deduplicated without disclosure, and never duplicated into more than one TestPulse case.

#### Scenario: A case linked to one test plan imports normally
- **WHEN** a Kiwi TCMS test case is linked to exactly one test plan within the imported scope
- **THEN** the case is created once, in the folder mapped from that test plan

#### Scenario: A case linked to multiple test plans imports once and is named in the report
- **WHEN** a Kiwi TCMS test case is linked to more than one test plan within the imported scope
- **THEN** the case is created exactly once, in the folder mapped from whichever linked test plan is encountered first, and the import's report names that case explicitly as linked to multiple plans

### Requirement: A test case's freeform text is preserved as description, since Kiwi TCMS has no structured step concept
The system SHALL append a Kiwi TCMS test case's `text` field to the imported case's description. The imported case's steps list SHALL be empty, since Kiwi TCMS test cases have no structured step representation to map from.

#### Scenario: A case's text becomes its imported description
- **WHEN** a Kiwi TCMS test case has a non-empty `text` field
- **THEN** the imported TestPulse case's description includes that text, and the case has no steps

### Requirement: Every property on a Kiwi TCMS test case maps to a TestPulse text custom field
The system SHALL map each of a Kiwi TCMS test case's properties to a TestPulse `text` custom field, created (or reused, if already created by an earlier case in the same import) by the property's own name, populated with the property's value. No property is dropped or reported as unmappable, since every Kiwi TCMS property is an untyped string value with a direct TestPulse `text` equivalent.

#### Scenario: A property is created and populated as a text custom field
- **WHEN** a Kiwi TCMS test case has a property with a name and value
- **THEN** the imported TestPulse case has a corresponding `text` custom field, named after the property, populated with that value

### Requirement: The web app offers importing a Kiwi TCMS product as a project-creation entry point
The project creation entry point SHALL offer "Import from Kiwi TCMS" alongside "Start from scratch," "Import from TestRail," "Import from Qase," and "Import from Zephyr Scale" as a distinct path, leading to a dedicated screen for connecting to a self-hosted Kiwi TCMS instance with a site URL, username, and password, previewing an import via a dry run, and confirming a real import.

#### Scenario: A user can reach the Kiwi TCMS import flow from project creation
- **WHEN** a user with permission to create projects opens the "+ New project" entry point
- **THEN** Kiwi TCMS is offered as one of the available import sources, and choosing it navigates to the Kiwi TCMS import flow
