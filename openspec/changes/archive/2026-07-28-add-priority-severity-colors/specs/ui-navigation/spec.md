## MODIFIED Requirements

### Requirement: Library with two-pane navigation
The Library SHALL present two panes side by side above 768px: a section tree on the left and,
on the right, the content list of the currently selected section's direct subsections and
cases — selecting a tree node updates the content list, and selecting a subsection row in the
content list navigates into it, moving the tree's selection to match, so both panes always
reflect the same underlying move. On viewports narrower than 768px, the section tree SHALL NOT
be shown alongside the content list; the content list SHALL render at full width, upward
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
its relative last-updated time once the case has gone unedited for 90 or more days. The
content list SHALL provide title search and tag/priority/platform/test-type/automated
filtering scoped to the currently selected section by default, with an explicit toggle to
search and filter across every section in the project; a cross-project match SHALL be
labeled with its section path. A section with no subsections and no cases, regardless of
filter state, SHALL read as genuinely empty; a section that has cases but none match an
active search/filter SHALL instead offer to clear the filters, distinct from the genuinely-
empty state. The mobile "Browse sections" picker SHALL show each section's depth (by
indentation) and its direct case count.

#### Scenario: A case row's priority badge is colored by severity
- **WHEN** a user views case rows in the Library content list with different priorities
- **THEN** each priority badge is tinted by its severity band (low/medium/high/critical), not rendered in the same flat color as platform or test type

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
page.

#### Scenario: The Properties sidebar's priority pill is colored by severity
- **WHEN** a user views a case's Properties sidebar
- **THEN** the priority pill is tinted by its severity band, the same as the Library row's priority badge
