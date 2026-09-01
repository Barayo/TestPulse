# test-plans

## Purpose

Test Plan as the execution-scope grouping of Runs belonging to one
Release (e.g. one Test Plan per platform being tested against a
release), distinct from ISTQB's "Test Plan" (a planning document) — see
`introduce-release-test-plan`'s design.md D2 for the naming rationale.

## Requirements

### Requirement: Test Plan entity scoped to a Release
The system SHALL let a user with `manageProject` permission on a project
create a Test Plan scoped to one of the project's Releases, with a `name`
and an optional `description`. Every Test Plan SHALL be assigned an
immutable `key`, scoped to its project (see `resource-keys`), used to
address it in the API and UI. A user with `manageProject` permission SHALL
be able to update a Test Plan's `name` and `description`, and delete a Test
Plan. A Test Plan's Release SHALL NOT change after creation. Deleting a Test
Plan SHALL NOT delete its Runs — deletion is rejected while the Test Plan
still has Runs scoped to it, so a user cannot silently orphan execution
history.

#### Scenario: A newly created Test Plan has a key and belongs to its Release
- **WHEN** a user creates a Test Plan scoped to a Release
- **THEN** the Test Plan is created with a `key` assigned, and its Release reference matches the Release it was created under

#### Scenario: A permission that doesn't include manageProject cannot create or edit a Test Plan
- **WHEN** a user whose effective permissions on a project do not include `manageProject` attempts to create, edit, or delete a Test Plan
- **THEN** the request is rejected with `403`

#### Scenario: Deleting a Test Plan with Runs is rejected
- **WHEN** a user attempts to delete a Test Plan that still has one or more Runs scoped to it
- **THEN** the request is rejected, and the Test Plan and its Runs are unaffected

#### Scenario: Deleting a Test Plan with no Runs succeeds
- **WHEN** a user with `manageProject` permission deletes a Test Plan that has no Runs scoped to it
- **THEN** the Test Plan is removed and no longer appears in its Release's Test Plan list

### Requirement: Listing a Release's Test Plans
The system SHALL let a user with `read` permission on a project list a
Release's Test Plans, ordered newest-first by creation time.

#### Scenario: Listing a Release's Test Plans
- **WHEN** a user with `read` permission requests a Release's Test Plans
- **THEN** all Test Plans scoped to that Release are returned, newest-first

### Requirement: Listing every Test Plan across a project's Releases
The system SHALL let a user with `read` permission on a project list every
Test Plan across all of the project's Releases in a single request, so a
Test Plan picker (e.g. on run creation) never needs to fetch each Release's
Test Plans individually.

#### Scenario: Listing all of a project's Test Plans in one request
- **WHEN** a user with `read` permission requests every Test Plan across a project's Releases
- **THEN** all Test Plans belonging to any of that project's Releases are returned in a single response

### Requirement: Test Plan rollup reporting
The system SHALL provide a server-side aggregate pass rate and Run count for
a Test Plan, computed across all Runs scoped to it, via a single aggregate
query — never a client-side per-Run fetch loop. A Test Plan with no Runs
SHALL report a `null` pass rate rather than `0%`.

#### Scenario: Test Plan rollup aggregates across its Runs
- **WHEN** a Test Plan has two Runs, one at 100% pass rate (5 items) and one at 60% pass rate (5 items)
- **THEN** the Test Plan's rollup reports a combined pass rate of 80% across 10 items

#### Scenario: A Test Plan with no Runs yet reports a null pass rate
- **WHEN** a Test Plan has no Runs scoped to it
- **THEN** its rollup pass rate is `null`, not `0%`
