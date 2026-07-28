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
suite's cases, rather than duplicating the picker inside the dialog. Each index card
SHALL offer the same Run suite/Rename/Delete actions via a right-click context menu
(and a visible "⋯" trigger), matching the context-menu pattern already used by
folder rows, case rows, and run item rows elsewhere in the app, without requiring
navigation into the suite's own detail page first.

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

#### Scenario: Right-clicking an index card opens its actions menu
- **WHEN** a user right-clicks a suite's card on the Suites index
- **THEN** a context menu opens at the cursor offering Run suite, Rename, and Delete, without navigating into the suite's detail page

#### Scenario: The visible "⋯" trigger opens the same menu
- **WHEN** a user clicks the "⋯" trigger on a suite's card
- **THEN** the same Run suite/Rename/Delete menu opens, anchored to the trigger rather than the cursor

#### Scenario: Acting from the index behaves identically to the detail page
- **WHEN** a user renames, deletes, or runs a suite from an index card's context menu
- **THEN** the effect (name change, removal, run creation) is identical to performing the same action from the suite's own detail page
