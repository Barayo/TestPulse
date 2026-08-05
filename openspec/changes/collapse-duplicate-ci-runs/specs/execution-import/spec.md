## ADDED Requirements

### Requirement: Imported runs are created closed
A run created by bulk import SHALL have status `closed` from the moment
it is created, not `open`. An imported run is a finished snapshot — every
item it contains already carries a final verdict at creation time, unlike
a manually-created run that is worked over time. An actor with
`manageProject` permission MAY reopen it afterward via the existing reopen
capability (see `test-execution`).

#### Scenario: New import creates a closed run
- **WHEN** a JUnit XML report is imported and the import succeeds
- **THEN** the created run's status is `closed`, not `open`

#### Scenario: A closed imported run can still be reopened
- **WHEN** an actor with `manageProject` permission reopens a run that was
  created via import
- **THEN** the run's status becomes `open`, exactly as reopening any other
  closed run
