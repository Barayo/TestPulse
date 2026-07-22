# execution-import

## Purpose

Bulk-importing test results reported by external test runners (pytest,
Maven, Gradle, Jest — anything that can emit JUnit XML), matching each
reported test to an existing case by its key, without ever auto-creating
cases.

## Requirements

### Requirement: Bulk import of externally-run test results
The system SHALL let an authenticated actor (human or agent) submit a JUnit XML test report for a project, matching each reported test to an existing case by the case's own `key` (see `resource-keys`) carried in the report, and creating one run with items and results for every match. The system SHALL NOT create new cases for unmatched tests, and SHALL NOT fail the import because some or all tests are unmatched.

#### Scenario: Every reported test matches an existing case
- **WHEN** a JUnit XML report is imported and every `<testcase>`'s reported case key matches an existing case's `key` in the target project
- **THEN** the import succeeds with `201 Created`, and a new run is created with one item and one result per matched case

#### Scenario: Some reported tests have no matching case
- **WHEN** a JUnit XML report is imported and one or more `<testcase>` entries carry a case key with no matching case
- **THEN** the import still succeeds, with `207 Multi-Status`, a run is created containing items/results only for the matched tests, and the response lists which case keys were unmatched

#### Scenario: Unmatched tests never create cases
- **WHEN** an import contains an unmatched case key
- **THEN** no new test case is created for it — the case library is unaffected by the import

#### Scenario: Verdicts map from JUnit XML outcomes
- **WHEN** a `<testcase>` in the report has no failure/error/skipped child element, a `<failure>` element, an `<error>` element, or a `<skipped>` element
- **THEN** the recorded result verdict is `pass`, `failed`, `blocked`, or `skipped` respectively

#### Scenario: Case key is read from the report's properties
- **WHEN** a `<testcase>` has a `<properties><property name="testpulse_case_key" value="…"/></properties>` child
- **THEN** that value is used as the case key for matching, not the test's name or classname

#### Scenario: Malformed report is rejected
- **WHEN** the submitted report is not valid JUnit XML
- **THEN** the import is rejected with a `400` validation error, and no run is created

#### Scenario: Run name defaults from the report
- **WHEN** an import request does not specify a run name
- **THEN** the run is named after the report's own `<testsuite>` name if present, otherwise a generated default

#### Scenario: The runner's own test name is preserved alongside the matched case
- **WHEN** a `<testcase>` with `name="tests/test_foo.py::test_bar"` matches an existing case
- **THEN** the created run item records that literal name, independent of the matched case's own title

#### Scenario: Execution metadata is captured when present in the report
- **WHEN** a `<testcase>` carries `testpulse_platform`, `testpulse_version`, and/or `testpulse_tags` properties, and the report's timestamp/duration attributes are present
- **THEN** the recorded result includes whichever of platform, version, tags, start time, and end time were available — fields the report didn't supply are simply omitted, not guessed
