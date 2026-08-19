## MODIFIED Requirements

### Requirement: Suites index and detail page
The suites index SHALL show each suite as a card with its name, a pass-rate health
bar (or a "Never run" state when it has no runs yet), its case count, and its last-run
time. Selecting a suite SHALL navigate to a dedicated route
(`/projects/{projectKey}/suites/{suiteKey}`) rather than opening an inline dialog,
matching the full-entity-page pattern already used for cases and run items:
breadcrumbs, a properties sidebar (case count, pass rate, created date, and
rename/delete/run actions), and a primary content area that defaults to a **view**
mode rather than the case-selection picker. Creating a suite SHALL navigate directly
into its new (empty) detail page rather than opening a combined name-and-case-selection
form on the index. The index card's and the sidebar's pass rate SHALL both follow the
same most-recent-closed-run rule as the Stability section's "Latest closed run"
property below — a suite's pass rate figure SHALL never be overridden by a newer,
still-open run's own rate, wherever it is shown.

The detail page's default (view) mode SHALL show two sections as primary content: a
**Stability** section rendering the suite's pass-rate trend, and a **Run history**
section listing the suite's own runs (name, pass-rate health bar or "not run yet,"
relative created date), newest first, each offering a "Compare…" action (see the Run
comparison requirement) when closed. The Run history section SHALL offer a "Compare
runs" action, scoped to the current project's closed runs, when the project has at
least two closed runs. View mode SHALL NOT render the case-selection picker.

Above the view switcher, a **Latest closed run** property SHALL show the pass-rate
health and relative date of the suite's most recently closed run, independent of
which Stability view is currently selected — this is one fact about the suite, not
something that changes meaning per view. A suite with no closed run at all SHALL show
a placeholder rather than a numeric value. When one or more runs newer than that
closed run are still open, a secondary **In progress** property SHALL name how many.
This property pairing replaces an earlier "headline" figure superimposed on the trend
itself: reusing this app's own template for a genuine cross-run aggregate (a large
number followed by "· N runs") to instead show one specific run's own rate was found,
live, to read as summarizing every point on the chart rather than naming a single one
of them — a real legibility failure, not merely a wording gap.

The Stability section SHALL offer two views, switchable via a persistent control and
never shown simultaneously: **Closed runs** (the suite's closed runs only, its default)
and **Open + closed** (every run created from the suite, regardless of status). Each
view SHALL carry its own caption stating what it counts, so the two views' differing
totals are never left unexplained. A run's own point in either trend SHALL be visually
distinguished as open or closed, and the most recent run's point SHALL be visually
emphasized as the current value and carry an always-visible percentage label — the
only point labeled without interaction. Every point (including the emphasized one)
SHALL reveal its own name, date, and pass rate via a tooltip on hover or keyboard
focus, so a specific value is never available only by inference from the trend's
shape.

An explicit **edit** mode, entered via a button labeled "Edit cases" (an actor with
suite-edit-membership permission) or "View cases" (an actor without it), SHALL render
the case-selection picker described below — scopable to a section (and its
descendants) using the project's own section hierarchy, filterable by
tag/priority/platform/test-type, and searchable by title, all composable together, with
selection preserved across scope, filter, and search changes, and rendering with a
bounded number of DOM rows regardless of how many cases are visible. An actor without
suite-edit-membership permission SHALL see the same case list, read-only (no checkboxes,
no commit action). Edit mode SHALL offer a control to return to view mode — labeled
"Cancel" alongside the commit action when editable, or "Done" alone when read-only —
discarding any uncommitted selection changes.

Each index card SHALL offer the same Run suite/Rename/Delete actions via a
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

#### Scenario: Suite detail page defaults to view mode
- **WHEN** a user opens a suite's detail page
- **THEN** its primary content shows the Stability and Run history sections, not the case-selection picker

#### Scenario: Stability section defaults to the closed-runs trend
- **WHEN** a user views a suite's detail page in view mode
- **THEN** the Stability section renders the "Closed runs" view by default, a trend of the suite's pass rate across its own closed runs only

#### Scenario: Switching to "Open + closed" shows every run, including in-progress ones
- **WHEN** a user switches the Stability section to "Open + closed"
- **THEN** the trend includes every run created from the suite, open or closed, with the still-open runs' rates reflecting only what has been recorded so far against their full case list

#### Scenario: Each Stability view states what it counts
- **WHEN** a user views either Stability view
- **THEN** a caption states whether the view counts closed runs only or open and closed runs together

#### Scenario: An open run's point reads as provisional, not final
- **WHEN** a user views the "Open + closed" trend and it includes an open run
- **THEN** that run's point is visually distinguished from a closed run's point, and the trend's line into it (if it is the most recent point) is styled distinctly from a line between two closed runs

#### Scenario: The most recent run is visually emphasized
- **WHEN** a user views either Stability trend with at least one point
- **THEN** the most recent run's point is visually emphasized relative to the other points

#### Scenario: Latest closed run is unaffected by which Stability view is selected
- **WHEN** a user switches between "Closed runs" and "Open + closed"
- **THEN** the Latest closed run property shows the same rate and date in both views

#### Scenario: The sidebar and index card pass rate agree with the Latest closed run property
- **WHEN** a suite has a settled closed-run history and a newer, still-open run
- **THEN** the Properties sidebar's pass rate and the suite's index card both show the same most-recent-closed-run rate as the Stability section's Latest closed run property, not the open run's own rate

#### Scenario: A trailing open run is surfaced as a peer fact, not folded into the closed-run rate
- **WHEN** one or more runs newer than the most recent closed run are still open
- **THEN** an In progress property names how many, separate from the Latest closed run property

#### Scenario: No closed runs at all shows a placeholder, not a numeric rate
- **WHEN** a suite has only open runs
- **THEN** the Latest closed run property shows a placeholder rather than a numeric pass rate, alongside the In progress property

#### Scenario: A point's exact value is available on hover or focus, not only by inference
- **WHEN** a user hovers or keyboard-focuses any point on a Stability trend
- **THEN** a tooltip shows that point's run name, date, and pass rate

#### Scenario: Only the most recent point carries an always-visible label
- **WHEN** a user views a Stability trend without interacting with it
- **THEN** only the most recent point shows its percentage; every other point's value requires hover or focus to reveal

#### Scenario: The y-axis states its scale
- **WHEN** a user views a Stability trend with at least one point
- **THEN** 0%, 50%, and 100% are labeled beside the trend, not left implicit in the gridlines alone

#### Scenario: The x-axis states its date range, not a claim of even time-spacing
- **WHEN** a user views a Stability trend with more than one point
- **THEN** the oldest and newest point's dates are shown at the chart's bottom corners, and no other point shows a static date label

#### Scenario: Run history section lists the suite's own runs
- **WHEN** a user views a suite's detail page in view mode
- **THEN** the Run history section lists runs created from that suite, newest first, each with its pass-rate health bar (or "not run yet") and relative created date

#### Scenario: Editors see "Edit cases", non-editors see "View cases"
- **WHEN** a user with suite-edit-membership permission views a suite's detail page, versus a user without it
- **THEN** the button into the case list reads "Edit cases" for the former and "View cases" for the latter, both opening the same case list

#### Scenario: Non-editor sees the case list read-only
- **WHEN** a user without suite-edit-membership permission opens the case list via "View cases"
- **THEN** the case list renders without checkboxes or a commit action, and offers only a "Done" control to return to view mode

#### Scenario: Editing mode shows the filterable case membership picker
- **WHEN** a user with suite-edit-membership permission opens the case list via "Edit cases"
- **THEN** the suite's member cases are shown in a checkbox list filterable by tag, priority, platform, and test type, with selection preserved across filter changes

#### Scenario: Leaving edit mode without committing discards changes
- **WHEN** a user has checked or unchecked cases in edit mode without clicking the commit action, then clicks "Cancel"
- **THEN** the page returns to view mode with the suite's membership unchanged

#### Scenario: Creating a suite opens straight into its detail page
- **WHEN** a user creates a new suite from the index
- **THEN** the app navigates to that suite's (empty) detail page instead of showing a case-selection form on the index

#### Scenario: Scoping to a section narrows the case list to its subtree
- **WHEN** a user selects a section in the case grid's section tree, in edit mode
- **THEN** only cases in that section or one of its descendant sections are shown

#### Scenario: Searching by title composes with scope and filters
- **WHEN** a user enters a search term while a section scope and/or dropdown filters are active, in edit mode
- **THEN** only cases matching the search term, the scope, and the filters are shown

#### Scenario: Selection survives scope, filter, and search changes
- **WHEN** a user checks a case, then changes the section scope, a dropdown filter, or the search term such that the case is no longer visible, in edit mode
- **THEN** the case remains selected, and reappears checked once the scope/filter/search is cleared or changed back

#### Scenario: The case list stays bounded at scale
- **WHEN** a suite's project has hundreds of cases and no scope, filter, or search is applied, in edit mode
- **THEN** the case list renders only a small, bounded number of DOM rows at any time, not one per matching case

#### Scenario: Renaming a suite
- **WHEN** a user renames a suite from its detail page
- **THEN** the suite's name updates everywhere it is shown, including the index

#### Scenario: Deleting a suite preserves its cases
- **WHEN** a user deletes a suite from its detail page
- **THEN** the suite no longer appears on the index, and its former member cases are untouched in the Library

#### Scenario: Run suite fires immediately on confirm
- **WHEN** a user clicks "Run suite" and confirms the dialog without customizing the selection
- **THEN** a run is created from the suite's current member cases, the suite's Run history section updates, and a confirmation toast naming the run appears, with a link to view it

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
- **WHEN** a user drags the divider between the case picker's expanded "Sections" rail and the case list, or focuses the divider and presses Left/Right/Home/End, in edit mode
- **THEN** the rail's width updates live, clamped between 200px and 480px, and persists per-device across reloads

#### Scenario: No resize handle while the section rail is collapsed
- **WHEN** a user collapses the case picker's "Sections" rail via its "Hide" toggle, in edit mode
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
sections), pre-select and highlight the seeded run-name field's text so it reads as
something to confirm rather than an inert placeholder, and SHALL record the created
run's `suiteKey`. Leaving the selector on "No suite" SHALL create a run with no suite
reference (an ad hoc run) using only the picker's selection, with no separate ad
hoc-specific UI. The "Create run" action SHALL be disabled while zero cases are
selected. On successful creation, the app SHALL navigate to the new run's detail page
and show a one-shot confirmation naming the run that was created.

The quick-run dialog reachable from a suite's "Run suite" action SHALL pre-fill its
name field with a suggested name and select (highlight) that text on focus, so
accepting it — by typing over it or confirming as-is — is a deliberate choice rather
than an unexamined default.

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
- **THEN** the app navigates to that run's detail page and shows a one-shot confirmation naming the run that was created, which does not reappear on a later visit or refresh

#### Scenario: Quick-run dialog highlights its suggested name
- **WHEN** a user opens the "Run suite" quick-run dialog
- **THEN** the pre-filled name field's text is selected, so typing immediately replaces it or it can be accepted as-is via Enter or "Create run"

#### Scenario: Customize-selection hand-off highlights its seeded name
- **WHEN** a user clicks "Customize selection" from the quick-run dialog
- **THEN** the "New run" form's name field is focused with its seeded text selected

### Requirement: Run comparison
The web UI SHALL let a user compare two closed runs from the same project side by
side, at `/runs/compare/{runKeyA}/{runKeyB}`. Each run SHALL
render as its own status chart (the same component used elsewhere for a single run's
status breakdown), labeled with its name, status, suite, and creation date, ordered
older run first regardless of which run key appears first in the route. Below the
charts, the UI SHALL show the item-level diff in five sections — Regressed, Improved,
Unchanged, Added, Removed — with Regressed and Improved visually leading and Unchanged
collapsed by default. A run's own page SHALL offer a "Compare to previous run" action
when the run **itself is closed**, is linked to a suite, and that suite has a closed
run immediately preceding it; otherwise the action SHALL NOT be shown. A run's own page
SHALL also offer a general "Compare…" action when the run is closed, navigating to the
explicit picker with this run pre-selected as one side of the comparison. Each row on
the project's Runs page, and each row in a suite's Run history section, SHALL offer the
same "Compare…" action via a context menu (right-click, and a visible "⋯" trigger) when
that row's run is closed; selecting it SHALL navigate to the explicit picker with that
run pre-selected. The project's Runs page, and a suite's Run history section, SHALL each
also offer an unseeded "Compare runs" action when the project has at least two closed
runs, navigating to the explicit picker with neither side pre-selected. An explicit
picker at `/projects/{projectKey}/runs/compare` SHALL let a user choose any two closed
runs from that project to compare, navigating to the comparison route on submit; when
reached with a pre-selected run, that run SHALL be selected as the first choice on
arrival. Each side of the picker SHALL show enough about each candidate run to
distinguish same-named runs from one another — at minimum its relative creation date and
pass-rate health — both while choosing and once chosen. Selecting a run on one side
SHALL remove it from the other side's choices, so the same run can never be selected on
both sides at once.

#### Scenario: Comparing two runs shows both status charts
- **WHEN** a user opens the comparison route for two closed runs from the same project
- **THEN** both runs' status charts render side by side, older run first, each labeled with its name and creation date

#### Scenario: Item-level diff is categorized into five sections
- **WHEN** a user views a run comparison
- **THEN** cases that regressed, improved, stayed unchanged, were added, or were removed between the two runs each appear in their own labeled section

#### Scenario: Unchanged cases are collapsed by default
- **WHEN** a user opens a run comparison
- **THEN** the Unchanged section shows only its count until the user expands it

#### Scenario: "Compare to previous run" appears only when the run itself is closed and a prior closed run exists
- **WHEN** a user views a closed run that is linked to a suite with an earlier closed run
- **THEN** the run's page offers a "Compare to previous run" action that navigates directly to the comparison against that prior run

#### Scenario: No "Compare to previous run" action on an open run
- **WHEN** a user views a run that is still open, even if its suite has an earlier closed run
- **THEN** no "Compare to previous run" action is shown, since comparing against an open run is always rejected

#### Scenario: No compare action when there is no prior run to compare against
- **WHEN** a user views a closed run that is not suite-linked, or whose suite has no earlier closed run
- **THEN** no "Compare to previous run" action is shown

#### Scenario: A closed run's page offers a general Compare action
- **WHEN** a user views a closed run's own page
- **THEN** a "Compare…" action is available that navigates to the explicit picker with this run pre-selected

#### Scenario: An open run's page offers no Compare action
- **WHEN** a user views a run that is still open
- **THEN** neither "Compare to previous run" nor the general "Compare…" action is shown

#### Scenario: A closed run row offers Compare via its context menu
- **WHEN** a user right-clicks (or opens the "⋯" trigger on) a closed run's row on the Runs page or a suite's Run history section
- **THEN** a context menu offers "Compare…", which navigates to the explicit picker with that run pre-selected

#### Scenario: An open run row offers no Compare action
- **WHEN** a user right-clicks (or opens the "⋯" trigger on) an open run's row
- **THEN** no "Compare…" action is offered

#### Scenario: The explicit picker only offers closed runs from the same project
- **WHEN** a user opens the run comparison picker
- **THEN** only closed runs from the current project are selectable, and submitting navigates to the comparison route for the two chosen runs

#### Scenario: Arriving at the picker with a pre-selected run
- **WHEN** a user opens the picker via a "Compare…" action on a specific run
- **THEN** that run is already selected as the first choice, leaving only the second run to be picked

#### Scenario: An unseeded "Compare runs" action opens the picker cold
- **WHEN** a user clicks "Compare runs" on the project's Runs page or a suite's Run history section, with at least two closed runs in the project
- **THEN** the picker opens with neither side pre-selected

#### Scenario: "Compare runs" is hidden with fewer than two closed runs
- **WHEN** a project has fewer than two closed runs
- **THEN** neither the Runs page nor a suite's Run history section offers the "Compare runs" action

#### Scenario: Same-named runs are distinguishable in the picker
- **WHEN** a project has two or more closed runs sharing the same name
- **THEN** each one's relative creation date and pass-rate health are shown alongside its name, both in the list of choices and once selected

#### Scenario: Selecting a run on one side removes it from the other
- **WHEN** a user selects a run as the first choice in the picker
- **THEN** that run is no longer offered as a choice for the second side, and vice versa
