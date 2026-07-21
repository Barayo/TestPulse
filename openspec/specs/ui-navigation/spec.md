# ui-navigation

## Purpose

Single-active-project navigation and information architecture for the web UI:
a compact project switcher, a three-panel project landing (Library/Suites/Recent
runs), a two-pane library explorer for browsing/organizing test cases, suite
membership management, and a breadcrumb trail — replacing an earlier flat,
kitchen-sink page with no persistent orientation.
## Requirements
### Requirement: Breadcrumb trail
The web UI SHALL show a breadcrumb trail reflecting the user's current location — Projects
› {Project} for a project's own pages, extended with intermediate section names (and a
permanent "Library" crumb for the root) when browsing the library, or with the suite/run
name on those pages — with each ancestor segment a link back to that level. Once the trail
exceeds five segments, the middle SHALL collapse behind a single control that reveals the
hidden segments on demand; the first two segments (entry point and project) and the last
two (immediate parent and current location) SHALL always remain visible and never require
horizontal scrolling to see.

#### Scenario: Breadcrumb on a project's landing page
- **WHEN** a user opens a project's landing page
- **THEN** the breadcrumb shows "Projects" and the project's name, with "Projects" linking back to the project list

#### Scenario: Breadcrumb reflects section depth
- **WHEN** a user navigates two levels deep into the library
- **THEN** the breadcrumb shows the project name, a "Library" crumb for the root, and both ancestor section names, each linking back to that level

#### Scenario: Breadcrumb on a run page
- **WHEN** a user opens a run's execution board
- **THEN** the breadcrumb shows "Projects", the run's project name, and the run's name, with the first two segments linking back appropriately

#### Scenario: Deep section nesting collapses the middle of the trail
- **WHEN** a user views a page whose breadcrumb trail exceeds five segments (e.g. several levels of nested sections)
- **THEN** the trail shows the first two and last two segments, with the segments between them collapsed behind a single control, and the current page remains visible without scrolling

#### Scenario: Collapsed segments remain reachable
- **WHEN** a user activates the collapsed-segments control
- **THEN** the hidden segments are listed in order, each navigating to that segment when selected

### Requirement: Project switcher
The web UI SHALL show the active project's name in a persistent header
element as a direct link to that project's own page, separate from
switching. Once the account has more than one project, the header SHALL
also show an icon that opens a searchable project switcher; the same
switcher SHALL also be reachable from anywhere in the app via a keyboard
shortcut.

#### Scenario: Navigating to the active project via the header
- **WHEN** a user clicks the project name in the header
- **THEN** they are taken directly to that project's own page — no switcher opens

#### Scenario: Switching project via the header icon
- **WHEN** a user clicks the switch-project icon next to the header project name
- **THEN** a searchable list of all projects opens, each showing its suite count, case count, and latest pass rate

#### Scenario: Switch icon hidden with a single project
- **WHEN** the account has no more than one project
- **THEN** the switch-project icon is not shown, since there is nothing to switch to

#### Scenario: Switching project via keyboard
- **WHEN** a user presses the project-switcher keyboard shortcut from any page
- **THEN** the same project switcher opens, regardless of the current page

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
runs — each limited to its top items with a link to the full view, rather than the
project's entire content at once. Each panel's entire header SHALL be clickable to that
same full view, and every item row shown SHALL itself link directly to that item, not just
to the panel's own full-list view. The Library panel SHALL include a visible entry for
test cases that live directly in the project's root section, not only for named
subsections, so a case created before any subsection existed is never invisible there.
Above the panels, the landing SHALL show a summary of the project's own status — status
label, pass-rate bar, suite/case totals, and last-run time — matching the same
presentation used on the project list. Each Recent runs row SHALL be color-coded by its
pass-rate band so an at-risk run is distinguishable at a glance, without reading its
percentage.

#### Scenario: Dense project stays legible
- **WHEN** a project has more sections, suites, or runs than fit in a panel
- **THEN** each panel shows only its top items plus a link to the full list, not the full list inline

#### Scenario: Empty project shows per-panel empty states
- **WHEN** a project has cases or suites already, but one panel (e.g. Suites) has nothing in it yet
- **THEN** that panel shows its own empty-state message and call to action, independent of the other panels

#### Scenario: Entirely empty project shows a getting-started checklist instead of three empty panels
- **WHEN** a project has no sections with cases, no suites, and no runs at all
- **THEN** the landing shows a single getting-started checklist in place of the three panels, rather than three independent empty states

#### Scenario: Panel header is clickable beyond "see all"
- **WHEN** a user clicks anywhere on a panel's header (its icon or title), not only the "see all" text
- **THEN** the user navigates to that panel's full view, same as clicking "see all"

#### Scenario: Suite and run rows link directly to their item
- **WHEN** a user clicks a suite row or a run row shown on the landing
- **THEN** the user goes straight to that suite (open, ready to view/edit its cases) or that run's execution board — not just to the panel's full list

#### Scenario: Root-level cases are visible on the landing page
- **WHEN** a project has one or more test cases living directly in its root section (not inside any named subsection)
- **THEN** the Library panel shows a row representing them, distinct from named subsections, that navigates to the root section's contents when clicked

#### Scenario: Summary strip shows the project's own status
- **WHEN** a user opens a project's landing page
- **THEN** a summary strip above the panels shows the project's status label, pass-rate bar, suite count, case count, and time since its last run — the same data and presentation the project list already shows for it

#### Scenario: Summary strip omits last-run when the project has never run
- **WHEN** a project has no runs yet
- **THEN** the summary strip shows "No runs yet" instead of a pass rate or last-run time, matching the project list's own treatment

#### Scenario: Recent runs are color-coded by risk
- **WHEN** a project's Recent runs panel shows a run with a pass rate below 50%
- **THEN** that row is visually distinguished (e.g. a colored accent) from a healthy run's row, not just differentiated by its printed percentage

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
open the same folder-picker used by "Move to…" for navigating to any section directly.

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
version history, and a results section. Every scalar property (test type, automation,
platform, tags, version, suite memberships) SHALL render as a labeled `Label: value` pair;
priority alone SHALL render as a badge. On viewports narrower than 768px, the sidebar's
sections SHALL collapse into stacked, independently-expandable sections in the same order
as the desktop sidebar, with no content omitted. Selecting a version in the version history
SHALL open a dialog showing a field-by-field diff against the previous version and the list
of executions that pinned that version, with a Flaky indicator when both a pass and a
fail/blocked execution exist for the same version.

#### Scenario: Opening a case navigates to its own route
- **WHEN** a user selects a test case from the library content list
- **THEN** the browser URL changes to that case's detail route, keyed by the case's key, and the browser back button returns to the library view

#### Scenario: Viewing steps and suite membership
- **WHEN** a user views a test case that belongs to one or more suites
- **THEN** its steps are shown read-only and its suite memberships are shown as a property, independent of its section location

#### Scenario: Version history is visible
- **WHEN** a user views a case that has more than one version
- **THEN** its version history is listed in the sidebar with the current version clearly marked

#### Scenario: Properties render as labeled pairs
- **WHEN** a user views a case's properties in the sidebar
- **THEN** each scalar property is shown as `Label: value`, except priority, which is shown as a badge

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

### Requirement: Editing a test case creates a new version
A user SHALL be able to edit an existing case's title and steps from its view, and saving SHALL create a new immutable version rather than modifying the existing one.

#### Scenario: Saving an edit creates a new version
- **WHEN** a user edits a case's steps and saves
- **THEN** the case's current version increases, the new content is shown, and the previous version remains available in the version history

### Requirement: Suites list stays clean; membership managed in its own drawer
The suites list SHALL show only each suite's name and case count — not its member cases
inline. Selecting a suite SHALL open a drawer with that suite's full membership: each
member case listed with a way to remove it, and a searchable picker to add cases not yet
in the suite.

#### Scenario: Suite list shows summary only
- **WHEN** a user views the suites list
- **THEN** each row shows only the suite's name and case count, with no member cases or per-case controls visible

#### Scenario: Adding a case via search
- **WHEN** a user opens a suite's drawer and searches for a case by (partial) title
- **THEN** only matching cases not already in the suite are offered, and selecting one adds it immediately

#### Scenario: Removing a case from a suite
- **WHEN** a user removes a case from a suite's drawer
- **THEN** the case is no longer a member of that suite, but the case itself still exists

### Requirement: Project list with permission-ready create action
Without an active project selected, the web UI SHALL show a list of all projects, with the create-project action and the empty-state call to action kept structurally separate from the list itself. The list SHALL render in one of two view modes, expanded or compact, chosen automatically from the project count and device, with a manual override always available. Each project SHALL show a status label derived from its pass rate, alongside the existing numeric value. A non-admin user who can see exactly one project SHALL be navigated directly into it instead of landing on the list. The list SHALL be orderable by name, suite count, case count, or creation date, in either direction, with the chosen order applied consistently across both view modes and within the pinned Favorites section.

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

