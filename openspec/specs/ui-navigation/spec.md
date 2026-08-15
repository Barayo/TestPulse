# ui-navigation

## Purpose

Single-active-project navigation and information architecture for the web UI:
a compact project switcher, a three-panel project landing (Library/Suites/Recent
runs), a two-pane library explorer for browsing/organizing test cases, suite
membership management, and a breadcrumb trail — replacing an earlier flat,
kitchen-sink page with no persistent orientation.
## Requirements
### Requirement: Breadcrumb trail
The web UI SHALL show a breadcrumb trail reflecting the user's current location, on every project-scoped page except the project's own landing page (which shows none — see the Project switcher requirement). The trail SHALL NOT include a leading "Projects › {Project}" segment — the header chip already answers "which project" persistently, so repeating it in the trail is redundant. The trail SHALL end before any segment that would repeat the current page's own heading. Once the trail exceeds five segments, the middle SHALL collapse behind a single control that reveals the hidden segments on demand; the last two visible segments (immediate parent and current location) SHALL always remain visible and never require horizontal scrolling to see. When trimming leaves exactly one real ancestor segment, the trail SHALL still render that one segment as a back-link (e.g. "‹ Suites"), rather than being suppressed the way an empty trail is — a single genuine ancestor is still useful orientation, unlike a trail that would otherwise only ever have contained the now-redundant project segment.

#### Scenario: No breadcrumb on a project's own landing page
- **WHEN** a user opens a project's landing page
- **THEN** no breadcrumb trail is shown — the persistent header and the page's own heading already establish the project without a third repeat

#### Scenario: Breadcrumb reflects section depth
- **WHEN** a user navigates two levels deep into the library
- **THEN** the breadcrumb shows a "Library" crumb for the root and both ancestor section names, each linking back to that level — no leading project segment

#### Scenario: No breadcrumb on a page whose only ancestor was the project
- **WHEN** a user opens the Suites index, the Runs index, or a run's own page
- **THEN** no breadcrumb trail is shown — trimming the redundant leading project segment and the trailing segment that duplicates the page's own heading ("Suites", "Runs", or the run's name) leaves nothing left to show

#### Scenario: A single real ancestor still renders as a back-link
- **WHEN** a user opens a suite's detail page directly under the suites index (no deeper nesting)
- **THEN** the breadcrumb shows a single "‹ Suites" back-link, not an empty trail — it is a real, still-useful ancestor, distinct from the project segment the header chip already covers

#### Scenario: Deep section nesting collapses the middle of the trail
- **WHEN** a user views a page whose breadcrumb trail exceeds five segments (e.g. several levels of nested sections)
- **THEN** the trail shows the first two and last two segments, with the segments between them collapsed behind a single control, and the current page remains visible without scrolling

#### Scenario: Collapsed segments remain reachable
- **WHEN** a user activates the collapsed-segments control
- **THEN** the hidden segments are listed in order, each navigating to that segment when selected

#### Scenario: Case detail breadcrumb does not repeat the case title
- **WHEN** a user opens a test case's detail page
- **THEN** the breadcrumb ends at the case's parent folder (or "‹ Library" if the case is unsectioned), and the case's title appears only in the page's own heading, not as a trailing breadcrumb segment

### Requirement: Project switcher
The web UI SHALL show the active project's name in a persistent header element with a caret fused onto it (when more than one project is accessible). The name portion SHALL be a direct link to that project's own page, separate from switching; the caret alone SHALL open a project switcher anchored directly beneath the trigger. The same switcher SHALL also be reachable from anywhere in the app via a keyboard shortcut. On the project's own landing page, the header trigger SHALL NOT render; the switch affordance SHALL instead fuse onto the page's own heading as a chevron, opening a centered searchable dialog (shared across every page that needs a switcher but has no anchored trigger of its own to attach a popover to). The active project SHALL remain resolved on every route nested under a run (e.g. a run item's own page), not only the run's own exact URL.

#### Scenario: Navigating to the active project via the header
- **WHEN** a user clicks the project name in the header
- **THEN** they are taken directly to that project's own page — no switcher opens

#### Scenario: Switching project via the header caret
- **WHEN** a user clicks the caret fused onto the header project name
- **THEN** a searchable list of all projects opens in a popover anchored directly beneath the trigger, each project showing its suite count, case count, and latest pass rate

#### Scenario: Header trigger renders as plain text with a single project
- **WHEN** the account has no more than one project
- **THEN** the header shows the project name as plain, non-interactive text — no caret, no hover feedback — since there is nothing to switch to

#### Scenario: Switching project via keyboard
- **WHEN** a user presses the project-switcher keyboard shortcut from any page
- **THEN** the switcher instance mounted on the current page opens — the header's anchored popover everywhere it renders, or the landing page's centered dialog where it doesn't

#### Scenario: Active project stays resolved on a run item's page
- **WHEN** a user opens a run item's own page
- **THEN** the header shows that run's project as the active project, not a "Select project" placeholder

#### Scenario: No header trigger on the project's own landing page
- **WHEN** a user opens a project's landing page
- **THEN** the header shows only the TestPulse wordmark, and a chevron fused onto the page's own heading opens the switcher's centered dialog instead

#### Scenario: Landing-page heading chevron is plain with a single project
- **WHEN** a user with only one accessible project opens that project's landing page
- **THEN** the heading shows no chevron and no switch affordance, matching the header trigger's single-project treatment

### Requirement: Brand wordmark
The web UI's header SHALL show the TestPulse brand mark — an icon tile
and a two-tone wordmark — matching the committed brand assets
(`assets/brand/`), always linking to the project list.

#### Scenario: Wordmark links home
- **WHEN** a user clicks the TestPulse wordmark from any page
- **THEN** they are taken to the project list

#### Scenario: Wordmark and icon match the brand assets
- **WHEN** the header renders
- **THEN** "Test" and "Pulse" are shown in their two distinct brand colors next to an icon tile, both consistent with `assets/brand/testpulse-icon.svg` and `assets/brand/testpulse-logo-horizontal.svg`

### Requirement: Project landing shows top-level structure only
A project's landing page SHALL show three independent panels — Library, Suites, and Recent
runs — each limited to its top items with a "see all" control linking to the full view,
rather than the project's entire content at once, and every item row shown SHALL itself
link directly to that item, not just to the panel's own full-list view. The Library panel
SHALL include a visible entry for test cases that live directly in the project's root
section, not only for named subsections, so a case created before any subsection existed
is never invisible there. Above the panels, the landing SHALL show a summary of the
project's own status as three distinct cells: a health ring with status label, suite/case
count tiles, and a last-run preview (time, run name, and pass rate) rather than a bare
timestamp. Each Library panel row SHALL show a magnitude bar reflecting its case count
relative to the panel's largest section, and a section with subsections SHALL support
expanding inline to preview its immediate children without navigating away. Each Suites
panel row SHALL show a colored pass-rate bar and percentage, or an explicit "Never run"
state for a suite with no runs yet. Each Recent runs row SHALL be color-coded by its
pass-rate band so an at-risk run is distinguishable at a glance, without reading its
percentage, and SHALL show a two-line treatment (run identity plus a pass/fail segment
bar) reflecting that it is the highest-frequency scan on this page.

#### Scenario: Dense project stays legible
- **WHEN** a project has more sections, suites, or runs than fit in a panel
- **THEN** each panel shows only its top items plus a link to the full list, not the full list inline

#### Scenario: Empty project shows per-panel empty states
- **WHEN** a project has cases or suites already, but one panel (e.g. Suites) has nothing in it yet
- **THEN** that panel shows its own empty-state message and call to action, independent of the other panels

#### Scenario: Entirely empty project shows a getting-started checklist instead of three empty panels
- **WHEN** a project has no sections with cases, no suites, and no runs at all
- **THEN** the landing shows a single getting-started checklist in place of the three panels, rather than three independent empty states

#### Scenario: Suite and run rows link directly to their item
- **WHEN** a user clicks a suite row or a run row shown on the landing
- **THEN** the user goes straight to that suite (open, ready to view/edit its cases) or that run's execution board — not just to the panel's full list

#### Scenario: Root-level cases are visible on the landing page
- **WHEN** a project has one or more test cases living directly in its root section (not inside any named subsection)
- **THEN** the Library panel shows a row representing them, distinct from named subsections, that navigates to the root section's contents when clicked

#### Scenario: Summary strip shows three distinct cells
- **WHEN** a user opens a project's landing page
- **THEN** the summary strip shows a health ring with status label, suite/case count tiles, and a last-run preview as three visually separated cells

#### Scenario: Summary strip omits last-run when the project has never run
- **WHEN** a project has no runs yet
- **THEN** the summary strip shows "No runs yet" instead of a pass rate or last-run time, matching the project list's own treatment

#### Scenario: Recent runs are color-coded by risk
- **WHEN** a project's Recent runs panel shows a run with a pass rate below 50%
- **THEN** that row is visually distinguished (e.g. a colored accent) from a healthy run's row, not just differentiated by its printed percentage

#### Scenario: Library panel rows show relative magnitude
- **WHEN** a user views the Library panel with more than one section
- **THEN** each section's row shows a bar sized relative to the panel's largest section's case count

#### Scenario: A section with subsections can be expanded inline
- **WHEN** a user clicks a Library panel row for a section that has subsections
- **THEN** its immediate children preview inline in the panel, without navigating to the Library page

#### Scenario: Suites panel rows show pass-rate health
- **WHEN** a user views the Suites panel and a suite has at least one closed run
- **THEN** its row shows a colored pass-rate bar and percentage matching the healthy/in-progress/at-risk bands

#### Scenario: A never-run suite shows a distinct state on the landing
- **WHEN** a suite shown on the landing has never had a run created from it
- **THEN** its row shows "Never run" rather than a 0% pass rate

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
open the same folder-picker used by "Move to…" for navigating to any section directly. Every
section row, in the tree and in the content list, SHALL show its direct (non-recursive) case
count without requiring the section to be opened, and a critical-priority indicator when at
least one of its direct cases is `critical` priority. The content list's section rows SHALL
additionally show an automation-coverage meter (the fraction of direct cases marked
automated, or an explicit "empty" state for a section with no direct cases) — a single-tone
indicator, not a pass/fail health band, since automation coverage is not an execution-health
signal. Every case row SHALL show its priority, platform, test type, and automated/manual
status as compact badges without requiring the case to be opened, with the priority badge
tinted by severity (low/medium/high/critical, low→high reusing the app's existing neutral/
progress/risk status bands, critical reusing the same destructive tint as the section row's
critical-priority indicator) rather than flat/uncolored, plus a "Stale" indicator in place of
its relative last-updated time once the case has gone unedited for 90 or more days, and a
distinct flaky indicator when the case's current version is currently flaky (per the
`flaky-detection` capability), shown alongside — not instead of — its other badges.
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
- **WHEN** a section's name is too long to fit the tree pane's fixed width and is visually truncated
- **THEN** the full name is available on hover

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

### Requirement: Creating a section
A user SHALL be able to create a subsection without navigating away from their current view, and the new section's parent SHALL always be the section where creation was triggered — no parent selector is presented.

#### Scenario: Creating a section in the currently open section
- **WHEN** a user triggers section creation while a section is open
- **THEN** an inline editable entry appears in that section's content, and confirming it creates the section as a child of the open section

#### Scenario: Creating a subsection from the tree without navigating
- **WHEN** a user triggers "new section" on a section shown in the tree without opening it
- **THEN** an inline editable entry appears as a child of that section in the tree, without changing the currently open section

### Requirement: Creating a test case
A user SHALL be able to create a test case within a section, specifying a title and zero or more steps, each with a required action and an optional expected result.

#### Scenario: Creating a case with steps
- **WHEN** a user creates a test case in a section with a title and one or more steps, each with an action and an expected result
- **THEN** a new test case is created in that section at version 1, with those steps

#### Scenario: Expected result per step is optional
- **WHEN** a user adds a step with only an action and no expected result
- **THEN** the case is created successfully, with that step's expected result empty

### Requirement: Viewing an existing test case
Selecting a test case SHALL navigate to a dedicated route
(`/projects/{projectKey}/cases/{caseKey}`) showing a read-only view of its title, current
version, steps, suite memberships, and version history. The page SHALL show its title and
steps as the full-width primary content, alongside a sidebar containing its properties,
version history, and a results section. Priority, platform, test type, and automated/
manual status SHALL render as pills; tags and suite memberships SHALL each render as
individual pill chips rather than comma-joined text. The priority pill SHALL be tinted by
severity, the same as everywhere else it renders. The page header SHALL provide an
actions menu offering "Move to…" and "Delete," using the same underlying actions already
available from the Library's row-level menu. Each version-history row SHALL show a terse
signal of what changed relative to the previous version (or that it is the initial
version), computed from already-loaded version content; selecting a row SHALL expand an
inline field-level diff without leaving the page. On viewports narrower than 768px, the
sidebar's sections SHALL collapse into stacked, independently-expandable sections in the
same order as the desktop sidebar, with no content omitted. Entering edit mode SHALL keep
the sidebar shell visible, with the Properties section becoming an inline edit form while
Results and Version History remain visible read-only. Selecting a version in the version
history SHALL still open a dialog (independent of the inline row signal) showing a
field-by-field diff against the previous version and the list of executions that pinned
that version, with a Flaky indicator when both a pass and a fail/blocked execution exist
for the same version. Each listed execution SHALL link to that execution's own run item
page. Each entry in the version history SHALL offer a restore action, gated behind a
confirmation explaining that restoring creates a new current version rather than altering
history.

#### Scenario: Opening a case navigates to its own route
- **WHEN** a user selects a test case from the library content list
- **THEN** the browser URL changes to that case's detail route, keyed by the case's key, and the browser back button returns to the library view

#### Scenario: Viewing steps and suite membership
- **WHEN** a user views a test case that belongs to one or more suites
- **THEN** its steps are shown read-only and its suite memberships are shown as individual pill chips, independent of its section location

#### Scenario: Version history is visible
- **WHEN** a user views a case that has more than one version
- **THEN** its version history is listed in the sidebar with the current version clearly marked

#### Scenario: Restoring a version requires confirmation
- **WHEN** a user triggers "Restore" on a past version
- **THEN** a confirmation explains that a new version will be created from the selected one and become current, before anything happens

#### Scenario: Restoring updates the current view
- **WHEN** a user confirms restoring a past version
- **THEN** the case view now shows the newly created version as current, with the restored content, and the full version history — including the version just restored from — remains listed

#### Scenario: Properties render as pills
- **WHEN** a user views a case's properties in the sidebar
- **THEN** priority, platform, test type, and automated/manual status are shown as pills, and tags are shown as individual pill chips

#### Scenario: Sidebar collapses to stacked sections on narrow viewports
- **WHEN** a user views a case detail page on a viewport narrower than 768px
- **THEN** properties, results, and version history render as stacked, independently-expandable sections below the steps, in the same order as the desktop sidebar

#### Scenario: Results section shows a designed empty state
- **WHEN** a user views a case for which no result-history data is available
- **THEN** the Results section still renders its label and placeholder chart chrome with a one-line explanation, rather than being omitted

#### Scenario: Steps section shows a real empty state, not a bare sentence
- **WHEN** a user views a case with no steps defined
- **THEN** the primary content area shows an explanatory empty state with a call to action to add steps, rather than a single line of text next to a fully-populated sidebar

#### Scenario: A short step list reads as a pane, not open whitespace
- **WHEN** a user views a case whose step list is much shorter than the sidebar's height
- **THEN** the steps render inside a bounded card, and the sidebar renders as a filled panel (not a hairline divider, which anti-aliases away in this palette's soft tones) sized to its own content height, signaling two independent panes rather than a single block expected to fill the same height

#### Scenario: The sidebar stays reachable while scrolling a long step list
- **WHEN** a user views a case whose step list is longer than the viewport and scrolls down to read later steps
- **THEN** the sidebar (properties, results, version history) stays pinned in view rather than scrolling out of reach

#### Scenario: Opening a version's detail dialog
- **WHEN** a user selects a version from the Version history list
- **THEN** a dialog opens showing that version's changes relative to the previous version and the executions that ran against it

#### Scenario: Diff shows only changed fields
- **WHEN** a user opens the detail dialog for a version where only the title and one step changed relative to the previous version
- **THEN** the dialog shows the title and that step as changed, and does not list unrelated unchanged fields

#### Scenario: Oldest version has nothing to diff against
- **WHEN** a user opens the detail dialog for a case's first version
- **THEN** the dialog states there is no previous version to compare against, instead of showing an empty or broken diff

#### Scenario: Executions list shows verdict per run
- **WHEN** a user opens the detail dialog for a version that has been executed in one or more runs
- **THEN** each execution is listed with its run name and verdict

#### Scenario: Flaky flag on mixed-verdict versions
- **WHEN** a version's executions include at least one pass and at least one failed or blocked result
- **THEN** the dialog marks that version as Flaky

#### Scenario: No flaky flag on consistent or unexecuted versions
- **WHEN** a version's executions are all the same outcome, or the version has never been executed
- **THEN** the dialog does not show a Flaky flag

#### Scenario: An execution links to its own run item page
- **WHEN** a user clicks an execution listed in the version detail dialog
- **THEN** the app navigates to that execution's run item page

#### Scenario: Version row shows a change signal without opening the dialog
- **WHEN** a user views the version history list for a case with more than one version
- **THEN** each row (other than the first) shows a terse summary of what changed relative to the previous version, such as a field count or field name

#### Scenario: Expanding a version row shows an inline diff
- **WHEN** a user clicks a version-history row
- **THEN** the row expands in place to show the changed fields and steps, without opening the version detail dialog

#### Scenario: Header actions menu offers Move to… and Delete
- **WHEN** a user opens the case detail page's header actions menu
- **THEN** it offers "Move to…" and "Delete," using the same underlying actions as the Library's row-level menu

#### Scenario: Deleting a case from its own page returns to the Library
- **WHEN** a user deletes a case from its detail page's actions menu and confirms
- **THEN** the case is soft-deleted and the user is returned to the Library

#### Scenario: Edit mode preserves the sidebar
- **WHEN** a user enters edit mode on a case detail page
- **THEN** the properties sidebar remains visible with Properties as an inline edit form, and Results and Version History still visible read-only

#### Scenario: The Properties sidebar's priority pill is colored by severity
- **WHEN** a user views a case's Properties sidebar
- **THEN** the priority pill is tinted by its severity band, the same as the Library row's priority badge

### Requirement: Editing a test case creates a new version
A user SHALL be able to edit an existing case's title and steps from
its view, and saving SHALL create a new immutable version rather than
modifying the existing one. Each version's row in the Version History
list SHALL show the editing actor's avatar and first name folded into
the existing change-signal line (not a separate line), when that
version has a known actor; the full name is available via a hover
tooltip. A version with no known actor (`actorKind: "unknown"`) SHALL
show its change signal with no avatar, never a placeholder.

#### Scenario: Saving an edit creates a new version
- **WHEN** a user edits a case's steps and saves
- **THEN** the case's current version increases, the new content is shown, and the previous version remains available in the version history

#### Scenario: A version history row shows who made the change
- **WHEN** a version has a known actor
- **THEN** the row shows that actor's avatar and first name next to the change signal, with the full name available on hover

#### Scenario: A version with no known actor shows no avatar
- **WHEN** a version's `actorKind` is `unknown`
- **THEN** its row shows the change signal alone, with no avatar and no placeholder

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
app, without requiring navigation into the suite's own detail page first.

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

### Requirement: Project list with permission-ready create action
Without an active project selected, the web UI SHALL show a list of all projects, with the create-project action and the empty-state call to action kept structurally separate from the list itself. The list SHALL render in one of two view modes, expanded or compact, chosen automatically from the project count and device, with a manual override always available. Each project SHALL show a status label derived from its pass rate, alongside the existing numeric value. A non-admin user who can see exactly one project SHALL be navigated directly into it instead of landing on the list. The list SHALL be orderable by name, suite count, case count, or creation date, in either direction, with the chosen order applied consistently across both view modes and within the pinned Favorites section. A project marked as the sample project SHALL show a "Sample" badge next to its name, in both view modes.

#### Scenario: Listing projects
- **WHEN** a user navigates to the project list with no project selected
- **THEN** every project is shown with its suite count, case count, and latest pass rate

#### Scenario: Single visible project skips the list for non-admins
- **WHEN** a non-admin user's project list contains exactly one project
- **THEN** the user is navigated directly to that project instead of seeing the list

#### Scenario: Admins always see the list, even with one project
- **WHEN** an admin's project list contains exactly one project
- **THEN** the admin still lands on the project list, not the project directly

#### Scenario: No projects yet
- **WHEN** there are no projects at all
- **THEN** an empty-state message is shown in place of the list, with its call to action rendered separately from where the list would be

#### Scenario: Small project counts default to the expanded view
- **WHEN** a desktop user has 10 or fewer projects and has not manually overridden the view
- **THEN** the list renders in expanded mode, with a pinned "Favorites" section for any starred projects

#### Scenario: Large project counts default to the compact view
- **WHEN** a desktop user has more than 10 projects and has not manually overridden the view
- **THEN** the list renders in compact mode

#### Scenario: Mobile always renders compact
- **WHEN** the list is viewed on a mobile-width viewport
- **THEN** it renders in compact mode regardless of project count or any manual override choice made previously on desktop

#### Scenario: Manual view toggle overrides the automatic choice
- **WHEN** a desktop user toggles the view manually
- **THEN** the list renders in the chosen mode regardless of project count, until changed again

#### Scenario: Manual view choice persists across reloads
- **WHEN** a user manually toggles the view and later reloads the page in the same browser
- **THEN** the list renders in the previously chosen mode, not the automatic default

#### Scenario: Status label matches the pass-rate band
- **WHEN** a project's pass rate is 84%
- **THEN** its status label reads "Healthy", matching the same band `HealthBar` colors teal

#### Scenario: Searching filters by name
- **WHEN** a user types part of a project's name into the search field
- **THEN** only projects whose name contains that text remain visible

#### Scenario: Filtering by status
- **WHEN** a user selects the "At risk" status filter
- **THEN** only projects whose status label is "At risk" remain visible

#### Scenario: Default sort order
- **WHEN** a user opens the project list with no prior sort preference stored
- **THEN** projects are ordered by name, ascending

#### Scenario: Sorting by a numeric key uses its sensible default direction
- **WHEN** a user selects "Suites" or "Cases" as the sort key for the first time
- **THEN** the list orders with the highest count first, without the user needing to also toggle direction

#### Scenario: Toggling sort direction
- **WHEN** a user toggles the sort direction control for the current sort key
- **THEN** the list re-orders to the opposite direction for that key

#### Scenario: Sort order applies within Favorites too
- **WHEN** a user changes the sort order in expanded view with starred projects present
- **THEN** the Favorites section and the main list both reflect the new order, not just one of them

#### Scenario: Sort preference persists across reloads
- **WHEN** a user chooses a sort key and direction and later reloads the page in the same browser
- **THEN** the list renders with the previously chosen sort, not the default

#### Scenario: Sort control is available on mobile
- **WHEN** the list is viewed on a mobile-width viewport
- **THEN** the sort control remains visible and usable, unlike the view-mode toggle which is desktop-only

#### Scenario: Sample Project shows a badge
- **WHEN** the project list includes the sample project
- **THEN** its row shows a "Sample" badge next to its name, in both expanded and compact view

#### Scenario: Non-sample projects show no badge
- **WHEN** the project list includes projects that are not the sample project
- **THEN** their rows show no "Sample" badge

### Requirement: Routes address projects, cases, runs, and suites by key
The web UI SHALL address projects, test cases, runs, and suites in the URL by their human-readable `key`, not their internal `id`. Folder routes are unaffected and continue to use the folder's internal id.

#### Scenario: Project route uses the project's key
- **WHEN** a user navigates to a project's landing page
- **THEN** the URL's project segment is that project's key, not a UUID

#### Scenario: Case route uses the case's key
- **WHEN** a user opens a test case
- **THEN** the URL's case segment is that case's key, not a UUID

#### Scenario: Run route uses the run's key
- **WHEN** a user opens a run's execution board
- **THEN** the URL's run segment is that run's key, not a UUID

#### Scenario: An unrecognized key does not resolve
- **WHEN** a user navigates to a URL whose project, case, or run segment does not match any existing key
- **THEN** the page shows a not-found state, the same as for any other unresolved identifier

### Requirement: Session expiry mid-use prompts re-login without losing place
If an authenticated user's session becomes invalid while they are actively using the web app (any request receives `401` after a session was already established), the UI SHALL present a non-dismissable login modal over the current view rather than navigating away or rendering an empty/broken state. The modal SHALL state why it appeared (e.g. "Your session has expired. Log back in to continue where you left off.") rather than presenting an unexplained login form. The modal SHALL NOT be closable except by successfully re-authenticating (no close button, no Escape, no click-outside dismissal). A `401` from the login or logout endpoints themselves SHALL NOT trigger this modal — a wrong-password attempt inside the modal must not re-trigger itself, and a user explicitly logging out of an already-invalid session must land cleanly on `/login`, not this modal. A `401` received before any session has been established (first load) SHALL continue to be handled by the existing redirect-to-`/login` behavior and SHALL NOT also trigger this modal. The modal SHALL pre-fill the email of the previously-authenticated user, with focus starting in the password field rather than email, but SHALL allow the email to be changed so a different account can log in instead. Errors on re-authentication (e.g. wrong password) SHALL be shown inline in the modal, not as a toast.

On successful re-authentication, the app SHALL reload rather than resume in place, since data already held in memory may belong to a different session: if the newly-authenticated user is the same as before, the app SHALL reload the current URL; if it is a different user, the app SHALL navigate to the home route instead of the current URL.

#### Scenario: A 401 after an established session opens the modal
- **WHEN** an authenticated user's session expires and a subsequent request returns `401`
- **THEN** a non-dismissable login modal appears over the current view, and the underlying URL does not change

#### Scenario: A first-load 401 does not trigger the modal
- **WHEN** an unauthenticated visitor's very first request (before any session was established) receives `401`
- **THEN** the existing redirect to `/login` occurs, and the session-expiry modal is not shown

#### Scenario: The modal cannot be dismissed without logging in
- **WHEN** the session-expiry modal is open
- **THEN** pressing Escape, clicking outside the modal, or looking for a close button has no effect — the modal stays open until re-authentication succeeds

#### Scenario: The email field is pre-filled but editable, and focus starts on password
- **WHEN** the session-expiry modal opens
- **THEN** the email field contains the previously-authenticated user's email and can be changed before submitting, and keyboard focus starts in the password field

#### Scenario: A wrong-password attempt inside the modal does not re-trigger it
- **WHEN** a user submits an incorrect password from within the session-expiry modal
- **THEN** the login request's own `401` shows an inline error and does not cause the modal to close, reopen, or otherwise re-fire

#### Scenario: Logging out of an already-expired session lands on /login, not this modal
- **WHEN** a user clicks "Log out" and the logout request itself receives `401` because the session was already invalid
- **THEN** the session-expiry modal does not appear and the user lands on `/login` as a normal logout would

#### Scenario: Re-authenticating as the same user resumes the same view
- **WHEN** the session-expiry modal's login succeeds and the authenticated user is the same as before the expiry
- **THEN** the app reloads the current URL

#### Scenario: Re-authenticating as a different user goes home
- **WHEN** the session-expiry modal's login succeeds as a different user than was previously authenticated
- **THEN** the app navigates to the home route instead of the URL that was open when the session expired

#### Scenario: A failed re-authentication attempt shows an inline error
- **WHEN** the session-expiry modal's login submission fails (e.g. wrong password)
- **THEN** an inline error message appears in the modal and it remains open

### Requirement: Entity icon vocabulary is applied consistently
Where the app already pairs an entity type with an icon (Section: folder,
Test Case: file-text, Suite: layers, Run: circle-play), every reference to
that entity type SHALL use the same icon — a page SHALL NOT show a
different entity's icon next to a label naming this one.

#### Scenario: A run's suite link uses the Suite icon
- **WHEN** a user views a run's detail page for a run created from a suite
- **THEN** the "From suite: …" link shows the Suite (layers) icon, not the Section (folder) icon

#### Scenario: Suites list rows show the Suite icon
- **WHEN** a user views the Suites index
- **THEN** each suite row shows the Suite (layers) icon, matching the icon treatment already used on Library rows

#### Scenario: The onboarding checklist's case step uses the Case icon
- **WHEN** a user views an empty project's getting-started checklist
- **THEN** the "Add your first test case" step shows the Test Case (file-text) icon, not the Section (folder) icon

### Requirement: User identity in the header links to the Profile page
The web UI's header SHALL show the authenticated user's avatar
alongside their email in the account menu trigger, and that menu SHALL
offer a Profile entry — the primary entry point into account settings.

#### Scenario: Header shows the user's avatar
- **WHEN** an authenticated user views any page
- **THEN** their avatar (preset or generated default) is shown next to their email in the header's account menu trigger

#### Scenario: Opening the account menu offers Profile
- **WHEN** a user opens the header's account menu
- **THEN** it offers a Profile entry, alongside the existing API tokens and Log out entries, that navigates to the Profile page

#### Scenario: Profile page links to existing settings
- **WHEN** a user opens the Profile page
- **THEN** it links to the existing Tokens page, previously reachable only by typing its URL directly; it does not duplicate instance administration (People, Roles) even for an admin account, since that already has its own entry point in the top-level Admin menu and is not a personal-account concern

### Requirement: Chosen avatar is shown everywhere a person's identity appears
A user's `Avatar` (preset or generated default) SHALL render
consistently anywhere their identity is shown in the web UI, not only
the header.

#### Scenario: Avatar appears on People, Project Members, and assignee surfaces
- **WHEN** a user has a preset avatar set
- **THEN** it is shown on PeoplePage, ProjectMembersPage, and wherever they appear as a run item's assignee

#### Scenario: A user-attributed result history entry shows that user's avatar
- **WHEN** a recorded result's `actorKind` is `user` and resolves to a real account
- **THEN** that account's current `Avatar` is shown next to the entry

#### Scenario: Agent, unknown, or overridden actors are unaffected
- **WHEN** a result's `actorKind` is `agent` or `unknown`, or the recorder used the "record on behalf of" free-text override
- **THEN** the entry keeps its existing plain-text treatment, with no avatar

