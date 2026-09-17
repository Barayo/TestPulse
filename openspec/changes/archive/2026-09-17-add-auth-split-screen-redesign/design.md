## Context

Five pages currently share one hand-copied layout shell (verified via
`grep`, all five are byte-identical on this line):

```
<div className="flex min-h-screen flex-col items-center justify-center gap-6">
```

`LoginPage.tsx`, `SetupPage.tsx`, `ForgotPasswordPage.tsx`,
`ResetPasswordPage.tsx`, `RequiredPasswordChangePage.tsx`. Each wraps a
`Card` and independently renders `<div className="fixed right-6 top-6">
<HealthBadge /></div>` (or, for `RequiredPasswordChangePage`, its own
positioning — to confirm during implementation). `SetupPage.tsx`'s own
comment states the intent explicitly: *"Visually identical to
LoginPage/ResetPasswordPage (Card, HealthBadge) rather than a new visual
language."* — these five pages are a deliberate family, not five
coincidentally-similar screens.

`Layout.tsx` (the post-login app shell) is the only other place the real
brand lockup exists: an inline SVG icon tile using a gradient keyed to
`var(--primary)`, plus a "Test"/"Pulse" wordmark (`Layout.tsx:84-117`).
None of the five auth pages render it.

The app's dark theme is a CSS-variable set activated by a `.dark` class
(`ThemeProvider.tsx` toggles it on `<html>`), defined in
`apps/web/src/index.css:137+` (e.g. `--background: #0B2A28`,
`--primary: #2DD4BF`). Tailwind's dark variant here is
`@custom-variant dark (&:is(.dark *))` (index.css:8) — but because these
are plain CSS custom properties, nesting a `.dark`-classed element
anywhere in the tree (regardless of the page's own light/dark mode)
re-scopes every `var(--background)`/`var(--primary)`/etc. underneath it
to the dark values. This is the mechanism this design uses to make the
brand pane always dark, independent of the visitor's own theme choice.

## Goals / Non-Goals

**Goals:**
- One shared `AuthLayout` component that gives all five auth pages a
  branded, two-pane presentation on desktop, collapsing to a single
  column on narrow viewports.
- Preserve every page's existing form logic, validation, copy, and test
  coverage untouched — this is a chrome change around existing content,
  not a rewrite of any auth flow.
- Demote the version/health readout out of the visitor's direct eyeline.

**Non-Goals:**
- No change to `Layout.tsx` (the post-login shell) — it already has its
  own brand header and is unaffected.
- No change to auth logic, request/response shapes, routing paths, or
  validation rules on any of the five pages.
- No theming/settings control added — the brand pane's dark presentation
  is fixed, not a user preference (see Decision D4).
- No new capability requirements on `authentication`, `password-recovery`,
  or `sso-oidc` — those specs govern behavior, which is unchanged.

## Decisions

**D1 — New `AuthLayout` component, not per-page duplication.**
`apps/web/src/components/AuthLayout.tsx` accepts `children` (the page's
existing card content) and renders the two-pane shell. Each of the five
pages replaces its own `<div className="flex min-h-screen ...">...
</div>` wrapper with `<AuthLayout>{/* existing Card unchanged */}</AuthLayout>`.
Alternative considered: copy the new markup into all five pages
independently. Rejected — that's exactly the duplication the existing
`SetupPage.tsx` comment already flags as unintentional, and it would
recreate five drift-prone copies of a layout that's supposed to move
together.

**D2 — Responsive collapse via CSS breakpoint, not JS viewport detection.**
The left brand pane is `hidden lg:flex` (Tailwind's `lg` breakpoint is
1024px in this app's default config, which comfortably covers the
proposal's ~860px target) at full height/44% width; a separate, shorter
brand band (`lg:hidden`) renders above the form on narrow viewports.
Alternative considered: a `useMediaQuery` hook toggling layout in JS.
Rejected — adds a render-timing edge case (flash of wrong layout before
the effect runs) for a purely presentational breakpoint that CSS already
handles declaratively, and no other responsive behavior in this codebase
uses a JS media-query hook (grep confirms none exists).

**D3 — Brand pane content is static JSX, not data-driven.**
The wordmark SVG (copied from `Layout.tsx:84-117`, extracted into a
shared `BrandMark` sub-component so both `Layout.tsx` and `AuthLayout.tsx`
render the identical mark from one source instead of two copies), the
README tagline, and the three proof lines are hardcoded strings in
`AuthLayout.tsx`, sourced verbatim from `README.md`'s current text at
implementation time. Alternative considered: fetch copy from `/api/v1/meta`
or a CMS-like source. Rejected — this is marketing copy about the
product itself, not instance configuration; no other instance-wide
setting controls it, and inventing one would be scope creep for a
chrome-only change.

**D4 — Brand pane is always dark, regardless of the app's light/dark
setting.** The left pane container gets `className="dark"` (per Context,
this re-scopes CSS variables for its subtree), and its own content uses
token classes (`bg-background`, `text-foreground`, `text-primary`, etc.)
rather than hardcoded hex values — so it automatically follows whichever
color palette preset (Teal/Indigo/Ocean/Forest/custom, per
`ui-theming`) is instance-active, exactly like the wordmark already does
elsewhere, while still always rendering as the *dark* variant of that
palette. Alternative considered: let the brand pane follow the visitor's
own light/dark preference like the rest of the app. Rejected — a light
brand pane loses the contrast-driven "hero" presentation Direction B is
built around, and a visitor's first-ever screen (before they've formed
any theme opinion) is exactly the moment a fixed, intentional dark brand
statement reads as most deliberate rather than inconsistent.

**D5 — `HealthBadge` demoted to a static line under the form, not
removed.** Replaces the `fixed right-6 top-6` corner placement with an
inline `<div className="mt-6 flex justify-center">` under the card, using
`HealthBadge`'s existing render output unchanged (no prop/behavior
changes to that component). Alternative considered: remove the
version/status readout from the auth pages entirely. Rejected — it's
genuinely useful signal (e.g. confirming a fresh self-host deployment is
actually reachable) and no spec depends on removing it; the proposal's
complaint is about its *prominence and positioning*, not its existence.

**D6 — `RequiredPasswordChangePage`'s current layout confirmed identical
before migration.** Task 1 (below) explicitly re-reads this page's
current JSX before assuming it matches the other four — the proposal
draft cites the shared wrapper line from a `grep` match, not a full read
of this specific page's HealthBadge placement, and this must be verified
rather than assumed during implementation.

## Risks / Trade-offs

- **[Risk]** Migrating five pages' wrapper markup risks a subtle visual
  regression (e.g. a banner or link that was positioned relative to the
  old `flex-col items-center` wrapper) on any one of them.
  → **Mitigation**: existing page-level tests (`LoginPage.test.tsx`,
  etc.) assert on content presence/behavior, not layout classnames, so
  they continue to validate correctness; the real-browser verification
  pass (per this project's standing practice) explicitly loads all five
  routes, not just `/login`.
- **[Risk]** A `.dark`-scoped subtree nested inside a light-mode page is
  a pattern with no precedent elsewhere in this codebase — could surprise
  a future maintainer.
  → **Mitigation**: document the technique and its rationale directly in
  `AuthLayout.tsx` as a code comment, and add it to
  `docs/design-system.md` as a new documented pattern (task in tasks.md)
  so it's discoverable, not just inferred from the code.
- **[Risk]** Hardcoded README-sourced copy (D3) can drift from the actual
  README text over time.
  → **Mitigation**: accepted trade-off, consistent with how this
  proposal was scoped (no data-driven copy system exists or is being
  built); low-frequency risk since README's core value-prop bullets are
  stable, long-lived copy, not release notes.

## Migration Plan

Purely additive/presentational — no data migration, no API change, no
feature flag needed. Rollout is a normal frontend deploy: build
`AuthLayout`, migrate the five pages behind existing routes (no routing
change), verify in a real browser, ship. Rollback is a normal revert of
the same commit(s) if a regression is found post-merge; no state to
reconcile.

## Open Questions

None outstanding — `RequiredPasswordChangePage`'s exact current markup
(D6) is a verification step in tasks.md, not an open design question.
