## MODIFIED Requirements

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

## ADDED Requirements

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
