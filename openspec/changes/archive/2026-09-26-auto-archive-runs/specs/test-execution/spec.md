## ADDED Requirements

### Requirement: A run can be manually archived and unarchived
Any actor with `manageProject` on a run's project SHALL be able to archive
or unarchive that run. Archiving is reversible and has no status
precondition — an open or closed run may be archived. An archived run
SHALL be excluded from the project's active run list by default, shown
instead in a separate archived section.

#### Scenario: Archiving a run
- **WHEN** an actor with `manageProject` archives a run
- **THEN** the run's `archived` flag becomes `true`, and it moves out of
  the active run list into the archived section

#### Scenario: Unarchiving a run
- **WHEN** an actor with `manageProject` unarchives a previously archived
  run
- **THEN** the run's `archived` flag becomes `false`, and it returns to
  the active run list

#### Scenario: Insufficient permission
- **WHEN** an actor without `manageProject` on the run's project attempts
  to archive or unarchive it
- **THEN** the request is rejected and the run's `archived` flag is
  unchanged

#### Scenario: An open run can be archived
- **WHEN** an actor with `manageProject` archives a run that is still
  `open`
- **THEN** the archive succeeds — archiving has no status precondition

### Requirement: Automatic run archiving
The system SHALL let a Tenant Admin configure a single, instance-wide
run-auto-archive age threshold, in days. A closed, non-archived run older
than the threshold, measured from its own `createdAt`, SHALL be
automatically archived by a background process the same way a manual
archive would. A threshold of `0` SHALL mean the policy is off — no run is
ever auto-archived. Open runs SHALL never be auto-archived regardless of
age.

#### Scenario: Threshold off by default
- **WHEN** an instance has never had `runAutoArchiveInactiveDays`
  configured
- **THEN** it defaults to `0` and no run is ever automatically archived

#### Scenario: Closed run past the threshold is auto-archived
- **WHEN** a Tenant Admin sets `runAutoArchiveInactiveDays` to a positive
  number and a closed, non-archived run's `createdAt` is older than that
  many days
- **THEN** the background worker archives the run the same as a manual
  archive would

#### Scenario: Open runs are never auto-archived
- **WHEN** an open run's `createdAt` is older than the configured
  `runAutoArchiveInactiveDays`
- **THEN** the run is left untouched by the automatic sweep

#### Scenario: Already-archived runs are not re-processed
- **WHEN** the automatic sweep runs
- **THEN** a run that is already `archived` is excluded from
  consideration, regardless of age

#### Scenario: Automatic archiving is audited as a system actor
- **WHEN** the background worker archives a run automatically
- **THEN** an audit log entry is recorded with actor kind `system`,
  distinct in actor ID from both the run-retention worker and the
  project-auto-archive worker

#### Scenario: Only a Tenant Admin can change the threshold
- **WHEN** a user without Tenant Admin standing attempts to change
  `runAutoArchiveInactiveDays`
- **THEN** the request is rejected
