## ADDED Requirements

### Requirement: Run comparison
The web UI SHALL let a user compare two closed runs from the same project side by
side, at `/runs/compare/{runKeyA}/{runKeyB}`. Each run SHALL
render as its own status chart (the same component used elsewhere for a single run's
status breakdown), labeled with its name, status, suite, and creation date, ordered
older run first regardless of which run key appears first in the route. Below the
charts, the UI SHALL show the item-level diff in five sections — Regressed, Improved,
Unchanged, Added, Removed — with Regressed and Improved visually leading and Unchanged
collapsed by default. A run's own page SHALL offer a "Compare to previous run" action
when the run is linked to a suite and that suite has a closed run immediately preceding
it; otherwise the action SHALL NOT be shown. An explicit picker at
`/projects/{projectKey}/runs/compare` SHALL let a user choose any two closed runs from
that project to compare, navigating to the comparison route on submit.

#### Scenario: Comparing two runs shows both status charts
- **WHEN** a user opens the comparison route for two closed runs from the same project
- **THEN** both runs' status charts render side by side, older run first, each labeled with its name and creation date

#### Scenario: Item-level diff is categorized into five sections
- **WHEN** a user views a run comparison
- **THEN** cases that regressed, improved, stayed unchanged, were added, or were removed between the two runs each appear in their own labeled section

#### Scenario: Unchanged cases are collapsed by default
- **WHEN** a user opens a run comparison
- **THEN** the Unchanged section shows only its count until the user expands it

#### Scenario: "Compare to previous run" appears only when a prior closed run exists
- **WHEN** a user views a run that is linked to a suite with an earlier closed run
- **THEN** the run's page offers a "Compare to previous run" action that navigates directly to the comparison against that prior run

#### Scenario: No compare action when there is no prior run to compare against
- **WHEN** a user views a run that is not suite-linked, or whose suite has no earlier closed run
- **THEN** no "Compare to previous run" action is shown

#### Scenario: The explicit picker only offers closed runs from the same project
- **WHEN** a user opens the run comparison picker
- **THEN** only closed runs from the current project are selectable, and submitting navigates to the comparison route for the two chosen runs
