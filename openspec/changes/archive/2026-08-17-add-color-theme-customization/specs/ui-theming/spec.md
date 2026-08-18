## ADDED Requirements

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

### Requirement: Chart and identity colors stay consistent across palettes
Regardless of the chosen instance palette — preset or custom — chart
pass/fail color semantics and per-user identity colors (avatar
backgrounds, status-pill hues) SHALL render unchanged — only
brand-associated colors (background, foreground, primary, and related
surface tokens) vary by palette, and a custom palette SHALL NOT be able
to override the frozen semantic tokens.

#### Scenario: Chart failure color is unaffected by palette choice
- **WHEN** the instance palette is changed from Teal to any other preset
  or to a custom palette
- **THEN** a chart's failed/critical series renders in the same color as
  before the change

#### Scenario: A user's avatar color is unaffected by palette choice
- **WHEN** the instance palette is changed, preset or custom
- **THEN** every user's generated-initial avatar background/foreground
  colors remain exactly as they rendered before the change
