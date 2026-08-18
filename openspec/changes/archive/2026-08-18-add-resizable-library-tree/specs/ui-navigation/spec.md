## MODIFIED Requirements

### Requirement: Library with two-pane navigation
The web UI SHALL provide a library browsing view — labeled "Library" for the project's
auto-created root — with a section tree for navigation and a content list showing the
selected section's direct subsections and test cases. Every case lives in exactly one
section; the underlying data model remains unchanged, only user-facing copy and routes use
"Library"/"Section" instead of "Folder." A user SHALL be able to move a case to a
different section either by dragging its row onto a section (in the tree or shown inline
in the content list), or via a "Move to…" action that opens a folder picker — both call
the same underlying move. On viewports narrower than 768px, the section tree SHALL NOT be
shown alongside the content list; the content list SHALL render at full width, upward
navigation SHALL be available via the breadcrumb trail, and a "Browse sections" action SHALL
open the same folder-picker used by "Move to…" for navigating to any section directly. On
viewports 768px and wider, the section tree's width SHALL be resizable by dragging a divider
between it and the content list, or via the keyboard when the divider has focus, clamped
between 200px and 480px and defaulting to 256px; the chosen width SHALL persist per-device
across reloads and navigation. Every section row, in the tree and in the content list, SHALL
show its direct (non-recursive) case count without requiring the section to be opened, and a
critical-priority indicator when at least one of its direct cases is `critical` priority. The
content list's section rows SHALL additionally show an automation-coverage meter (the
fraction of direct cases marked automated, or an explicit "empty" state for a section with no
direct cases) — a single-tone indicator, not a pass/fail health band, since automation
coverage is not an execution-health signal. Every case row SHALL show its priority, platform,
test type, and automated/manual status as compact badges without requiring the case to be
opened, with the priority badge tinted by severity (low/medium/high/critical, low→high
reusing the app's existing neutral/progress/risk status bands, critical reusing the same
destructive tint as the section row's critical-priority indicator) rather than flat/uncolored,
plus a "Stale" indicator in place of its relative last-updated time once the case has gone
unedited for 90 or more days, and a distinct flaky indicator when the case's current version
is currently flaky (per the `flaky-detection` capability), shown alongside — not instead of —
its other badges.
The content list SHALL provide title search and tag/priority/platform/test-type/automated/
flaky filtering scoped to the currently selected section by default, with an explicit toggle to
search and filter across every section in the project; a cross-project match SHALL be
labeled with its section path. A section with no subsections and no cases, regardless of
filter state, SHALL read as genuinely empty; a section that has cases but none match an
active search/filter SHALL instead offer to clear the filters, distinct from the genuinely-
empty state. The mobile "Browse sections" picker SHALL show each section's depth (by
indentation) and its direct case count.

#### Scenario: Navigating into a nested section
- **WHEN** a user selects a section in the tree
- **THEN** the content list updates to show that section's direct subsections and cases, and the breadcrumb reflects the new path

#### Scenario: A section can contain both subsections and cases
- **WHEN** a section has both child sections and test cases assigned directly to it
- **THEN** the content list shows both, distinguishable by icon

#### Scenario: Moving a case via drag-and-drop
- **WHEN** a user drags a case row onto a section shown in the tree or inline in the content list
- **THEN** the case moves to that section, and the content list no longer shows it in its previous location

#### Scenario: Moving a case via the Move-to picker
- **WHEN** a user opens a case's "Move to…" action and selects a different section from the picker
- **THEN** the case moves to that section, the same as if it had been dragged there

#### Scenario: Dropping a case onto its current section is a no-op
- **WHEN** a user drags a case row and drops it onto the section it already belongs to
- **THEN** nothing changes — no request is made and no error is shown

#### Scenario: Section tree is hidden below 768px
- **WHEN** a user views the Library on a viewport narrower than 768px
- **THEN** the section tree is not shown, and the content list renders at full width

#### Scenario: Breadcrumbs cover upward navigation on mobile
- **WHEN** a user on a viewport narrower than 768px selects a breadcrumb segment above the current section
- **THEN** the content list updates to show that ancestor section's contents, the same as selecting it in the tree would on desktop

#### Scenario: Browse sections covers sideways navigation on mobile
- **WHEN** a user on a viewport narrower than 768px opens "Browse sections" and selects a section that is not an ancestor of the current one
- **THEN** the content list updates to show that section's contents

#### Scenario: A truncated section name is still readable
- **WHEN** a section's name is too long to fit the tree pane's current width and is visually truncated
- **THEN** the full name is available on hover

#### Scenario: Resizing the section tree by dragging
- **WHEN** a user on a viewport 768px or wider drags the divider between the section tree and the content list
- **THEN** the tree pane's width updates live, clamped between 200px and 480px

#### Scenario: Resizing the section tree via keyboard
- **WHEN** a user focuses the resize divider and presses the Left or Right arrow key
- **THEN** the tree pane's width changes by 16px in that direction, clamped between 200px and 480px, and Home/End set it directly to the minimum or maximum

#### Scenario: Resized tree width persists across reloads
- **WHEN** a user resizes the section tree and then reloads the page or navigates away and back
- **THEN** the tree pane renders at the same width they last set, on that device

#### Scenario: Section rows show their direct case count
- **WHEN** the Library renders a section, whether in the tree or in the content list
- **THEN** the section's direct case count is visible without opening it

#### Scenario: A section with a critical case shows an indicator
- **WHEN** a section's direct cases include at least one `critical`-priority case
- **THEN** the section row shows a critical-priority indicator alongside its case count

#### Scenario: A case row's priority badge is colored by severity
- **WHEN** a user views case rows in the Library content list with different priorities
- **THEN** each priority badge is tinted by its severity band (low/medium/high/critical), not rendered in the same flat color as platform or test type

#### Scenario: A section's automation coverage is visible in the content list
- **WHEN** a user views the content list and a subsection row has at least one direct case
- **THEN** the row shows an automation-coverage meter reflecting the fraction of its direct cases marked automated

#### Scenario: Case rows show classification badges
- **WHEN** the Library renders a test case row
- **THEN** the case's priority, platform, test type, and automated/manual status are visible as badges without opening the case

#### Scenario: A stale case is marked distinctly from its last-updated time
- **WHEN** a case has gone unedited for 90 or more days
- **THEN** its row shows a "Stale" indicator in place of the usual relative last-updated time

#### Scenario: Filtering the current section never loses navigation state
- **WHEN** a user applies a tag/priority/platform/test-type/automated/flaky filter while viewing a section
- **THEN** only that section's cases matching the filter are shown, and switching sections or clearing the filter restores the section's full contents

#### Scenario: Searching across the whole project labels each match's section
- **WHEN** a user enables cross-project search and enters a term
- **THEN** matching cases from any section are shown, each labeled with its section path, regardless of which section is currently selected

#### Scenario: An empty section reads as genuinely empty
- **WHEN** a user opens a section with no subsections and no cases, regardless of filter state
- **THEN** the empty state reads as "Nothing here yet," not conflated with a filtered-to-zero result

#### Scenario: A filtered-to-zero section offers to clear filters, not create a case
- **WHEN** a section has cases but none match the active search/filter
- **THEN** the empty state offers to clear the filters and does not offer to create a case

#### Scenario: Mobile picker shows hierarchy and counts
- **WHEN** a user on a viewport narrower than 768px opens "Browse sections"
- **THEN** each row is indented to reflect its depth and shows its direct case count

#### Scenario: A flaky case is marked in the Library
- **WHEN** the Library renders a case row whose current version is currently flaky (per the `flaky-detection` capability)
- **THEN** the row shows a flaky indicator alongside its other classification badges

#### Scenario: Filtering the Library to only flaky cases
- **WHEN** a user enables the Flaky filter, alone or combined with tag/priority/platform/test-type/automated filters
- **THEN** only cases whose current version is currently flaky, and that also match any other active filters, are shown

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
