# auth-screen-branding Specification

## Purpose
The shared branded two-pane layout (`AuthLayout`) the login, first-run
setup, forgot-password, reset-password, and required-password-change
screens render inside (`add-auth-split-screen-redesign`) — brand identity
and value proposition on one side, each page's own form on the other,
collapsing to a single column on narrow viewports.

## Requirements

### Requirement: The auth screen family renders inside a shared branded layout
Login, first-run setup, forgot-password, reset-password, and
required-password-change SHALL render inside a shared `AuthLayout` that
presents brand identity (the TestPulse wordmark/icon), a value-proposition
headline, and supporting proof points, alongside each page's existing
form content.

#### Scenario: Login screen shows brand identity
- **WHEN** a visitor with no session opens the login screen on a desktop-width viewport
- **THEN** the screen displays the TestPulse wordmark/icon and a value-proposition headline, in addition to the email/password form

#### Scenario: First-run setup screen shows brand identity
- **WHEN** a visitor opens the first-run setup screen on a fresh instance with no admin account yet, on a desktop-width viewport
- **THEN** the screen displays the same brand identity and headline as the login screen, alongside the setup form

#### Scenario: Forgot-password, reset-password, and required-password-change screens show brand identity
- **WHEN** a visitor opens the forgot-password screen, or a user opens the reset-password or required-password-change screen, on a desktop-width viewport
- **THEN** each screen displays the same brand identity and headline as the login screen, alongside its own existing form content

### Requirement: The branded layout collapses on narrow viewports
On viewports narrower than the layout's desktop breakpoint, the branded
layout SHALL present as a single column with a condensed brand band above
the form, rather than the full two-pane presentation, so the form remains
reachable without scrolling past a full-height hero.

#### Scenario: Narrow viewport shows a condensed brand band
- **WHEN** any auth screen in the family is opened on a viewport narrower than the desktop breakpoint
- **THEN** the brand presentation renders as a condensed band above the form, and the full-height two-pane layout does not render

### Requirement: The branded layout's brand pane always renders in the dark palette
The brand pane SHALL always render using the dark variant of the
instance's active color palette, independent of the visitor's own
light/dark theme preference or the instance's default theme setting.

#### Scenario: Brand pane stays dark under a light theme preference
- **WHEN** a visitor whose theme preference (or default) is Light opens any auth screen in the family on a desktop-width viewport
- **THEN** the brand pane renders using the dark variant of the active color palette while the form pane renders in the visitor's actual Light theme

#### Scenario: Brand pane stays dark under a dark theme preference
- **WHEN** a visitor whose theme preference (or default) is Dark opens any auth screen in the family on a desktop-width viewport
- **THEN** the brand pane renders using the dark variant of the active color palette, consistent with the rest of the screen

### Requirement: The version/health readout is demoted, not removed
The instance version and health-status readout SHALL continue to be shown
on each auth screen, but SHALL NOT be positioned as a floating element
overlapping the brand or form content.

#### Scenario: Health readout appears without floating over content
- **WHEN** any auth screen in the family finishes loading
- **THEN** the version/health readout is visible on the screen and does not overlap the brand pane or the form card
