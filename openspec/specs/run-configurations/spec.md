# run-configurations

## Purpose

Letting a QA engineer label a run with the browser/OS/device
configuration it covers, and see a Test Plan's runs pivoted into a
case × configuration coverage matrix, so combination coverage gaps are
visible at a glance instead of tracked in a spreadsheet
(`add-run-configurations`).

## Requirements

### Requirement: A run can carry an optional free-text configuration label
The system SHALL allow a run to be created with an optional free-text
`configuration` label (e.g. "Chrome", "Firefox", "iOS Safari"),
analogous to the existing free-text `platform`/`tags` fields on a case.
This SHALL NOT be a managed/enumerated value — any string is accepted,
consistent with the project's existing decision against fixed
classification taxonomies.

#### Scenario: Creating a run with a configuration
- **WHEN** a run is created with a `configuration` value
- **THEN** that value is stored and returned on the run, unchanged by
  any later action

#### Scenario: Creating a run without a configuration
- **WHEN** a run is created without a `configuration` value
- **THEN** the run's `configuration` is absent/null, and the run
  behaves exactly as runs did before this capability existed

#### Scenario: Configuration is immutable after creation
- **WHEN** a run has already been created
- **THEN** no endpoint allows changing its `configuration` afterward,
  consistent with a run's `name` also having no update endpoint

### Requirement: A Test Plan's runs can be viewed as a case × configuration coverage matrix
The system SHALL provide an endpoint that pivots a Test Plan's runs into
a matrix: each run is a column (labeled by its `configuration` if set,
else its `name`), each case appearing in any of the plan's runs is a
row, and each cell is that run's current status for that case, absent
when the case doesn't appear in that run's items. The system SHALL
compute this matrix in a bounded number of database queries regardless
of how many runs or cases the plan has.

#### Scenario: The matrix includes every case from every run
- **WHEN** a Test Plan has multiple runs covering overlapping but not
  identical sets of cases
- **THEN** the matrix's rows are the union of all cases appearing in
  any of those runs, not just cases common to every run

#### Scenario: A case missing from one run's items renders as a gap
- **WHEN** a case appears in some but not all of a Test Plan's runs
- **THEN** the matrix cell for that case in a run lacking it is empty,
  distinct from a cell with a recorded status

#### Scenario: Runs without a configuration still appear as columns
- **WHEN** a Test Plan includes a run with no `configuration` set
- **THEN** that run still appears as a matrix column, labeled by its
  `name`, rather than being omitted

#### Scenario: Computing the matrix does not scale with per-run queries
- **WHEN** the matrix endpoint is called for a plan with N runs
- **THEN** the number of database queries issued does not grow
  linearly with N (items are fetched via one batched query across all
  of the plan's runs)
