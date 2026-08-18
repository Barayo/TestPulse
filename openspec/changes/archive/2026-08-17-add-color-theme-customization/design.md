## Context

`apps/web/src/index.css` defines the app's entire visual palette as CSS
custom properties in two blocks: `:root` (light) and `.dark` (the personal
per-user override toggled via `ThemeProvider.tsx`/`useResolvedTheme.ts`,
`ui-theming` capability). Every instance today renders the same teal brand
regardless of who's running it. `InstanceSettingsPage.tsx` already has the
established pattern for Tenant-Admin-set, instance-wide settings (Access,
Data sections; `Switch`/`RetentionPillSelector` controls; live-apply, no
Save step) that the preset half of this slots into unchanged.

Design worked out this session with Pepe (TestPulse's UX persona), two
rounds: an initial presets-only pass, then a full custom-editor pass after
the user overrode the presets-only scoping — corporate installations
evaluating TestPulse need to match their own brand color, not pick the
closest of four options. Two published design artifacts from that
session capture the visual detail this document summarizes.

## Goals / Non-Goals

**Goals:**
- A Tenant Admin picks one of four presets (Teal, Indigo, Ocean, Forest)
  *or* authors a fully custom palette, in a new "Appearance" section on
  `InstanceSettingsPage`. Either choice applies instance-wide, to every
  visitor including anonymous public-project visitors.
- The instance palette composes with, and is fully independent of, each
  user's own personal light/dark choice.
- Chart pass/fail semantics and status-pill colors stay visually
  consistent regardless of the chosen palette — preset or custom. Avatar
  identity colors, by contrast, follow the palette (see the addendum
  below) — a deliberate, later reversal of the original "avatars frozen
  too" decision.
- The custom editor gives the admin real, non-blocking signal (live
  contrast ratios + a live visual preview of real components) about
  whether their choices will render legibly, without blocking Save on it.

**Non-Goals:**
- No automatic contrast-safe derivation for custom palettes (the
  simplified "1-2 seed hues, rest derived" approach was explicitly
  declined in favor of full manual control) — the admin can ship a
  low-contrast custom palette if they choose to; the live readouts and
  preview are the only safeguard, and it's informational, not blocking.
- No multiple named/saved custom palettes — one custom slot, edited in
  place.
- No retroactive fix to light-mode `--primary`/`--primary-foreground`
  contrast (already below AA at 2.49:1 in shipped Teal) — every preset
  intentionally matches that existing bar for visual consistency; a
  dedicated accessibility pass on filled-button text is tracked
  separately if raised.

## Decisions

**Storage: `color_theme text not null default 'teal'` (CHECK-constrained
to `'teal'`/`'indigo'`/`'ocean'`/`'forest'`/`'custom'`) plus
`custom_palette jsonb`** on the existing singleton `instance_settings`
row. `custom_palette` is read/applied only when `color_theme = 'custom'`;
its shape is `{ light: { background, foreground, card, primary,
primaryForeground, muted, mutedForeground, accent, border, input }, dark:
{ ...same 10 keys } }` — exactly the 10 fields the editor exposes per
mode, nothing more. One new incremental migration, per the project's
permanent migration policy (CLAUDE.md).

**Why these 10 fields, no more**: Pepe's design review diffed the actual
shipped CSS (`apps/web/src/index.css:76-194`) and found `--popover`
always equals `--card`; `--card-foreground`/`--popover-foreground`/
`--accent-foreground` always equal `--foreground`; `--ring`/`--chart-1`
always equal `--primary`; every `--sidebar*` token duplicates its
non-sidebar counterpart — zero exceptions, in both light and dark, and
`design.md`'s own preset-derivation method (hue rotation holding
saturation/lightness constant) preserves those relationships for
Indigo/Ocean/Forest too. So the other ~10 CSS properties per mode are
derived by copying, not independently stored — this is a scope reduction
grounded in what the shipped code actually contains, not a guess, and it
keeps the custom editor from becoming a 20-field-per-mode form.

**Frozen tokens, identical across every palette (preset or custom)**:
`--secondary`, `--destructive`, `--avatar-1..6-bg/fg`, and status-pill
hues. These are semantic (chart pass/fail, identity, health state), not
brand color. The custom editor doesn't expose them at all — not even
read-only — since there's nothing for the admin to decide here regardless
of how much control they otherwise have.

**Preset mechanism unchanged from the original presets-only design**:
`data-palette="<name>"` attribute on `document.documentElement`, static
`[data-palette="indigo"]`/`.dark` blocks in `index.css`
(full hex values in the first design artifact from this session).

**Custom mechanism: inline CSS custom-property assignment, not a static
CSS block.** Values are admin-authored and unknown at build time, so they
can't live in `index.css`. `ThemeProvider.tsx`, when `colorTheme ===
'custom'`, sets each of the 10 custom properties directly via
`document.documentElement.style.setProperty(...)` for the active
light/dark mode (re-applied when the user's personal light/dark choice
changes, since the custom palette carries both variants). This composes
the same way presets do: the personal light/dark axis and the instance
palette axis stay independent.

**`GET /api/v1/meta` carries the full custom palette when active, not
just the enum.** Same reasoning that already put `publicProjectsEnabled`
on `Meta` (`enable-public-project-access`): a palette re-themes the app
for every visitor, including ones who can never call the Tenant-Admin-only
`GET /api/v1/instance-settings`. When `colorTheme` is a preset, `Meta`
only needs the enum value (the CSS is already shipped in the bundle);
when it's `'custom'`, `Meta` also carries `customPalette` so non-admins
and anonymous visitors render the same custom colors, not a fallback.

**Hex validation happens server-side, at the service layer, and rejects
(not coerces) a malformed value.** Each of the 20 values (10 fields × 2
modes) must match a strict `#RRGGBB` pattern; a `PATCH
/api/v1/instance-settings` with any invalid value is rejected with `400`
naming which field, and no partial write occurs — consistent with how
this codebase validates elsewhere (weak passwords, duplicate emails)
rather than silently normalizing bad input.

**Custom editor UI**: a 5th swatch ("Custom") alongside the four presets
in the same grid; selecting it reveals an inline editor in the same
`Card`, reusing `RetentionPillSelector`'s existing "preset pills + Custom
reveals an inline field" interaction (`apps/web/src/components/
RetentionPillSelector.tsx:34-53`) rather than inventing a new pattern.
Light/Dark is a tab-pill switch (existing "filled active segment" idiom,
`docs/design-system.md`), holding both drafts in memory so switching
tabs never loses in-progress edits. Two-column layout: the 10 fields on
the left, a `position: sticky` live preview pinned on the right (reusing
the sticky-sidebar pattern already documented for long primary content,
`CaseDetailPage.tsx`), stacking to one column under 760px. Pre-seeded
with the currently-active preset's values on first open (not blank),
or the last-saved custom values on reopening.

**Live, non-blocking contrast readouts — 7 real pairs**, computed
client-side (standard WCAG relative-luminance contrast formula) on every
keystroke, shown as `X.XX:1 · AA`/`fails AA` next to the relevant fields:
Foreground/Background, Foreground/Card, Primary-foreground/Primary,
Muted-foreground/Muted, Foreground/Accent, Muted-foreground/Card (the
real `PropertyRow` pairing — `.tp-label` renders on `bg-card`, not
`bg-muted`, in its most common use), and Primary/Accent (the selected-nav-
row pattern in `AdminMenu.tsx`/`CasePicker.tsx`). Never blocks Save —
explicitly declined as a guardrail — but the admin can't miss a bad pair.

**Live visual preview — 5 real, traced-to-actual-component surfaces**,
updating on every keystroke via the same custom-property substitution:
a filled `Button` (`variant="default"`, the exact spot already at 2.49:1
in shipped Teal), a `Card` + `PropertyRow` pair, a muted empty-state chip
(real copy from `docs/design-system.md`), an accent-tinted "current nav
item" row (`AdminMenu.tsx` pattern), and an accent info bar
(`SuiteCaseGrid.tsx` pattern). Shows only the active Light/Dark tab.

**Custom commits via an explicit "Save custom palette" button, not
live-apply-per-keystroke** — the one deliberate divergence from this
page's otherwise-universal live-apply convention. Ten free-text hex
fields × 2 modes applying per-keystroke would flash malformed/half-typed
colors instance-wide to every visitor, including anonymous ones, while
the admin is still typing. Presets keep live-apply (a single atomic
value, no partial-input risk).

**The header wordmark icon's gradient tracks `--primary` too**, via
`color-mix(in oklch, var(--primary), black 25%)` for its second stop —
found via manual review after shipping presets: the wordmark
(`Layout.tsx`) had Teal's exact hex values hardcoded, so it stayed teal on
every other palette, the one piece of chrome that didn't follow the
instance theme. `color-mix` needs no new stored/derived token and
automatically covers custom palettes too. The static brand assets under
`assets/brand/` (favicon, README, social preview) deliberately keep the
canonical Teal mark — only the in-app header diverges by design.
Status-pill hues stay frozen — they're a fixed semantic vocabulary
(healthy/at-risk/etc.), not identity or brand color.

**Addendum: avatar identity colors are derived from the palette too**,
reversing this document's original decision to freeze them (below,
superseded). The original objection was real: *naively* rotating each
avatar's exact bg/fg hex by the same hue delta as the primary measurably
breaks contrast for some target hues (verified — Indigo's avatar 5
dropped to 2.65:1) because WCAG relative luminance isn't hue-neutral, so
holding HSL lightness constant while rotating hue doesn't reliably
preserve contrast the way it does for the wider-margin brand tokens. The
fix isn't to avoid derivation, it's to derive correctly:
`avatarPalette.ts`'s `deriveAvatarPalette(primaryHex, mode)` rotates each
of Teal's 6 canonical avatar hues toward the target primary, then
binary-searches the foreground's lightness (at that rotated hue, original
saturation) until contrast against the rotated background clears 4.75:1 —
guaranteed by construction, for any hue, not just the three known preset
deltas. This is why it was safe to extend to Custom mode too: the
admin never authors avatar colors directly (no new editable fields, no
new stored data), so there's no way to end up with an indistinguishable
or low-contrast set — the exact risk that motivated the original "full
control, no guardrail" custom-palette scope in the first place doesn't
apply here, because there's no admin input to go wrong. Presets bake the
derived output into static CSS at generation time (`index.css`); Custom
computes it at render time in `ThemeProvider.tsx` from whichever primary
the admin picked. One function, one canonical baseline (Teal's own set),
reused both times — not four hand-maintained per-preset tables.

**Second addendum: preset avatar *photos* also needed retinting.** The
avatar-derivation addendum above covers generated-initial chips (people
with no preset picked); it doesn't touch the 21 preset portrait images
(`assets/avatars/*.jpg`, Ada Lovelace, Michael Faraday, etc.) a user can
choose instead. Found live: these are a fixed Teal duotone baked directly
into the JPG pixels (`assets/avatars/ATTRIBUTION.md`: each is the source
photo blended 35% with a `#0B2E2C`→`#14B8A6` duotone — literally this
app's own Teal tokens), so they stayed permanently teal-tinted regardless
of the active instance palette, visibly clashing on anything else. Dispatched
Pepe to verify a fix rather than guess: sampled hue histograms across all
21 JPGs (single tight hue cluster at ~174° in every one — confirming the
duotone-not-photo structure), then rendered `filter: hue-rotate()`
candidates through real headless Chromium against 8 of the actual images
at the real computed deltas (Indigo 85°, Ocean 44°, Forest −31°, and an
illustrative Custom purple) — every one read as a coherent, intentional
recolor. Grayscale (the "make them theme-neutral" alternative) tested the
same way read as a flat downgrade next to a fully-colored UI. Dropping
photo presets entirely (raised as an option — "having only [generated]
presets?") was rejected: these are curated, license-checked, individually
art-directed assets; the actual problem was 4 lines of missing CSS, not
a reason to remove a feature.

Implementation: `Avatar.tsx`'s preset-image branch gets
`style={{ filter: 'var(--avatar-photo-filter, none)' }}` — **the
custom-upload branch must never get this** (a real user's real photo;
recoloring an actual face to match the brand palette would be bizarre).
`--avatar-photo-filter` is set the same asymmetric way every other token
already is: a precomputed static value per built-in palette block in
`index.css` (`hue-rotate(85deg)` Indigo, `hue-rotate(44deg)` Ocean,
`hue-rotate(-31deg)` Forest; Teal sets nothing, falls through to the
`var(..., none)` default), and computed at runtime in
`ThemeProvider.tsx`'s `applyCustomPaletteVars` via a new exported
`hueRotateDegreesFromTeal(primaryHex, mode)` in `avatarPalette.ts` (the
same hue-delta math `deriveAvatarPalette` already computes internally,
exposed once rather than reimplemented). Light/dark deltas for a given
palette differ by under 2° — imperceptible, so one rounded value per
palette is enough. `--avatar-photo-filter` was added to
`CUSTOM_PALETTE_PROPERTIES`/`clearCustomPaletteVars` alongside the other
Custom-mode tokens, or a stale filter would leak into a subsequently
selected built-in palette that never sets its own value for this token.

~~Avatar colors and status-pill hues were explicitly *not* extended this
way (considered and declined): they're per-identity/per-state colors, not
brand chrome, and tying them to the palette would make two different
people's avatars converge toward the same hue and would make a person's
avatar color shift underneath them whenever the admin changes the theme —
the opposite of what avatar color is for.~~ **Superseded by the addendum
above** — status-pill hues stay frozen, but the avatar-convergence risk
turned out to be specific to *naive* rotation, not derivation in general;
a correctly-solved derivation doesn't have it.

## Risks / Trade-offs

- **[Risk] An admin ships a genuinely low-contrast or unreadable custom
  palette instance-wide, with no automatic block.** → Mitigation: 7 live
  contrast readouts plus a 5-surface live visual preview, both
  non-blocking by explicit user choice — real signal, not a rubber
  stamp, but ultimately the admin's call, consistent with "full control"
  being the chosen scope over automatic derivation.
- **[Risk] `Meta`'s payload grows meaningfully when a custom palette is
  active** (~20 hex values vs. a single enum for presets) — every
  anonymous page load now carries this. → Accepted: still a small,
  bounded, cacheable JSON payload; no different in kind from what
  `publicProjectsEnabled` already established as the right place for
  instance-wide display state.
- **[Trade-off] `--chart-1` moves with the palette (preset or custom) but
  `--chart-2..5` don't**, since 2/3 are pinned to frozen secondary/
  destructive semantics. An intentional, visible asymmetry, not a bug.
- **[Trade-off] No live preview before the instance-wide commit for
  *presets*** (unchanged from the original design — a swatch click applies
  immediately) — but Custom's explicit Save step, plus its own live local
  preview, gives exactly the "look before you commit" step presets don't
  need (a preset's values are already known-good).

## Migration Plan

Additive only: new columns with defaults, new CSS blocks, new API fields
with a default (`'teal'`, `customPalette` null) — no existing instance's
rendered theme changes until a Tenant Admin explicitly picks something
else. No backfill, no rollback complexity beyond the standard
migration-never-edited-in-place policy (CLAUDE.md).
