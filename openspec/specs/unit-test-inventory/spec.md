# unit-test-inventory

## Purpose

Lean, auto-created tracking of externally-run unit tests ingested from a
project's native JUnit XML — no TestPulse plugin or `testpulse_case_key`
property required. Each reported `<testcase>` auto-creates or updates a
unit test identity row (`project + classname + name`) with a bounded
(last-N) result history, giving visibility into unit-test pass/fail
trends at CI scale without treating thousands of thin, high-churn,
auto-discovered tests as curated `TestCase`/`Suite`/`Run`/`RunItem`
entities. Distinct from `execution-import`, which is deliberately
match-only against existing, human-authored cases and never
auto-creates them.

## Requirements

### Requirement: Zero-setup ingestion of native JUnit XML
The system SHALL let an authenticated actor (human or agent) with
`runCreate` permission on a project submit that project's native JUnit
XML test report — produced by any test runner, without any TestPulse-
specific property or plugin — and have every reported `<testcase>`
auto-create or update a unit test record identified by
`(project, classname, name)`, without requiring any pre-existing record
to match against.

#### Scenario: A never-before-seen test is auto-created
- **WHEN** a JUnit XML report is imported containing a `<testcase
  classname="..." name="...">` with no prior matching record in the
  project
- **THEN** a new unit test record is created for that
  `(classname, name)` pair, and a result row is recorded for it

#### Scenario: A previously-seen test is updated, not duplicated
- **WHEN** a JUnit XML report is imported containing a `<testcase>` whose
  `(classname, name)` pair already has a unit test record in the project
- **THEN** no new identity record is created — the existing record's
  cached current-status fields are updated, and a new result row is
  appended to its history

#### Scenario: No TestPulse-specific properties are required
- **WHEN** a JUnit XML report contains no `testpulse_case_key` property
  and was produced without any TestPulse plugin installed
- **THEN** every `<testcase>` is still ingested successfully, identified
  solely by its own `classname`/`name` attributes

#### Scenario: Malformed report is rejected
- **WHEN** the submitted report is not valid JUnit XML
- **THEN** the import is rejected with a `400` validation error, and no
  unit test records or results are created or updated

### Requirement: Ingestion is safely retryable via an idempotency key
An import request MAY include an optional `idempotencyKey`. The system
SHALL return the original successful response without re-ingesting the
report when the same actor retries with the same `idempotencyKey`.
Omitting the key SHALL preserve default behavior: every call ingests the
report fresh.

#### Scenario: Retry with the same idempotency key does not duplicate results
- **WHEN** an import request with `idempotencyKey: "abc"` succeeds, and
  the same actor submits another import request with the same report and
  `idempotencyKey: "abc"`
- **THEN** the second request returns the first request's original
  response, and no additional unit test results are recorded

#### Scenario: Omitting the idempotency key always ingests fresh
- **WHEN** two import requests with no `idempotencyKey` are submitted,
  even with identical report content
- **THEN** both are ingested independently, each appending its own result
  row(s)

### Requirement: Per-test result history is bounded
The system SHALL retain at most a fixed number of the most recent result
rows per unit test. When a new result would exceed that bound, the
system SHALL discard the oldest result(s) for that test so the bound is
never exceeded.

#### Scenario: Oldest results are pruned once the bound is exceeded
- **WHEN** a unit test already has the maximum retained number of result
  rows, and a new result is recorded for it
- **THEN** the oldest result row for that test is removed so the total
  count for that test remains at the bound

### Requirement: Identity has no continuity across renames
A unit test's identity is its `(project, classname, name)` triple. The
system SHALL NOT attempt to preserve history across a change to either
`classname` or `name` — such a change SHALL be treated as a distinct,
newly-created unit test with no history, independent of any
previously-recorded identity.

#### Scenario: A renamed test starts a fresh identity
- **WHEN** a JUnit XML report is imported with a `<testcase>` whose
  `classname`/`name` does not match any existing unit test record, even
  though a prior record exists for what a human would recognize as "the
  same test" under its old name
- **THEN** a new, independent unit test record is created with no
  history carried over from the old identity

### Requirement: Current status and history are queryable without joins against history
The system SHALL let an actor with `read` permission on a project list
every unit test's current status (optionally filtered by verdict) and
fetch one unit test's bounded result history, identified by its
`classname`/`name` pair.

#### Scenario: Listing current status reflects the most recent result
- **WHEN** an actor lists unit test results for a project after several
  imports have updated various tests
- **THEN** each listed test reflects the verdict, duration, and timestamp
  of its own most recently recorded result

#### Scenario: Filtering by verdict narrows the list
- **WHEN** an actor lists unit test results with `verdict=failed`
- **THEN** only tests whose current (most recent) verdict is `failed` are
  returned

#### Scenario: History returns results newest-first
- **WHEN** an actor fetches the result history for one unit test by its
  `classname`/`name` pair
- **THEN** the returned results are ordered newest-first, up to the
  retention bound

### Requirement: Agent parity for reading unit test results
The system SHALL expose an MCP tool for listing a project's unit test
results, enforcing the same permission and pagination semantics as the
equivalent REST endpoint, so an agent actor has read parity with a human
actor without needing direct REST access.

#### Scenario: An agent lists unit test results via MCP
- **WHEN** an agent actor with `read` permission on a project calls the
  `list_unit_test_results` MCP tool
- **THEN** the tool returns the same cursor-paginated, verdict-filterable
  results a human would see via the REST list endpoint
