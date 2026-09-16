# zephyr-scale-import

## Purpose

Importing a Zephyr Scale Cloud project's `TEST_CASE` folder tree, cases,
steps, and mappable custom fields into a TestPulse project via the shared
import-job machinery, with a mandatory dry-run preview.

## Requirements

### Requirement: A Zephyr Scale import maps its TEST_CASE folder tree directly to a folder hierarchy, not to TestPulse Suites
The system SHALL map each Zephyr Scale `TEST_CASE`-type folder with no parent folder to a top-level TestPulse folder, and each `TEST_CASE`-type folder with a parent folder to a nested folder beneath its parent's mapped folder, recursively preserving Zephyr Scale's own folder tree. Zephyr Scale `TEST_PLAN`- and `TEST_CYCLE`-type folders SHALL NOT be fetched or mapped. Zephyr Scale cases SHALL be created as TestPulse cases within their folder's mapped folder, or the project's root folder if the case has no folder. TestPulse's own Suite construct (a named selection of cases for scoping a run) SHALL NOT be created, modified, or otherwise touched by a Zephyr Scale import.

#### Scenario: A root TEST_CASE folder becomes a top-level folder
- **WHEN** a Zephyr Scale project has a `TEST_CASE`-type folder with no parent folder
- **THEN** the import creates a corresponding top-level TestPulse folder for that folder

#### Scenario: A nested TEST_CASE folder becomes a nested folder
- **WHEN** a Zephyr Scale `TEST_CASE`-type folder has a parent folder
- **THEN** the import creates a nested TestPulse folder beneath the folder mapped from its parent

#### Scenario: A Zephyr Scale case is created in its folder's mapped folder
- **WHEN** a Zephyr Scale case belongs to a folder
- **THEN** the imported TestPulse case is created in the folder mapped from that folder

### Requirement: A case's step-by-step steps import directly; a script-only case's procedure is preserved as description text, never silently dropped
A Zephyr Scale case with step-by-step test steps SHALL have each step imported as a TestPulse step, with the step's test data (if present) appended to the step's action text. A case with no step-by-step steps but a plain-text or BDD test script SHALL have that script's text appended to the imported case's description, identified by its script type. A "call to test" step (one that delegates execution to another test case) SHALL be skipped without aborting the rest of that case's step import.

#### Scenario: Step-by-step steps import with their test data preserved
- **WHEN** a Zephyr Scale case has step-by-step steps, one of which has test data set
- **THEN** the imported TestPulse step's action text includes both the step's description and its test data

#### Scenario: A BDD-scripted case's procedure lands in the description, not lost
- **WHEN** a Zephyr Scale case has no step-by-step steps but has a BDD test script
- **THEN** the imported case has no steps, and its description includes the BDD script's text

#### Scenario: A call-to-test step does not abort the case's import
- **WHEN** a Zephyr Scale case's step-by-step steps include a step that delegates to another test case
- **THEN** the case still imports, with every other step of that case imported normally

### Requirement: Unmappable Zephyr Scale custom fields are dropped and individually named in the report, never silently
A Zephyr Scale custom field whose value is a plain string SHALL be mapped to a TestPulse `text` custom field, created (or reused, if already created by an earlier case in the same import) as a project custom field, and populated on the imported case. A Zephyr Scale custom field whose value is any other JSON shape (object, array, number, boolean, or null) SHALL be dropped from the imported case, and SHALL be named individually by its Zephyr Scale field name in the job's report — never omitted, never collapsed into a summary count. (No Zephyr Scale custom field maps to a TestPulse `select` field in this capability — Zephyr Scale's public API does not expose the field-type metadata needed to distinguish a genuine single-choice field from free text.)

#### Scenario: A string-valued custom field is created and populated
- **WHEN** a Zephyr Scale case has a custom field whose value is a plain string
- **THEN** the imported TestPulse case has a corresponding `text` custom field populated with that value

#### Scenario: An unmappable custom field is named in the report, not silently dropped
- **WHEN** a Zephyr Scale case has a custom field whose value is not a plain string
- **THEN** the import's report names that field explicitly, by its Zephyr Scale field name, as dropped, and no imported case silently loses data without it appearing in the report

### Requirement: The web app offers importing a Zephyr Scale project as a project-creation entry point
The project creation entry point SHALL offer "Import from Zephyr Scale" alongside "Start from scratch," "Import from TestRail," and "Import from Qase" as a distinct path, leading to a dedicated screen for connecting to Zephyr Scale with an API access token and project key, previewing an import via a dry run, and confirming a real import.

#### Scenario: A user can reach the Zephyr Scale import flow from project creation
- **WHEN** a user with permission to create projects opens the "+ New project" entry point
- **THEN** Zephyr Scale is offered as one of the available import sources, and choosing it navigates to the Zephyr Scale import flow
