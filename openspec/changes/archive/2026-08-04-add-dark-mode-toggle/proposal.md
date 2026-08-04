## Why

As a user, when I work in TestPulse in a dim room or at night, I want the
app to respect my system's dark-mode preference (or let me choose one
explicitly), so the interface doesn't glare against my OS/other apps. The
app currently ships one visual theme; issue #27 has tracked this since
`redesign-ui`. The dark token palette itself already exists, fully
authored, in `apps/web/src/index.css` as an unwired `.dark` class — no
element ever gets that class applied, so today's "dark mode" is dead CSS.

## What Changes

- A three-way **System / Light / Dark** toggle in the user menu
  (`UserMenu.tsx`), reusing the segmented-pill visual language
  `ProjectsPage.tsx`'s view-mode toggle already established.
- Theme resolution: no stored override follows the OS's live
  `prefers-color-scheme` (reacting to OS changes while the tab stays
  open, not just read once at load); an explicit pick overrides it and
  persists to `localStorage["testpulse.themeOverride"]` (`"light" |
  "dark"`, absent means System — mirroring `useViewModeOverride.ts`'s
  existing `T | null` shape). Client-only; no server-side storage.
- Wires the already-authored `.dark` class onto the document root based
  on the resolved theme — the missing activation step.
- Two measured contrast corrections to the existing (never-shipped) dark
  tokens: `--destructive` (and `--chart-3`, which shares its red
  identity) was under the WCAG AA 4.5:1 text minimum against `--card`;
  `StatusBadge`'s pending/retest dot was under the 3:1 non-text minimum
  in dark mode.
- A small `RunPage.tsx` resting-fill addition so run-item rows aren't
  border-only against the dark background.
- A visual legibility spot-check across existing pages/components under
  the newly-activated dark class, focused on the run board's verdict
  colors and project health pills (the highest-risk legibility spots)
  plus a broader pass.

## Capabilities

### New Capabilities
- `ui-theming`: the app's light/dark theme preference — resolution
  (system default vs. explicit override), persistence, and the toggle
  control itself.

### Modified Capabilities
- None. Existing capabilities' pages/components gain dark-mode styling
  as an implementation detail of `ui-theming`, not a change to their own
  spec-level requirements.

## Impact

- `apps/web/src/index.css` — token contrast corrections only (the dark
  variant block itself already exists).
- `apps/web/src/components/UserMenu.tsx` — new toggle row.
- New `apps/web/src/lib/useTheme.ts` (or similar) — resolution/
  persistence logic, following `useViewModeOverride.ts`'s pattern.
- `apps/web/src/components/StatusBadge.tsx`, `apps/web/src/pages/RunPage.tsx`
  — the two contrast/legibility fixes.
- `docs/design-system.md` (or a new docs page) — documents the theme
  system for future component work.
- No backend/API impact — this is entirely client-side and per-browser.
