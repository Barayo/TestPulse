## Context

`apps/web/src/index.css` already defines a complete `.dark { … }` custom-
property block (status-pill bands, avatar-chip hues, chart colors, the
core `--background`/`--foreground`/`--card`/`--muted`/`--border`/
`--primary` set) via `@custom-variant dark (&:is(.dark *))`. `ui/button.tsx`
and `ui/badge.tsx` already ship `dark:` Tailwind variants. None of it is
reachable: no code ever adds `.dark` to any element. This design is
primarily about wiring that existing system up, plus two measured
contrast corrections and one legibility gap found while verifying it —
not authoring a palette from scratch. (Design work and contrast
measurement were done as a Pepe/senior-UX review pass before this
proposal; this document carries the resulting decisions forward, all
independently re-verified against the current source.)

The closest existing precedent is `useViewModeOverride.ts` — a
`localStorage`-backed `T | null` override for the project list's
expanded/compact view mode, resolved against a computed default
(`resolveViewMode`) the same way theme resolves against
`prefers-color-scheme`.

## Goals / Non-Goals

**Goals:**
- A user can explicitly choose Light or Dark, or follow their OS's
  `prefers-color-scheme`, with the choice persisted per-browser.
- The choice reacts live if the OS preference changes while a System-
  mode tab is open (a `matchMedia` change listener, not a load-time read).
- The existing dark token values ship correctly, with any measured
  contrast shortfalls fixed before they're ever visible.

**Non-Goals:**
- No server-side storage of the preference (client-only, same reasoning
  `useViewModeOverride.ts` already established: a pure client-rendered
  SPA has no server-side reason to know a display preference).
- No new palette design — the `.dark` token values already in
  `index.css` are the starting point; only measured-deficient values
  change.
- No redesign of `UserMenu.tsx` beyond adding one row.
- No print stylesheet or third theme (e.g. high-contrast) — light/dark/
  system only, per the issue's scope.

## Decisions

**Toggle placement: `UserMenu.tsx`, not a header icon or Settings page.**
The header (wordmark, project chip, admin badge, user menu) already wraps
at narrow widths — adding a persistent icon button there is real estate
the header doesn't have to spare for a set-once preference. `UserMenu.tsx`
already holds exactly this class of thing ("API tokens" — infrequently
touched, personal to the account) with no header shortcut of its own. A
second entry on a Settings page would be a second control recording the
same one preference — needless duplication for zero benefit.

**Control shape: a 3-segment System/Light/Dark pill, not a 2-state
switch.** A switch can represent exactly two states; "follow the OS" is a
real third state distinct from "I explicitly chose light," and collapsing
it to two would lose the ability to tell "user wants light" from "user
hasn't decided" — exactly the `T | null` distinction
`useViewModeOverride.ts` already encodes for view mode. Reuses the visual
language of `ProjectsPage.tsx`'s existing `Pill` component (bordered/
ghost inactive, solid `foreground`-on-`background` active) rather than
inventing a new control style.

**Extract `Pill` out of `ProjectsPage.tsx` into a shared component.**
`Pill` is currently a private, unexported function local to
`ProjectsPage.tsx`. This is now a second real call site (the theme
toggle) with identical visual requirements (segmented, active = solid
fill) — extracting it to `components/ui/Pill.tsx` avoids a second,
drifting copy of the same button markup. `ProjectsPage.tsx`'s view-mode
and status-filter uses switch to the shared import with no visual change.

**Resolution logic and storage key.** `localStorage["testpulse.themeOverride"]`,
values `"light" | "dark"`; absence of the key means System (mirroring
`useViewModeOverride.ts`'s `T | null` shape exactly — `null` already means
"no override, use the computed default" for view mode). A `useTheme()`
hook holds `[override, setOverride]` (same shape as `useViewModeOverride`)
plus a `resolveTheme(override): 'light' | 'dark'` pure function that
either returns the override or reads `window.matchMedia('(prefers-color-
scheme: dark)').matches`. A `matchMedia` `change` listener re-resolves
and re-renders while override is `null`, so a System-mode session updates
live if the OS theme changes mid-session — a plain load-time read would
miss that. The resolved theme is applied by toggling the `.dark` class on
`document.documentElement`, effected in one place (e.g. an effect in the
root `App` component or a small `ThemeProvider`), not per-page.

**Two contrast corrections to existing (unshipped) dark values, found by
measuring against their actual rendering surface, not a generic
reference:**
- `--destructive: #FF6B57` (`.dark` block, `index.css`) measures 4.11:1
  against `--card` — under the WCAG AA 4.5:1 minimum for normal text. It
  renders as real body text (`text-destructive` error copy, Flaky/
  Critical pills, destructive menu items), not only as a fill, so the
  text-size threshold applies. Revised to `#FF9484` (5.4:1). `--chart-3`
  shares the same value for the same "failed" red identity in charts and
  moves with it.
- `StatusBadge.tsx`'s `dotClass.pending` (`bg-muted-foreground/40`, a
  literal Tailwind class, not a CSS token) measures 2.1–2.4:1 in dark
  mode for the run board's 8px pending/retest dot — under the 3:1
  non-text minimum. Fixed with a scoped `dark:bg-muted-foreground/60` on
  the dot only: `--muted-foreground` itself is already fine as body text
  (5.6–7.4:1 measured elsewhere), so brightening the token would overshoot
  every other place it's used — the fix has to be local to the dot.

**Not changed: `--border`, and the already-oklch-authored status-pill/
avatar-chip/chart colors.** `--border`'s dark contrast is already
comparable to or better than light mode's own deliberately low-contrast
border (`docs/design-system.md`: hairlines are "too thin a signal in this
palette," resolved with filled panels rather than stronger borders) — dark
correctly inherits that existing, deliberate choice rather than needing a
fix. The status/avatar/chart colors were already authored in oklch with a
dark-mode lightness inversion and measured comfortably above threshold as
originally written.

**One additional fix folded in while verifying dark-mode legibility:**
`RunPage.tsx`'s run-item-row button has no resting fill in dark mode
(border only; a fill only appears on hover), which reads as barely-there
against the dark background. Adding a faint `dark:bg-card/40` resting
fill keeps the row visible without depending solely on the intentionally
subtle border.

## Risks / Trade-offs

- **A broad component sweep for dark-mode legibility is inherently
  spot-check work, not exhaustively enumerable up front** → Mitigation:
  tasks.md calls out the two highest-risk areas already identified (run
  board verdict colors, project health pills) as required checks, plus a
  general pass across remaining pages; any further issue found becomes a
  small follow-up, not a blocker to shipping the toggle itself.
- **Contrast correctness isn't unit-testable** (it's a rendered/visual
  property) → Mitigation: the two known corrections are applied directly
  from measured ratios (stated above) rather than re-measured in an
  automated test; tasks.md includes a manual verification task, not a
  fabricated automated contrast test.
- **Extracting `Pill` touches an already-shipped page
  (`ProjectsPage.tsx`)** → Mitigation: a pure extraction with no visual
  change; `ProjectsPage.test.tsx`'s existing assertions on the view-mode/
  status-filter buttons continue to hold unchanged, which is itself the
  regression check.

## Migration Plan

No database/API changes — this is a client-only, additive UI change. No
rollback beyond a normal revert; a user's `localStorage` override key,
worst case, is inert if a future revert removes the toggle (never applied
without a class-toggling consumer to read it).
