## Why

As a first-time visitor evaluating a self-hosted, open-source test-management
tool, when I open TestPulse for the first time (or get logged out), I want the
login screen to actually tell me what TestPulse is and why it's worth
adopting, so that I don't land on a blank, unbranded form with no context.
Today `LoginPage.tsx` is the only route in the app that renders outside
`Layout.tsx`, so it's the only screen with zero brand identity at the exact
moment a stranger is asked to trust the product with credentials — a small
centered card floating in an otherwise empty viewport, with a misplaced
`HealthBadge` (normally a quiet in-app footer readout) repurposed as a
floating corner badge. (GitHub issue #198; UX exploration and mockups by
Pepe: https://claude.ai/code/artifact/fa607bd1-b594-434d-ab62-4fc1d357c0b9)

## What Changes

- Add a new shared `AuthLayout` component: a responsive two-pane layout.
  On viewports ≥860px, a fixed dark left pane (~44% width, using the app's
  real dark-theme tokens) carries the brand lockup (icon tile + "Test"/
  "Pulse" wordmark, currently only rendered in `Layout.tsx`), the README
  tagline as a headline, and three proof lines drawn from README's "Why
  TestPulse?" bullets. The right pane hosts the page's existing card
  content unchanged. Below 860px, the brand pane collapses to a short top
  band so mobile visitors reach the form without scrolling past a full hero.
- Migrate all five pages that currently share the plain centered-card shape
  — `LoginPage`, `SetupPage`, `ForgotPasswordPage`, `ResetPasswordPage`,
  `RequiredPasswordChangePage` — to render inside `AuthLayout`, so none of
  them regress to the old unbranded look.
- Move the version/health readout (`HealthBadge`) out of a floating
  `fixed right-6 top-6` corner position into a quiet, demoted placement
  that no longer competes visually with the brand story.
- **BREAKING**: none — this is a visual/layout change only. No API,
  routing, auth-logic, or data-model changes.

## Capabilities

### New Capabilities
- `auth-screen-branding`: the shared branded two-pane layout the
  login/setup/password-recovery screen family renders inside, and its
  responsive collapse behavior.

### Modified Capabilities
(none — `authentication`, `password-recovery`, and `sso-oidc` govern auth
*behavior* (credentials, tokens, validation, flows), which this change does
not touch; this proposal only changes the chrome those flows render inside.)

## Impact

- **Affected code**: new `apps/web/src/components/AuthLayout.tsx` (+ test);
  `apps/web/src/pages/LoginPage.tsx`, `SetupPage.tsx`,
  `ForgotPasswordPage.tsx`, `ResetPasswordPage.tsx`,
  `RequiredPasswordChangePage.tsx` (+ their tests) migrated to use it;
  `apps/web/src/components/HealthBadge.tsx` usage site updated (component
  itself unchanged).
- **Not affected**: `Layout.tsx` (post-login app shell), any API/backend
  code, auth logic/validation, routing paths.
- **Docs**: `docs/design-system.md` gets the new shared layout pattern
  documented; any docs screenshots of the login screen get refreshed.
- **Sample Project**: not applicable — this is chrome around the auth
  flow, not a Sample-Project-observable capability (no data, no seeded
  content to demonstrate), the same reasoning as prior settings-only
  changes in this codebase.
