## MODIFIED Requirements

### Requirement: Project switcher
The web UI SHALL show the active project's name in a persistent header
element as a direct link to that project's own page, separate from
switching. Once the account has more than one project, the header SHALL
also show an icon that opens a searchable project switcher; the same
switcher SHALL also be reachable from anywhere in the app via a keyboard
shortcut. The active project SHALL remain resolved on every route nested
under a run (e.g. a run item's own page), not only the run's own exact
URL.

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

#### Scenario: Active project stays resolved on a run item's page
- **WHEN** a user opens a run item's own page
- **THEN** the header shows that run's project as the active project, not a "Select project" placeholder
