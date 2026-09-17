## ADDED Requirements

### Requirement: A Tuskr import maps a project's Test Suite/Section tree directly to a folder hierarchy
The system SHALL map each of a Tuskr project's Test Suites to a top-level TestPulse folder, and each Section within a Test Suite to a nested TestPulse folder beneath it. TestPulse's own Suite construct (a named selection of cases for scoping a run) SHALL NOT be created, modified, or otherwise touched by a Tuskr import.

#### Scenario: A Test Suite becomes a top-level folder
- **WHEN** a Tuskr project has a Test Suite
- **THEN** the import creates a corresponding top-level TestPulse folder for that Test Suite

#### Scenario: A Section becomes a nested folder
- **WHEN** a Tuskr Test Suite has a Section
- **THEN** the import creates a nested TestPulse folder beneath the folder mapped from that Test Suite, and places the Section's cases inside it

### Requirement: A test case's Steps-type custom field is detected by shape and maps to structured steps
The system SHALL detect a test case's Steps-type custom field by its runtime value shape (an array of entries each carrying a step description) rather than by a fixed field name, and map each entry to a TestPulse case step in order. A test case with no such field SHALL have an empty steps list.

#### Scenario: A case with a Steps-type field imports with structured steps
- **WHEN** a Tuskr test case has a custom field whose value is an array of step entries
- **THEN** the imported TestPulse case has one step per entry, in order, and that field is not also imported as a text custom field

#### Scenario: A case with no Steps-type field imports with no steps
- **WHEN** a Tuskr test case has no custom field shaped like a steps array
- **THEN** the imported TestPulse case has an empty steps list

### Requirement: A string-valued custom field maps to a text custom field; every other field is dropped and named in the report
The system SHALL map a Tuskr test case's custom field to a TestPulse `text` custom field when the field's runtime value is a string. The system SHALL drop a custom field whose value is not a string, and SHALL name every dropped field individually in the import job's report — never silently discarded without disclosure.

#### Scenario: A string-valued custom field maps to a text custom field
- **WHEN** a Tuskr test case has a custom field whose value is a string
- **THEN** the imported TestPulse case has a corresponding `text` custom field, named after the field, populated with that value

#### Scenario: A non-string custom field is dropped and named in the report
- **WHEN** a Tuskr test case has a custom field whose value is not a string
- **THEN** the field is not imported, and the import job's report names that field individually as unmapped

### Requirement: The web app offers importing a Tuskr project as a project-creation entry point
The project creation entry point SHALL offer "Import from Tuskr" alongside "Start from scratch," "Import from TestRail," "Import from Qase," "Import from Zephyr Scale," "Import from Kiwi TCMS," and "Import from Xray" as a distinct path, leading to a dedicated screen for connecting to a Tuskr account with a tenant ID, a Personal Access Token, and a project identifier, previewing an import via a dry run, and confirming a real import.

#### Scenario: A user can reach the Tuskr import flow from project creation
- **WHEN** a user with permission to create projects opens the "+ New project" entry point
- **THEN** Tuskr is offered as one of the available import sources, and choosing it navigates to the Tuskr import flow
