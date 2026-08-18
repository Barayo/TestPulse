## Why

Every TestPulse instance looks identical — the same teal brand palette for
everyone, with no way for a Tenant Admin to make the instance feel like
*their* deployment. Issue #1 asks for admin-configurable color themes.
Design work this session (with Pepe, TestPulse's UX persona) initially
scoped this to presets only, deferring a custom/admin-defined palette
(issue #124) over contrast-safety risk — this codebase already had one
real incident from a hand-picked dark-mode color failing WCAG contrast
(`apps/web/src/index.css`'s `--destructive`, corrected in
`add-dark-mode-toggle`). The user overrode that scoping: for corporate
installations evaluating TestPulse, matching their own brand color is the
actual point, not a curated set of presets — this is a real differentiator
for enterprise adoption. Issue #124 folds into this change rather than
staying deferred.

## What Changes

- A Tenant Admin can choose an instance-wide color palette from four
  presets (Teal — today's unchanged default, Indigo, Ocean, Forest) **or**
  author a fully custom palette, in a new "Appearance" section on
  `InstanceSettingsPage`.
- Presets apply live (no Save step, matching every other control on that
  page). Custom requires an explicit "Save custom palette" step — editing
  10 hex fields per mode shouldn't flash instance-wide, to every visitor
  including anonymous ones, on every keystroke.
- The custom editor exposes exactly the fields that vary between presets
  today (Background, Foreground, Card, Primary, Primary-foreground,
  Muted, Muted-foreground, Accent, Border, Input — both Light and Dark),
  derives the rest by the same copy-relationships every shipped preset
  already uses, and freezes chart-pass/fail and identity tokens
  (`--secondary`/`--destructive`/avatars/status-pill hues) exactly like
  presets do — a "fail" rendering in the admin's brand color would corrupt
  shared meaning app-wide, corporate branding or not.
- The editor shows live, non-blocking WCAG contrast readouts (7 real
  pairs used elsewhere in the app) and a live visual preview (real
  `Button`/`Card`+`PropertyRow`/empty-state/accent-row surfaces) as the
  admin edits — visible guardrail without a blocking gate, since the user
  explicitly chose full manual control over automatic derivation.
- Every choice — preset or custom — is instance-wide and visible to every
  visitor, including anonymous public-project visitors, not just
  Tenant Admins: `GET /api/v1/meta` carries the active theme (and, when
  custom is active, its full value set).
- Each palette (preset or custom) composes with, and is independent of,
  the existing personal light/dark toggle (`ui-theming`).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ui-theming`: adds an instance-wide palette choice — either one of four
  presets or a fully custom, Tenant-Admin-authored palette — alongside the
  existing per-user light/dark choice, a new orthogonal axis on the same
  visual-theming capability.

## Impact

- `apps/web/src/index.css`: three new static preset token blocks
  (Indigo/Ocean/Forest, light+dark).
- `apps/web/src/lib/ThemeProvider.tsx`: applies `data-palette` for
  presets; for `custom`, injects the admin-authored values as inline CSS
  custom properties (values aren't known at build time, so the static
  `[data-palette="…"]` block approach presets use doesn't apply).
- `apps/web/src/pages/InstanceSettingsPage.tsx`: new "Appearance" section
  — 4 preset swatches + a 5th "Custom" option that reveals an inline
  editor (10 hex fields × 2 modes, 7 live contrast readouts, a live
  preview panel, an explicit Save button).
- `apps/api/internal/store` / `service` / `server`: `colorTheme` enum
  field (now including `'custom'`) plus a new `customPalette` JSON field
  on instance settings — Tenant-Admin write path, duplicated onto the
  public `GET /api/v1/meta` response (mirroring
  `publicProjectsEnabled`'s existing precedent, now carrying materially
  more data when custom is active).
- `packages/shared/openapi.yaml`: `colorTheme`/`customPalette` added to
  `InstanceSettings` and `Meta` schemas; `make generate`.
- `apps/api/internal/db/migrations/`: one new incremental migration
  adding `color_theme` (enum incl. `'custom'`, default `'teal'`) and
  `custom_palette jsonb` columns to the instance settings table.
- Docs: instance-settings documentation page gets the new setting;
  Sample Project unaffected (display setting, no domain data).
- GitHub: issue #124 ("Custom color theme... for corporate
  installations") is folded into this change rather than staying
  deferred — closed as superseded once this change is proposed.
