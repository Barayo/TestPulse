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
state. Each index card SHALL offer the same Run suite/Rename/Delete actions via a
right-click context menu (and a visible "⋯" trigger), matching the context-menu
pattern already used by folder rows, case rows, and run item rows elsewhere in the
app, without requiring navigation into the suite's own detail page first. When the
case list's section tree ("Sections" rail) is expanded (not collapsed via its own
"Hide"/"Show sections" toggle), its width SHALL be resizable by dragging a divider
between it and the case list, or via the keyboard when the divider has focus, clamped
between 200px and 480px and defaulting to 224px; the chosen width SHALL persist
per-device across reloads and navigation, independently of the Library section tree's
own width preference.

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
- **THEN** its member cases are shown in a list filterable by tag, priority, platform, and test type, each row showing its membership state via a circular checkmark indicator (not a checkbox), with selection preserved across filter changes

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
- **THEN** a run is created from the suite's current member cases, the suite's "Last run" property updates, and an inline confirmation banner with a "View run" link appears on the page

#### Scenario: Customize selection hands off to the New run form
- **WHEN** a user clicks "Customize selection" in the Run suite dialog
- **THEN** the app navigates to the project's dedicated "New run" route with the suite selected and its cases pre-selected, editable before creating the run

#### Scenario: Right-clicking an index card opens its actions menu
- **WHEN** a user right-clicks a suite's card on the Suites index
- **THEN** a context menu opens at the cursor offering Run suite, Rename, and Delete, without navigating into the suite's detail page

#### Scenario: The visible "⋯" trigger opens the same menu
- **WHEN** a user clicks the "⋯" trigger on a suite's card
- **THEN** the same Run suite/Rename/Delete menu opens, anchored to the trigger rather than the cursor

#### Scenario: Acting from the index behaves identically to the detail page
- **WHEN** a user renames, deletes, or runs a suite from an index card's context menu
- **THEN** the effect (name change, removal, run creation) is identical to performing the same action from the suite's own detail page

#### Scenario: Resizing the case picker's section tree
- **WHEN** a user drags the divider between the case picker's expanded "Sections" rail and the case list, or focuses the divider and presses Left/Right/Home/End
- **THEN** the rail's width updates live, clamped between 200px and 480px, and persists per-device across reloads

#### Scenario: No resize handle while the section rail is collapsed
- **WHEN** a user collapses the case picker's "Sections" rail via its "Hide" toggle
- **THEN** no resize divider is shown, since there is nothing to resize while the rail itself isn't rendered

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
- **THEN** no cases are pre-selected and "Create run" is disabled until at least one case is selected

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

## ADDED Requirements

### Requirement: Case picker selection is checkbox-free with bidirectional range-toggle

The case-selection picker (shared by suite membership editing and run creation)
SHALL indicate each row's membership state with a circular checkmark indicator and a
row tint rather than a native checkbox, while remaining keyboard-focusable and
exposed to assistive technology as a checkbox (role, checked state, and accessible
name unchanged). Shift+Click on a row SHALL apply that row's resulting checked state
to every row between it and the last individually-toggled row — bidirectionally,
unlike an additive-only range-select — since membership is a toggle, not a one-way
gather-then-act list. The same range model SHALL be available from the keyboard: a
focus indicator moves through the rows via arrow keys or j/k, scrolling the picker's
virtualized viewport directly to keep the focused row visible; Space toggles the
focused row and sets it as the range anchor; Shift+Space extends the bidirectional
range to the focused row.

#### Scenario: A row shows a circular checkmark, not a checkbox
- **WHEN** a user views the case picker
- **THEN** each row shows an empty circular outline when unselected, or a filled circle with a checkmark when selected, with no checkbox glyph

#### Scenario: The picker stays accessible as a checkbox list
- **WHEN** a screen reader or automated accessibility query inspects a picker row
- **THEN** the row is exposed with role "checkbox", a checked state matching its selection, and an accessible name matching the case title

#### Scenario: First Shift+Click on a range selects one row and sets the anchor
- **WHEN** a user Shift+Clicks a row with no prior anchor
- **THEN** only that row's checked state toggles, and it becomes the range anchor

#### Scenario: A later Shift+Click applies the clicked row's resulting state to the whole range
- **WHEN** a user Shift+Clicks a row after an anchor exists, and the clicked row was previously unchecked
- **THEN** every row between the anchor and the clicked row becomes checked

#### Scenario: A bidirectional range-toggle can also uncheck a range
- **WHEN** a user Shift+Clicks a row after an anchor exists, and the clicked row was previously checked
- **THEN** every row between the anchor and the clicked row becomes unchecked

#### Scenario: Arrow keys move focus and scroll the virtualized viewport directly
- **WHEN** a user presses an arrow key (or j/k) while the case picker has keyboard focus, and the target row is outside the currently rendered window
- **THEN** the picker's viewport scrolls to bring the target row into its rendered window and visible area

#### Scenario: Space toggles the focused row
- **WHEN** a user presses Space with a row focused and no prior anchor
- **THEN** that row's checked state toggles and it becomes the range anchor

#### Scenario: Shift+Space extends the bidirectional range from the keyboard
- **WHEN** a user presses Shift+Space with a row focused after an anchor exists
- **THEN** every row between the anchor and the focused row takes on the focused row's resulting checked state
