## MODIFIED Requirements

### Requirement: Project landing shows top-level structure only
A project's landing page SHALL show three independent panels — Library, Suites, and Recent
runs — each limited to its top items with a link to the full view, rather than the
project's entire content at once. Each panel's entire header SHALL be clickable to that
same full view, and every item row shown SHALL itself link directly to that item, not just
to the panel's own full-list view. The Library panel SHALL include a visible entry for
test cases that live directly in the project's root section, not only for named
subsections, so a case created before any subsection existed is never invisible there.

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

#### Scenario: Root-level cases are visible on the landing page
- **WHEN** a project has one or more test cases living directly in its root section (not inside any named subsection)
- **THEN** the Library panel shows a row representing them, distinct from named subsections, that navigates to the root section's contents when clicked

### Requirement: Library with two-pane navigation
The web UI SHALL provide a library browsing view — labeled "Library" for the project's
auto-created root — with a section tree for navigation and a content list showing the
selected section's direct subsections and test cases. Every case lives in exactly one
section; the underlying data model remains unchanged, only user-facing copy and routes use
"Library"/"Section" instead of "Folder." A user SHALL be able to move a case to a
different section either by dragging its row onto a section (in the tree or shown inline
in the content list), or via a "Move to…" action that opens a folder picker — both call
the same underlying move.

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
