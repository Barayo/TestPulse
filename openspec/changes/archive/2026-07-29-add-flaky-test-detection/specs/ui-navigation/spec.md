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
