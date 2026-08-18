## 1. Migration + store (TDD)

- [x] 1.1 New incremental migration: `color_theme text not null default 'teal' check (color_theme in ('teal','indigo','ocean','forest','custom'))` and `custom_palette jsonb` on `instance_settings`.
- [x] 1.2 Write a failing test in `apps/api/internal/store/instance_settings_test.go` asserting `Get` returns `ColorTheme: "teal"`/`CustomPalette: nil` for a fresh instance, and `Update` with a non-nil `ColorTheme`/`CustomPalette` changes them (COALESCE pattern, same as the other fields).
- [x] 1.3 Add `ColorTheme string`/`CustomPalette *domain.CustomPalette` to `domain.InstanceSettings`/`InstanceSettingsUpdate` (a `CustomPalette` struct with `Light`/`Dark` sub-structs, 10 fields each, matching design.md's shape); extend `InstanceSettingsRepo.Get`/`Update`'s SQL to select/update the new columns (jsonb marshal/unmarshal for `custom_palette`). Confirm 1.2 passes.

## 2. Service validation (TDD)

- [x] 2.1 Write a failing test asserting the service layer rejects an `UpdateInstanceSettings` call with a `ColorTheme` outside the five known values, with a validation error naming the field.
- [x] 2.2 Write a failing test asserting a `CustomPalette` with any field not matching `#RRGGBB` is rejected with a validation error naming the specific field, and no partial write occurs.
- [x] 2.3 Implement both validations. Confirm 2.1/2.2 pass.

## 3. API contract

- [x] 3.1 Add `colorTheme` (enum: `teal`/`indigo`/`ocean`/`forest`/`custom`) and `customPalette` (object: `light`/`dark`, each with the 10 named hex fields) to `InstanceSettings` and `InstanceSettingsUpdate` schemas in `packages/shared/openapi.yaml`.
- [x] 3.2 Add `colorTheme` and `customPalette` (nullable, present only when `colorTheme` is `custom`) to the `Meta` schema.
- [x] 3.3 `make generate`; confirm no drift.

## 4. Server: meta field (TDD)

- [x] 4.1 Write a failing test asserting `GET /api/v1/meta` includes `colorTheme` (defaulting to `"teal"`) and, once a custom palette is saved, `customPalette` with the exact saved values — unauthenticated, matching `publicProjectsEnabled`'s existing test pattern.
- [x] 4.2 Wire `colorTheme`/`customPalette` into `handleMeta` (`apps/api/internal/server/server.go`). Confirm 4.1 passes.
- [x] 4.3 Write a failing scenario test for `PATCH /api/v1/instance-settings` saving a custom palette end-to-end (valid values succeed; an invalid hex value in one field is rejected with 400 and changes nothing). Confirm it passes.

## 5. Frontend: token blocks + custom application (TDD)

- [x] 5.1 Add the three new preset blocks to `apps/web/src/index.css` — `[data-palette="indigo"]`/`.dark` and the same pair for `ocean`/`forest` — using the exact hex values from design.md / the first Pepe design artifact. Freeze `--secondary`, `--destructive`, `--avatar-1..6-bg/fg`, and status-pill hues identical to Teal.
- [x] 5.2 Write a test asserting `document.documentElement` receives a `data-palette` attribute for a preset choice, and inline custom-property overrides (via `style.setProperty`) for a `custom` choice — matching the active personal light/dark mode and re-applying when that mode changes.
- [x] 5.3 Extend `ThemeProvider.tsx` to read `colorTheme`/`customPalette` from auth/meta context and apply either the `data-palette` attribute or the inline custom-property overrides. Confirm 5.2 passes.

## 6. Frontend: plumbing (TDD)

- [x] 6.1 Extend `useAuth.tsx`'s existing `meta` fetch (already used for `setupRequired`) to expose `colorTheme`/`customPalette` via context; add/extend a test.

## 7. Frontend: Appearance section — presets (TDD)

- [x] 7.1 Write failing tests in `InstanceSettingsPage.test.tsx` for the preset half of a new "Appearance" section: renders four preset swatches, the current selection is visually indicated, selecting a different preset calls `PATCH /api/v1/instance-settings` with `colorTheme` and updates the indicated selection without a page reload.
- [x] 7.2 Implement the preset swatch grid per design.md: `PaletteIcon` + "Appearance" header matching Access/Data sections, `Card` titled "Color theme", 4-up two-tone swatch grid, `ring-2 ring-primary ring-offset-2` + `CheckIcon` selected state. Confirm 7.1 passes.

## 8. Frontend: custom editor (TDD)

- [x] 8.1 Write failing tests for the 5th "Custom" swatch revealing an inline editor (`RetentionPillSelector`-style), a Light/Dark tab switch that preserves both drafts in memory, 10 hex input fields per mode pre-seeded from the active preset (or last-saved custom values on reopen), and an explicit "Save custom palette" button that calls `PATCH /api/v1/instance-settings` only on click — not per-keystroke.
- [x] 8.2 Implement the custom editor's field grid and Save flow. Confirm 8.1 passes.
- [x] 8.3 Write failing tests for the 7 live contrast readouts (Foreground/Background, Foreground/Card, Primary-foreground/Primary, Muted-foreground/Muted, Foreground/Accent, Muted-foreground/Card, Primary/Accent) updating on every field change, showing a ratio and an AA pass/fail indicator, never blocking Save.
- [x] 8.4 Implement the contrast-ratio computation (WCAG relative-luminance formula) and the 7 readouts. Confirm 8.3 passes.
- [x] 8.5 Write failing tests for the live visual preview panel (filled `Button`, `Card`+`PropertyRow`, muted empty-state chip, accent nav row, accent info bar) reflecting the current field values, updating on every keystroke, showing only the active Light/Dark tab.
- [x] 8.6 Implement the preview panel, `position: sticky` alongside the field grid per design.md's two-column layout. Confirm 8.5 passes.
- [x] 8.7 Write a failing test asserting an invalid hex value in a field shows an inline error and prevents the Save button's request from firing (client-side pre-check ahead of the server-side rejection in 2.2/4.3).
- [x] 8.8 Implement the client-side validation. Confirm 8.7 passes.

## 8a. Brand wordmark follows the palette (TDD)

- [x] 8a.1 Write a failing test in `Layout.test.tsx` asserting the header wordmark icon's gradient uses `var(--primary)`, not a hardcoded teal hex.
- [x] 8a.2 Update `Layout.tsx`'s inline SVG gradient to `var(--primary)` / `color-mix(in oklch, var(--primary), black 25%)`. Confirm 8a.1 passes. Static `assets/brand/` files intentionally left as the canonical Teal mark.

## 9. E2E coverage

- [x] 9.1 New or extended spec in `apps/web/e2e/` covering "Tenant Admin selects a preset," "the choice is visible to every user" (preset case), and "Tenant Admin saves a custom palette" against the real shared compose stack — verify via a rendered CSS custom property or `data-palette` attribute, not a screenshot diff.

## 10. Docs

- [x] 10.1 Update the relevant `docs/` page documenting instance settings with the new Appearance section — both the preset picker and the custom editor.

## 11. Sample Project showcase

- [x] 11.1 N/A — this is a display/branding setting with no domain data for the Sample Project to demonstrate; nothing in `seed.go` shows an "instance setting" today (retention/public-access aren't showcased there either). No `seed.go`/`seed_test.go` changes.

## 12. Close out

- [ ] 12.1 Sync this change's specs delta into `openspec/specs/ui-theming/spec.md`.
- [ ] 12.2 Close GitHub issue #124 as superseded by this change.
- [ ] 12.3 Archive this OpenSpec change.

## 13. Avatar identity colors follow the palette (addendum, TDD)

Added after archiving, before the first commit — reverses this change's
original "avatars stay frozen" decision (design.md's addendum explains
why the reversal is safe: derivation done correctly, not admin input).

- [x] 13.1 Write failing tests in `avatarPalette.test.ts` for `deriveAvatarPalette(primaryHex, mode)`: Teal's own primary returns Teal's exact unmodified 6 pairs; every derived pair (for the 3 known preset primaries, and several arbitrary/pathological hex values) clears WCAG AA contrast; deterministic; 6 mutually distinguishable results, not a convergent cluster.
- [x] 13.2 Implement `apps/web/src/lib/avatarPalette.ts`: hue-rotate each of Teal's 6 canonical (bg, fg) pairs toward the target primary, binary-search the foreground's lightness for guaranteed contrast at the new hue. Confirm 13.1 passes. Caught and fixed a real destructuring bug during TDD (`const [hf, , sf] = hexToHsl(...)` silently assigned the original foreground's *lightness* into what was meant to be its *saturation*, washing out every derived light-mode foreground toward gray) — added a dedicated regression test.
- [x] 13.3 Generate the 3 non-Teal presets' avatar values by invoking `deriveAvatarPalette` directly (one canonical implementation, no separate hand-authored or Python-reimplemented table) and paste the output into each `[data-palette="…"]`/`.dark` block in `index.css`.
- [x] 13.4 Write a failing test in `ThemeProvider.test.tsx` asserting Custom mode derives and applies `--avatar-1..6-bg/fg` from `customPalette`'s active-mode primary, differing from Teal's own values.
- [x] 13.5 Wire `ThemeProvider.tsx`'s `applyCustomPaletteVars` to call `deriveAvatarPalette` and set the 6 avatar pairs; extend `CUSTOM_PALETTE_PROPERTIES` so they're cleared when switching away from Custom. Confirm 13.4 passes.
- [x] 13.6 Update `openspec/specs/ui-theming/spec.md`: split "Chart and identity colors stay consistent" into a chart/status-only requirement plus a new "Avatar identity colors are derived from the active palette, never admin-authored" requirement with its own scenarios. Update `docs/test-management.md`'s Color theme section to match.
- [x] 13.7 No new `CustomPalette` fields, no migration, no API changes, no new editor UI — confirmed this is strictly less backend/API surface than an admin-editable-avatars approach would have needed, since avatars are computed, not authored.

## 14. Preset avatar photos also need retinting (addendum, TDD)

User caught live: the 21 preset avatar *photos* (real portraits, distinct
from the generated-initial chips in section 13) stayed permanently
Teal-tinted regardless of the active instance palette. Dispatched Pepe to
verify a fix against the real image files before implementing — see
design.md's second addendum for the full pixel analysis and rejected
alternatives (grayscale, dropping photo presets).

- [x] 14.1 Write failing tests in `Avatar.test.tsx`: a preset image gets `style={{ filter: 'var(--avatar-photo-filter, none)' }}`; an uploaded custom photo (`avatarKey="custom"`) never gets a filter style.
- [x] 14.2 Add the filter style to `Avatar.tsx`'s preset-image branch only. Confirm 14.1 passes.
- [x] 14.3 Add `hueRotateDegreesFromTeal(primaryHex, mode)` to `avatarPalette.ts`, exposing the same hue-delta math `deriveAvatarPalette` already computes internally; test it returns 0 for Teal and matches the 3 precomputed static preset deltas (85/44/−31) exactly.
- [x] 14.4 Add `--avatar-photo-filter: hue-rotate(Ndeg)` to all 6 preset CSS blocks in `index.css` (Indigo/Ocean/Forest × light/dark), using the values 14.3 confirmed.
- [x] 14.5 Write a failing test in `ThemeProvider.test.tsx` asserting Custom mode derives and applies `--avatar-photo-filter` from the custom palette's active-mode primary.
- [x] 14.6 Wire `hueRotateDegreesFromTeal` into `applyCustomPaletteVars`; add `--avatar-photo-filter` to `CUSTOM_PALETTE_PROPERTIES` so it's cleared when switching away from Custom (the same leak class as section 13's avatar colors). Confirm 14.5 passes.
- [x] 14.7 Verified live against the real compose stack: preset photos (Admin, Julia) correctly shift from Teal to a coherent purple tint under a Custom palette, and to a coherent green tint under Forest — not the flat/broken look Pepe's grayscale test produced.
- [x] 14.8 User-caught follow-up, same live session: `ProfilePage.tsx`'s avatar *picker grid* rendered preset thumbnails via a second, independent raw `<img>` — a duplicate rendering path that bypassed `Avatar.tsx` entirely, so every thumbnail in the grid stayed Teal-tinted while the single "current selection" preview (which does use `Avatar.tsx`) correctly retinted, a visible inconsistency in the same screenshot. Fixed by replacing the raw `<img>` with `<Avatar seed={preset.name} avatarKey={preset.key} .../>` — eliminating the duplicate path entirely rather than patching it a second time, matching `Avatar.tsx`'s own stated design intent ("single rendering path for a person's identity everywhere it appears"). Audited every other `avatarKey`-consuming file in the codebase (`grep` for `<img`/`<Avatar`) to confirm no other duplicate paths exist. TDD: failing test in `ProfilePage.test.tsx` first, then the fix. Verified live in the exact spot flagged.
