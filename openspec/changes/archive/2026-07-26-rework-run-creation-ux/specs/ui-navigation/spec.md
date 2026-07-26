## ADDED Requirements

### Requirement: Run creation
The "New run" form SHALL let a user select cases via a section-tree-scoped,
searchable, filterable, virtualized case picker (the same mechanics as the
suite case picker) instead of implicitly including every case in the project.
The form SHALL offer an optional suite selector; choosing a suite SHALL seed
the picker's selection with that suite's current member case keys (leaving
the section-tree scope at "All sections," since a suite's cases may span
multiple sections) and SHALL record the created run's `suiteKey`. Leaving the
selector on "No suite" SHALL create a run with no suite reference (an ad hoc
run) using only the picker's selection, with no separate ad hoc-specific UI.
The "Create run" action SHALL be disabled while zero cases are selected.

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

## MODIFIED Requirements

### Requirement: Suites index and detail page
The suites index SHALL show each suite as a card with its name, a pass-rate health
bar (or a "Never run" state when it has no runs yet), its case count, and its last-run
time. Selecting a suite SHALL navigate to a dedicated route
(`/projects/{projectKey}/suites/{suiteKey}`) rather than opening an inline dialog,
matching the full-entity-page pattern already used for cases and run items:
breadcrumbs, a filterable case list as the primary content, and a properties sidebar
(case count, pass rate, last run, created date, and rename/delete/run actions).
Creating a suite SHALL navigate directly into its new (empty) detail page rather than
opening a combined name-and-case-selection form on the index. The case list SHALL be
scopable to a section (and its descendants) using the project's own section
hierarchy, filterable by tag/priority/platform/test-type, and searchable by title —
all composable together. Selection SHALL be preserved across scope, filter, and
search changes. The case list SHALL render with a bounded number of DOM rows
regardless of how many cases are visible, including the unscoped/unfiltered default
state. The detail page's Actions sidebar SHALL offer a "Run suite" action that opens
a confirm dialog showing the suite's current case count and an editable run name,
creating the run immediately on confirm; the dialog SHALL also offer a "Customize
selection" path that hands off to the project's "New run" form pre-seeded with the
suite's cases, rather than duplicating the picker inside the dialog.

#### Scenario: Suite index card shows health at a glance
- **WHEN** a user views the suites index and a suite has at least one run
- **THEN** its card shows a pass-rate health bar in the healthy/in-progress/at-risk band matching its rate

#### Scenario: Never-run suite shows a distinct state
- **WHEN** a suite has never had a run created from it
- **THEN** its card shows "Never run" rather than a 0% pass rate

#### Scenario: Selecting a suite navigates to its own page
- **WHEN** a user selects a suite from the index
- **THEN** the browser URL changes to that suite's detail route, and the browser back button returns to the index

#### Scenario: Suite detail page shows filterable case membership
- **WHEN** a user opens a suite's detail page
- **THEN** its member cases are shown in a checkbox list filterable by tag, priority, platform, and test type, with selection preserved across filter changes

#### Scenario: Creating a suite opens straight into its detail page
- **WHEN** a user creates a new suite from the index
- **THEN** the app navigates to that suite's (empty) detail page instead of showing a case-selection form on the index

#### Scenario: Scoping to a section narrows the case list to its subtree
- **WHEN** a user selects a section in the case grid's section tree
- **THEN** only cases in that section or one of its descendant sections are shown

#### Scenario: Searching by title composes with scope and filters
- **WHEN** a user enters a search term while a section scope and/or dropdown filters are active
- **THEN** only cases matching the search term, the scope, and the filters are shown

#### Scenario: Selection survives scope, filter, and search changes
- **WHEN** a user checks a case, then changes the section scope, a dropdown filter, or the search term such that the case is no longer visible
- **THEN** the case remains selected, and reappears checked once the scope/filter/search is cleared or changed back

#### Scenario: The case list stays bounded at scale
- **WHEN** a suite's project has hundreds of cases and no scope, filter, or search is applied
- **THEN** the case list renders only a small, bounded number of DOM rows at any time, not one per matching case

#### Scenario: Renaming a suite
- **WHEN** a user renames a suite from its detail page
- **THEN** the suite's name updates everywhere it is shown, including the index

#### Scenario: Deleting a suite preserves its cases
- **WHEN** a user deletes a suite from its detail page
- **THEN** the suite no longer appears on the index, and its former member cases are untouched in the Library

#### Scenario: Run suite fires immediately on confirm
- **WHEN** a user clicks "Run suite" and confirms the dialog without customizing the selection
- **THEN** a run is created from the suite's current member cases, and the suite's "Last run" property updates

#### Scenario: Customize selection hands off to the New run form
- **WHEN** a user clicks "Customize selection" in the Run suite dialog
- **THEN** the app navigates to the project's "New run" form with the suite selected and its cases pre-selected, editable before creating the run
