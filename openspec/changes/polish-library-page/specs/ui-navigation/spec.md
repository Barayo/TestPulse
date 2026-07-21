## MODIFIED Requirements

### Requirement: Breadcrumb trail
The web UI SHALL show a breadcrumb trail reflecting the user's current location — Projects
› {Project} for a project's own pages, extended with intermediate section names (and a
permanent "Library" crumb for the root) when browsing the library, or with the suite/run
name on those pages — with each ancestor segment a link back to that level. Once the trail
exceeds five segments, the middle SHALL collapse behind a single control that reveals the
hidden segments on demand; the first two segments (entry point and project) and the last
two (immediate parent and current location) SHALL always remain visible and never require
horizontal scrolling to see.

#### Scenario: Deep section nesting collapses the middle of the trail
- **WHEN** a user views a page whose breadcrumb trail exceeds five segments (e.g. several levels of nested sections)
- **THEN** the trail shows the first two and last two segments, with the segments between them collapsed behind a single control, and the current page remains visible without scrolling

#### Scenario: Collapsed segments remain reachable
- **WHEN** a user activates the collapsed-segments control
- **THEN** the hidden segments are listed in order, each navigating to that segment when selected

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
