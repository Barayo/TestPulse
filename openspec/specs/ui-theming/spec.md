# ui-theming Specification

## Purpose
TBD - created by archiving change add-dark-mode-toggle. Update Purpose after archive.
## Requirements
### Requirement: Theme defaults to the OS preference
When no explicit theme choice has been made, the app SHALL render using
the browser's `prefers-color-scheme` preference, and SHALL update live if
that OS-level preference changes while the app is open.

#### Scenario: Fresh visit follows a dark OS preference
- **WHEN** a user with no stored theme override opens the app on a system set to dark mode
- **THEN** the app renders in its dark theme

#### Scenario: Fresh visit follows a light OS preference
- **WHEN** a user with no stored theme override opens the app on a system set to light mode
- **THEN** the app renders in its light theme

#### Scenario: OS preference change is reflected live
- **WHEN** a user has no stored theme override and their OS-level color-scheme preference changes while the app is open
- **THEN** the app's rendered theme updates to match, without a page reload

### Requirement: A user can explicitly choose a theme
A user SHALL be able to choose Light or Dark explicitly, overriding the
OS preference, via a System/Light/Dark control in the user menu. The
choice SHALL persist across sessions in that browser.

#### Scenario: Explicit Dark choice overrides a light OS preference
- **WHEN** a user on a system set to light mode selects "Dark" from the theme control
- **THEN** the app renders in its dark theme regardless of the OS preference

#### Scenario: Explicit Light choice overrides a dark OS preference
- **WHEN** a user on a system set to dark mode selects "Light" from the theme control
- **THEN** the app renders in its light theme regardless of the OS preference

#### Scenario: An explicit choice persists across sessions
- **WHEN** a user selects "Dark" and later reopens the app in a new session on the same browser
- **THEN** the app renders in its dark theme without the user choosing again

#### Scenario: Selecting System clears any explicit choice
- **WHEN** a user who previously chose "Dark" selects "System"
- **THEN** the app resumes following the live OS preference, and a later OS-preference change is reflected without a further explicit choice

### Requirement: The theme control shows the active choice
The System/Light/Dark control SHALL visually indicate which of the three
is currently selected.

#### Scenario: The active segment is visually distinct
- **WHEN** the theme control is rendered
- **THEN** exactly one of System, Light, or Dark is shown in its active/selected visual state, matching the user's current stored choice (or System if none is stored)

