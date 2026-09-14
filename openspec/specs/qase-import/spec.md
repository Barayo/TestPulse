# qase-import

## Purpose

Importing an existing Qase project's structure (suites and cases, with
mappable custom fields) into a new TestPulse project, via the same
standalone `tools/import-connector` process the TestRail importer uses —
`source: "qase"` reuses the generic `import_jobs` job/route/report
contract unchanged, with only the Qase-specific client and mapping logic
being new.

## Requirements

### Requirement: A Qase import maps its suite tree directly to a folder hierarchy, not to TestPulse Suites
The system SHALL map each Qase suite with no parent to a top-level TestPulse folder, and each Qase suite with a parent suite to a nested folder beneath its parent's mapped folder, recursively preserving Qase's own suite tree. Qase cases SHALL be created as TestPulse cases within their suite's mapped folder. TestPulse's own Suite construct (a named selection of cases for scoping a run) SHALL NOT be created, modified, or otherwise touched by a Qase import.

#### Scenario: A root suite becomes a top-level folder
- **WHEN** a Qase project has a suite with no parent suite
- **THEN** the import creates a corresponding top-level TestPulse folder for that suite

#### Scenario: A nested suite becomes a nested folder
- **WHEN** a Qase suite has a parent suite
- **THEN** the import creates a nested TestPulse folder beneath the folder mapped from its parent suite

#### Scenario: A Qase case is created in its suite's folder
- **WHEN** a Qase case belongs to a suite
- **THEN** the imported TestPulse case is created in the folder mapped from that suite

### Requirement: Unmappable Qase custom fields are dropped and individually named in the report, never silently
A Qase custom field of type `string` or `text` SHALL be mapped to a TestPulse `text` custom field; a Qase custom field of type `selectbox` or `radio` SHALL be mapped to a TestPulse `select` custom field, with the mapped field created (or reused, if already created by an earlier case in the same import) as a project custom field and populated on the imported case. A Qase custom field of any other type (`number`, `checkbox`, `multiselect`, `url`, `user`, `datetime`) SHALL be dropped from the imported case, and SHALL be named individually by its Qase field title in the job's report — never omitted, never collapsed into a summary count.

#### Scenario: A mappable custom field is created and populated
- **WHEN** a Qase case has a `selectbox`-typed custom field with a value
- **THEN** the imported TestPulse case has a corresponding `select` custom field populated with that value

#### Scenario: An unmappable custom field is named in the report, not silently dropped
- **WHEN** a Qase project uses a custom field of type `multiselect`, `number`, `checkbox`, `url`, `user`, or `datetime`
- **THEN** the import's report names that field explicitly, by its Qase title, as dropped, and no imported case silently loses data without it appearing in the report

### Requirement: The web app offers importing a Qase project as a project-creation entry point
The project creation entry point SHALL offer "Import from Qase" alongside "Start from scratch" and "Import from TestRail" as a distinct path, leading to a dedicated screen for connecting to Qase with an API token and project code, previewing an import via a dry run, and confirming a real import.

#### Scenario: A user can reach the Qase import flow from project creation
- **WHEN** a user with permission to create projects opens the "+ New project" entry point
- **THEN** Qase is offered as one of the available import sources, and choosing it navigates to the Qase import flow
