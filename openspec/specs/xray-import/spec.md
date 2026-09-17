# xray-import

## Purpose

Importing an Xray (Cloud or Server/Data Center) project's Test Repository
folder tree, Tests, steps, and mappable custom fields into a TestPulse
project via the shared import-job machinery, with a mandatory dry-run
preview.

## Requirements

### Requirement: An Xray import supports both Xray Cloud and Xray Server/Data Center
The system SHALL support connecting to an Xray project hosted on either Xray Cloud (authenticated via a client ID and client secret exchanged for a bearer token) or Xray Server/Data Center (authenticated via a Jira Personal Access Token), selected explicitly on the Connect screen. Xray Server/Data Center connections SHALL NOT accept a Jira username and password (Basic Auth) as a credential.

#### Scenario: A user connects to Xray Cloud
- **WHEN** a user selects "Cloud" on the Xray Connect screen and supplies a client ID, client secret, and project key
- **THEN** the import authenticates against Xray Cloud's own token endpoint and proceeds using the resulting bearer token

#### Scenario: A user connects to Xray Server/Data Center
- **WHEN** a user selects "Server / Data Center" on the Xray Connect screen and supplies a site URL, a Personal Access Token, and a project key
- **THEN** the import authenticates against the given Jira site using the Personal Access Token and proceeds

### Requirement: An Xray import maps a project's Test Repository folder tree directly to a folder hierarchy
The system SHALL map each top-level folder in an Xray project's Test Repository to a top-level TestPulse folder, and each nested Test Repository folder to a nested TestPulse folder beneath its parent's mapped folder, recursively preserving the project's own Test Repository structure.

#### Scenario: A root Test Repository folder becomes a top-level folder
- **WHEN** an Xray project's Test Repository has a folder at the root level
- **THEN** the import creates a corresponding top-level TestPulse folder for that folder

#### Scenario: A nested Test Repository folder becomes a nested folder
- **WHEN** an Xray Test Repository folder has a parent folder
- **THEN** the import creates a nested TestPulse folder beneath the folder mapped from its parent

### Requirement: A Manual-type Test's structured steps map to TestPulse steps; other test types map their script to the case description
The system SHALL map each step of a "Manual" type Xray Test — its action, data, and expected result — to a corresponding TestPulse case step, in order. For an Xray Test of any other type (Cucumber, Generic), which has no structured steps, the system SHALL append that test's script or definition text to the imported case's description, and the imported case's steps list SHALL be empty.

#### Scenario: A Manual test's steps become structured TestPulse steps
- **WHEN** an Xray Test has type "Manual" with one or more steps, each with an action, data, and expected result
- **THEN** the imported TestPulse case has one step per Xray step, preserving the action, data, and expected result in order

#### Scenario: A Cucumber test's scenario becomes its imported description
- **WHEN** an Xray Test has type "Cucumber" with a Gherkin scenario definition
- **THEN** the imported TestPulse case's description includes that scenario text, and the case has no steps

### Requirement: Custom fields with an unverifiable or non-portable type map by value shape, or are dropped and named in the report
The system SHALL map a Jira custom field present on an Xray Test issue to a TestPulse `text` custom field when the field's runtime value is a string. The system SHALL drop a custom field whose value is not a string, and SHALL drop Xray-native Test-scoped fields describing execution/automation metadata (for example, Test Type or Manual Steps Count) that have no corresponding TestPulse concept. Every dropped field SHALL be named individually in the import job's report — never silently discarded without disclosure.

#### Scenario: A string-valued custom field maps to a text custom field
- **WHEN** an Xray Test issue has a Jira custom field whose value is a string
- **THEN** the imported TestPulse case has a corresponding `text` custom field, named after the field, populated with that value

#### Scenario: A non-string custom field is dropped and named in the report
- **WHEN** an Xray Test issue has a Jira custom field whose value is not a string
- **THEN** the field is not imported, and the import job's report names that field individually as unmapped

### Requirement: The web app offers importing an Xray project as a project-creation entry point
The project creation entry point SHALL offer "Import from Xray" alongside "Start from scratch," "Import from TestRail," "Import from Qase," "Import from Zephyr Scale," and "Import from Kiwi TCMS" as a distinct path, leading to a dedicated screen for connecting to either Xray Cloud or Xray Server/Data Center, previewing an import via a dry run, and confirming a real import.

#### Scenario: A user can reach the Xray import flow from project creation
- **WHEN** a user with permission to create projects opens the "+ New project" entry point
- **THEN** Xray is offered as one of the available import sources, and choosing it navigates to the Xray import flow
