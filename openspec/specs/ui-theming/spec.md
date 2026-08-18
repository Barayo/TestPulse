# ui-theming Specification

## Purpose
How the app is visually themed, on two independent axes: each person's own
Light/Dark preference (this page, browser-local), and the instance-wide
brand color palette a Tenant Admin sets for everyone (`add-color-theme-
customization`).
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

### Requirement: A Tenant Admin can choose an instance-wide color palette
The system SHALL let a Tenant Admin choose the instance's color palette,
either from a fixed set of presets (Teal, Indigo, Ocean, Forest; Teal is
the default) or a fully custom, admin-authored palette. A preset choice
SHALL apply immediately on selection, with no separate save step. A
custom palette SHALL require an explicit save action before it applies.
Either way, the choice SHALL apply to every visitor of the instance —
authenticated users of every role and anonymous public-project
visitors — not only the admin who set it. The choice is independent of,
and composes with, each visitor's own personal Light/Dark theme choice:
any combination of palette and personal light/dark mode SHALL be
renderable.

#### Scenario: Tenant Admin selects a preset
- **WHEN** a Tenant Admin selects a preset other than the current one in
  Instance Settings
- **THEN** the instance's stored palette is updated and the admin's own
  view re-renders in the new palette immediately, without a page reload

#### Scenario: Tenant Admin saves a custom palette
- **WHEN** a Tenant Admin edits the custom palette's fields and confirms
  the save action
- **THEN** the instance's stored palette is set to the custom values and
  every field is a valid `#RRGGBB` value

#### Scenario: An invalid custom palette value is rejected
- **WHEN** a Tenant Admin attempts to save a custom palette with a field
  that is not a valid `#RRGGBB` hex value
- **THEN** the request is rejected with a validation error naming the
  field, and the instance's stored palette is unchanged

#### Scenario: The choice is visible to every user, not only admins
- **WHEN** any user — including a non-admin or an anonymous public-project
  visitor — loads the app after a Tenant Admin has changed the palette
  (preset or custom)
- **THEN** they see the newly chosen palette, not the previous one or the
  default

#### Scenario: Palette and personal light/dark choice compose independently
- **WHEN** the instance palette is set to a non-default preset or a custom
  palette, and a user has separately chosen Dark via their own personal
  theme control
- **THEN** the user sees that palette's dark variant, and switching their
  personal choice to Light shows that same palette's light variant, with
  no change to the instance-wide palette selection

#### Scenario: Non-Tenant-Admin cannot change the instance palette
- **WHEN** a non-Tenant-Admin authenticated user attempts to change the
  instance color palette, preset or custom
- **THEN** the request is rejected with `403`

### Requirement: Chart pass/fail colors stay consistent across palettes
Regardless of the chosen instance palette — preset or custom — chart
pass/fail color semantics and status-pill hues SHALL render unchanged —
only brand-associated colors (background, foreground, primary, and
related surface tokens) and avatar identity colors (see below) vary by
palette, and a custom palette SHALL NOT be able to override the frozen
semantic tokens.

#### Scenario: Chart failure color is unaffected by palette choice
- **WHEN** the instance palette is changed from Teal to any other preset
  or to a custom palette
- **THEN** a chart's failed/critical series renders in the same color as
  before the change

### Requirement: Avatar identity colors are derived from the active palette, never admin-authored
The system SHALL derive the 6 avatar identity colors from the instance
palette's brand primary color — for a built-in preset, computed once and
shipped as static styling; for a custom palette, computed at render time
from the admin's chosen primary — rather than exposing them as
admin-editable fields. Every derived avatar color pair SHALL meet WCAG AA
contrast (4.5:1), regardless of which primary color the derivation
started from. A person's assignment to one of the 6 avatar identity slots
(by name/email) is unaffected by palette changes — only which colors
those slots render as changes.

#### Scenario: Avatar colors follow a preset choice
- **WHEN** the instance palette is changed from Teal to another preset
- **THEN** every user's generated-initial avatar renders in that preset's
  own avatar color set, still distinguishable from every other avatar
  slot and still meeting AA contrast

#### Scenario: Avatar colors follow a custom palette's primary color
- **WHEN** a Tenant Admin saves a custom palette with a primary color
  different from Teal's
- **THEN** every user's generated-initial avatar renders in colors derived
  from that custom primary, still meeting AA contrast, without the admin
  having set any avatar color directly

#### Scenario: A person's avatar slot assignment is unaffected by palette choice
- **WHEN** the instance palette is changed, preset or custom
- **THEN** each person is still assigned to the same one of the 6 avatar
  identity slots as before the change — only that slot's rendered colors
  differ

