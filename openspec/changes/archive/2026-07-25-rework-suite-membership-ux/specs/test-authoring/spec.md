## MODIFIED Requirements

### Requirement: Test suite grouping
The system SHALL let a user with `suiteCreate` permission create suites within a project, and a user with `suiteEditMembership` permission manage an n:m membership between suites and test cases. Every suite SHALL be assigned an immutable `key`, scoped to its project (see `resource-keys`), used to address it in the API and UI. The web UI SHALL present suite creation and suite membership editing through the same checkbox-grid selection component: a filterable, checkbox-per-case list with a persistent selection count, rather than separate one-case-at-a-time flows. Toggling a case's checkbox SHALL update the selection regardless of which filter is currently applied, and changing a filter SHALL NOT alter which cases are selected. Suite creation SHALL let a user select cases in the same screen as naming the suite, rather than requiring the suite to be created empty first. Editing an existing suite's membership SHALL present the same grid pre-checked with its current members, committing only the net difference (added and removed cases) when saved.

#### Scenario: Add cases to a suite
- **WHEN** a user with `suiteEditMembership` permission adds two cases to a suite
- **THEN** the suite lists both cases, and each case can also belong to other suites

#### Scenario: Removing a case from a suite does not delete the case
- **WHEN** a user with `suiteEditMembership` permission removes a case from a suite
- **THEN** the case no longer appears in the suite but still exists in the project

#### Scenario: A newly created suite has a key
- **WHEN** a user with `suiteCreate` permission creates a suite in a project
- **THEN** the suite is created with a `key` assigned, scoped to that project

#### Scenario: Selecting cases at creation time
- **WHEN** a user names a new suite and checks several cases in the same screen before submitting
- **THEN** the created suite's membership includes exactly the checked cases, with no separate follow-up step required

#### Scenario: A filter change preserves checked selections
- **WHEN** a user checks a case, then applies a filter that hides that case from the visible list, then clears the filter
- **THEN** the case is still shown as checked

#### Scenario: Editing membership commits only the net change
- **WHEN** a user opens an existing suite's membership, unchecks one current member, checks two new cases, and saves
- **THEN** exactly one case is removed and exactly two cases are added — no other membership changes occur

#### Scenario: No cases match the applied filters
- **WHEN** a user applies a combination of filters that matches no test cases
- **THEN** the grid shows an explicit empty state rather than an empty list with no explanation
