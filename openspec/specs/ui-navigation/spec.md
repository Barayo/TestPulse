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
name on those pages — with each ancestor segment a link back to that level.

#### Scenario: Breadcrumb on a project's landing page
- **WHEN** a user opens a project's landing page
- **THEN** the breadcrumb shows "Projects" and the project's name, with "Projects" linking back to the project list

#### Scenario: Breadcrumb reflects section depth
- **WHEN** a user navigates two levels deep into the library
- **THEN** the breadcrumb shows the project name, a "Library" crumb for the root, and both ancestor section names, each linking back to that level

#### Scenario: Breadcrumb on a run page
- **WHEN** a user opens a run's execution board
- **THEN** the breadcrumb shows "Projects", the run's project name, and the run's name, with the first two segments linking back appropriately

### Requirement: Project switcher
The web UI SHALL show the active project's name in a persistent header element, and SHALL let a user open a searchable project switcher from anywhere in the app.

#### Scenario: Switching project via the header
- **WHEN** a user clicks the project name in the header
- **THEN** a searchable list of all projects opens, each showing its suite count, case count, and latest pass rate

#### Scenario: Switching project via keyboard
- **WHEN** a user presses the project-switcher keyboard shortcut from any page
- **THEN** the same project switcher opens, regardless of the current page

### Requirement: Project landing shows top-level structure only
A project's landing page SHALL show three independent panels — Library, Suites, and Recent
runs — each limited to its top items with a link to the full view, rather than the
project's entire content at once. Each panel's entire header SHALL be clickable to that
same full view, and every item row shown SHALL itself link directly to that item, not just
to the panel's own full-list view.

#### Scenario: Dense project stays legible
- **WHEN** a project has more sections, suites, or runs than fit in a panel
- **THEN** each panel shows only its top items plus a link to the full list, not the full list inline

#### Scenario: Empty project shows per-panel empty states
- **WHEN** a project has no sections, suites, or runs yet
- **THEN** each panel shows its own empty-state message and call to action, independent of the other panels

#### Scenario: Panel header is clickable beyond "see all"
- **WHEN** a user clicks anywhere on a panel's header (its icon or title), not only the "see all" text
- **THEN** the user navigates to that panel's full view, same as clicking "see all"

#### Scenario: Suite and run rows link directly to their item
- **WHEN** a user clicks a suite row or a run row shown on the landing
- **THEN** the user goes straight to that suite (open, ready to view/edit its cases) or that run's execution board — not just to the panel's full list

### Requirement: Library with two-pane navigation
The web UI SHALL provide a library browsing view — labeled "Library" for the project's
auto-created root — with a section tree for navigation and a content list showing the
selected section's direct subsections and test cases. Every case lives in exactly one
section; the underlying data model remains unchanged, only user-facing copy and routes use
"Library"/"Section" instead of "Folder."

#### Scenario: Navigating into a nested section
- **WHEN** a user selects a section in the tree
- **THEN** the content list updates to show that section's direct subsections and cases, and the breadcrumb reflects the new path

#### Scenario: A section can contain both subsections and cases
- **WHEN** a section has both child sections and test cases assigned directly to it
- **THEN** the content list shows both, distinguishable by icon

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
Selecting a test case SHALL open a read-only view of its title, current version, steps, suite memberships, and version history.

#### Scenario: Viewing steps and suite membership
- **WHEN** a user views a test case that belongs to one or more suites
- **THEN** its steps are shown read-only and its suite memberships are shown, independent of its section location

#### Scenario: Version history is visible
- **WHEN** a user views a case that has more than one version
- **THEN** its version history is listed with the current version clearly marked

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
Without an active project selected, the web UI SHALL show a list of all projects, with the create-project action and the empty-state call to action kept structurally separate from the list itself.

#### Scenario: Listing projects
- **WHEN** a user navigates to the project list with no project selected
- **THEN** every project is shown with its suite count, case count, and latest pass rate

#### Scenario: No projects yet
- **WHEN** there are no projects at all
- **THEN** an empty-state message is shown in place of the list, with its call to action rendered separately from where the list would be
