## MODIFIED Requirements

### Requirement: Run creation
The Runs page SHALL show the project's runs as the primary content, grouped into two
sections — Open, then Closed — each ordered newest-first, with a "+ New run" button
that navigates to a dedicated route (`/projects/{projectKey}/runs/new`) rather than
rendering the case-picker form inline above the list. Each run row SHALL show its
name, a pass-rate health bar (or "not run yet" when it has no items), and a relative
created date. The Open and Closed sections SHALL each be labeled with a count; the
Closed section SHALL display at most 10 rows initially, with a control to reveal the
rest. The "New run" form on that route SHALL let a user select cases via a
section-tree-scoped, searchable, filterable, virtualized case picker (the same
mechanics as the suite case picker) instead of implicitly including every case in the
project. The form SHALL offer an optional suite selector; choosing a suite SHALL seed
the picker's selection with that suite's current member case keys (leaving the
section-tree scope at "All sections," since a suite's cases may span multiple
sections) and SHALL record the created run's `suiteKey`. Leaving the selector on "No
suite" SHALL create a run with no suite reference (an ad hoc run) using only the
picker's selection, with no separate ad hoc-specific UI. The "Create run" action SHALL
be disabled while zero cases are selected. On successful creation, the app SHALL
navigate to the new run's detail page and show a one-shot confirmation that the run
was created.

#### Scenario: Opening the Runs page shows the runs list first
- **WHEN** a user navigates to a project's Runs page
- **THEN** the list of existing runs is the primary visible content, not the "New run" form

#### Scenario: Runs are grouped into Open and Closed sections
- **WHEN** a user views a project's Runs page with at least one open and one closed run
- **THEN** open runs are listed in an "Open" section and closed runs in a separate "Closed" section below it, each labeled with its count

#### Scenario: Each run row shows its health at a glance
- **WHEN** a user views the Runs page
- **THEN** each row shows the run's name, a pass-rate health bar (or "not run yet" if it has no items), and a relative created date

#### Scenario: A long Closed section stays bounded
- **WHEN** a project has more than 10 closed runs
- **THEN** the Closed section initially shows 10 rows with a control to reveal the remaining ones

#### Scenario: A section with no runs shows an inline empty state
- **WHEN** a project has runs but one of the two sections (Open or Closed) is empty
- **THEN** that section shows a one-line empty-state message instead of being hidden entirely

#### Scenario: Zero runs shows a single unified empty state
- **WHEN** a project has no runs at all
- **THEN** the page shows one empty-state card (not two empty sections) with a call to action to create a run

#### Scenario: "+ New run" opens the dedicated creation route
- **WHEN** a user clicks "+ New run" on the Runs page
- **THEN** the app navigates to `/projects/{projectKey}/runs/new`, showing the case-picker form

#### Scenario: New run defaults to an empty, explicit selection
- **WHEN** a user opens the "New run" form with no suite selected
- **THEN** no cases are pre-selected and "Create run" is disabled until at least one case is checked

#### Scenario: Selecting a suite seeds the picker with its cases
- **WHEN** a user selects a suite in the "New run" form's suite selector
- **THEN** the picker's selection is set to that suite's current member cases, editable afterward, and the section-tree scope remains "All sections"

#### Scenario: A run created with a suite selected records that suite
- **WHEN** a user creates a run with a suite selected in the form
- **THEN** the created run's `suiteKey` matches that suite

#### Scenario: A run created with no suite selected is ad hoc
- **WHEN** a user creates a run with the suite selector left on "No suite"
- **THEN** the created run has no `suiteKey`, using only the hand-picked case selection

#### Scenario: The case picker scopes, searches, and stays bounded at scale
- **WHEN** a project has hundreds of cases
- **THEN** the "New run" form's case picker supports section-tree scoping and title search, composable together, and renders only a bounded number of DOM rows regardless of case volume

#### Scenario: Creating a run navigates to it with a confirmation
- **WHEN** a user creates a run from the dedicated "New run" route
- **THEN** the app navigates to that run's detail page and shows a one-shot "Run created successfully" confirmation, which does not reappear on a later visit or refresh
