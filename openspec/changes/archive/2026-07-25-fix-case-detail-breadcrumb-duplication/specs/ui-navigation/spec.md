## MODIFIED Requirements

### Requirement: Breadcrumb trail
The web UI SHALL show a breadcrumb trail reflecting the user's current location — Projects
› {Project} for a project's own pages, extended with intermediate section names (and a
permanent "Library" crumb for the root) when browsing the library, or with the suite/run
name on those pages — with each ancestor segment a link back to that level. Once the trail
exceeds five segments, the middle SHALL collapse behind a single control that reveals the
hidden segments on demand; the first two segments (entry point and project) and the last
two (immediate parent and current location) SHALL always remain visible and never require
horizontal scrolling to see. On a page that has its own heading for the current item (e.g.
a case's title), the trail SHALL end at that item's parent rather than repeating the
heading as a trailing crumb.

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

#### Scenario: Case detail breadcrumb does not repeat the case title
- **WHEN** a user opens a test case's detail page
- **THEN** the breadcrumb ends at the case's parent folder, and the case's title appears only in the page's own heading, not as a trailing breadcrumb segment
