## Why

The header wordmark is plain-color Geist Black text — it doesn't match the
committed brand asset (`assets/brand/testpulse-logo-horizontal.svg`), which
already splits "Test"/"Pulse" by color and pairs the wordmark with an icon
tile containing a literal EKG/pulse-line stroke. The header currently uses
neither the two-tone split faithfully in typeface terms (still same family
as the body text) nor the icon at all. Live design review (screenshots
against the running app) surfaced this gap and iterated on a fix.

## What Changes

- Swap the wordmark's typeface from Geist (shared with body text) to
  Recursive, a variable font whose `MONO`/`CASL` axes let "Test" render
  monospaced/technical and "Pulse" render casual/rounded — one family
  embodying both halves of the product name, rather than weight/color
  alone doing the differentiating.
- Thin the wordmark's weight (from an initial too-heavy pass) for
  readability at actual header size.
- Add the existing brand icon (teal tile + white EKG stroke, geometry
  copied from `assets/brand/testpulse-icon.svg`) to the header, to the
  left of the wordmark.
- No behavioral or API change — purely the header's visual brand mark.

## Impact

- Affected code: `apps/web/src/App.tsx`, `apps/web/src/index.css`
  (new self-hosted font import), `apps/web/package.json` (new
  `@fontsource-variable/recursive` dependency).
- Spec delta: adds a new "Brand wordmark" requirement to
  `ui-navigation`, and corrects the "Project switcher" requirement's
  scenario, which had gone stale from the project-switcher link/icon
  redesign shipping without a spec delta (still described clicking the
  project name as opening the switcher).
