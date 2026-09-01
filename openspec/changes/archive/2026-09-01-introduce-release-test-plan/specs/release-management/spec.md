## ADDED Requirements

### Requirement: Release entity and lifecycle status
The system SHALL let a user with `manageProject` permission on a project
create a Release scoped to that project, with a `name`, an optional
`description`, and a `status` of `active`, `maintained`, or `eol`
(default `active` at creation). Every Release SHALL be assigned an immutable
`key`, scoped to its project (see `resource-keys`), used to address it in the
API and UI. A user with `manageProject` permission SHALL be able to update a
Release's `name`, `description`, and `status` at any time, and delete a
Release. Deleting a Release SHALL NOT delete its Test Plans' Runs or their
results — deletion is rejected while the Release still has Test Plans, so a
user cannot silently orphan execution history.

#### Scenario: Creating a Release defaults to active status
- **WHEN** a user with `manageProject` permission creates a Release without specifying a status
- **THEN** the Release is created with `status: active`

#### Scenario: A newly created Release has a key
- **WHEN** a user creates a Release in a project
- **THEN** the Release is created with a `key` assigned, scoped to that project

#### Scenario: Updating a Release's status
- **WHEN** a user with `manageProject` permission changes a Release's status from `active` to `maintained`
- **THEN** the Release's status reflects `maintained` immediately, with no effect on its existing Test Plans or Runs

#### Scenario: A permission that doesn't include manageProject cannot create or edit a Release
- **WHEN** a user whose effective permissions on a project do not include `manageProject` attempts to create, edit, or delete a Release
- **THEN** the request is rejected with `403`

#### Scenario: Deleting a Release with Test Plans is rejected
- **WHEN** a user attempts to delete a Release that still has one or more Test Plans
- **THEN** the request is rejected, and the Release, its Test Plans, and their Runs are unaffected

#### Scenario: Deleting a Release with no Test Plans succeeds
- **WHEN** a user with `manageProject` permission deletes a Release that has no Test Plans
- **THEN** the Release is removed and no longer appears in the project's Release list

### Requirement: Listing and filtering Releases
The system SHALL let a user with `read` permission on a project list its
Releases, optionally filtered by `status`, ordered newest-first by creation
time.

#### Scenario: Listing all Releases
- **WHEN** a user with `read` permission requests a project's Releases with no filter
- **THEN** all of the project's Releases are returned, newest-first

#### Scenario: Filtering Releases by status
- **WHEN** a project has 2 `active` and 3 `eol` Releases, and a user requests Releases filtered to `status=active`
- **THEN** only the 2 `active` Releases are returned

### Requirement: Release rollup reporting
The system SHALL provide a server-side aggregate pass rate and Run count for
a Release, computed across all Runs belonging to any of its Test Plans, via
a single aggregate query — never a client-side per-Run or per-Test-Plan
fetch loop. A Release with no Runs across any of its Test Plans SHALL report
a `null` pass rate rather than `0%`.

#### Scenario: Release rollup aggregates across multiple Test Plans
- **WHEN** a Release has two Test Plans, one with a Run at 80% pass rate (10 items) and another with a Run at 40% pass rate (10 items)
- **THEN** the Release's rollup reports a combined pass rate of 60% across 20 items

#### Scenario: A Release with no Runs yet reports a null pass rate
- **WHEN** a Release's Test Plans have no Runs, or the Release has no Test Plans at all
- **THEN** the Release's rollup pass rate is `null`, not `0%`
