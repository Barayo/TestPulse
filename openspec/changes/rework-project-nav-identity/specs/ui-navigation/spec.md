## MODIFIED Requirements

### Requirement: Project switcher
The web UI SHALL show the active project's identity in a persistent header element as a fused chip — a colored initials avatar, the project name, and (once the account has more than one project) a chevron — sharing one visual container (background/hover/focus treatment reads as a single unit). The avatar+name portion SHALL be a direct link to that project's own page, separate from switching; the chevron alone SHALL open a searchable project switcher. The same switcher SHALL also be reachable from anywhere in the app via a keyboard shortcut. On the project's own landing page, the chip SHALL NOT render; the switch affordance SHALL instead fuse onto the page's own heading as a small chevron after the project name. The active project SHALL remain resolved on every route nested under a run (e.g. a run item's own page), not only the run's own exact URL.

#### Scenario: Navigating to the active project via the header
- **WHEN** a user clicks the avatar or name portion of the header chip
- **THEN** they are taken directly to that project's own page — no switcher opens

#### Scenario: Switching project via the header chevron
- **WHEN** a user clicks the chevron on the header chip
- **THEN** a searchable list of all projects opens, each showing its suite count, case count, and latest pass rate

#### Scenario: Chip renders as plain text with a single project
- **WHEN** the account has no more than one project
- **THEN** the header shows the project name as plain, non-interactive text — no avatar, no pill background, no chevron, no hover feedback — since there is nothing to switch to

#### Scenario: Switching project via keyboard
- **WHEN** a user presses the project-switcher keyboard shortcut from any page
- **THEN** the same project switcher opens, regardless of the current page

#### Scenario: Active project stays resolved on a run item's page
- **WHEN** a user opens a run item's own page
- **THEN** the header shows that run's project as the active project, not a "Select project" placeholder

#### Scenario: No header chip on the project's own landing page
- **WHEN** a user opens a project's landing page
- **THEN** the header shows only the TestPulse wordmark (no chip), and a chevron fused onto the page's own heading opens the same switcher

#### Scenario: Landing-page heading chevron is plain with a single project
- **WHEN** a user with only one accessible project opens that project's landing page
- **THEN** the heading shows no chevron and no switch affordance, matching the header chip's single-project treatment

### Requirement: Breadcrumb trail
The web UI SHALL show a breadcrumb trail reflecting the user's current location, on every project-scoped page except the project's own landing page (which shows none — see the Project switcher requirement). The trail SHALL NOT include a leading "Projects › {Project}" segment — the header chip already answers "which project" persistently, so repeating it in the trail is redundant. The trail SHALL end before any segment that would repeat the current page's own heading. Once the trail exceeds five segments, the middle SHALL collapse behind a single control that reveals the hidden segments on demand; the last two visible segments (immediate parent and current location) SHALL always remain visible and never require horizontal scrolling to see. When trimming leaves exactly one real ancestor segment, the trail SHALL still render that one segment as a back-link (e.g. "‹ Suites"), rather than being suppressed the way an empty trail is — a single genuine ancestor is still useful orientation, unlike a trail that would otherwise only ever have contained the now-redundant project segment.

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
