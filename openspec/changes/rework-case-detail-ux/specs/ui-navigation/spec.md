## MODIFIED Requirements

### Requirement: Viewing an existing test case
Selecting a test case SHALL navigate to a dedicated route
(`/projects/{projectKey}/cases/{caseKey}`) showing a read-only view of its title, current
version, steps, suite memberships, and version history. The page SHALL show its title and
steps as the full-width primary content, alongside a sidebar containing its properties,
version history, and a results section. Priority, platform, test type, and automated/
manual status SHALL render as pills; tags and suite memberships SHALL each render as
individual pill chips rather than comma-joined text. The page header SHALL provide an
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
page.

#### Scenario: Opening a case navigates to its own route
- **WHEN** a user selects a test case from the library content list
- **THEN** the browser URL changes to that case's detail route, keyed by the case's key, and the browser back button returns to the library view

#### Scenario: Viewing steps and suite membership
- **WHEN** a user views a test case that belongs to one or more suites
- **THEN** its steps are shown read-only and its suite memberships are shown as individual pill chips, independent of its section location

#### Scenario: Version history is visible
- **WHEN** a user views a case that has more than one version
- **THEN** its version history is listed in the sidebar with the current version clearly marked

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
