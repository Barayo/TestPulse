## 1. Font dependency

- [x] 1.1 Add `@fontsource-variable/recursive` to `apps/web/package.json`
- [x] 1.2 Import it in `apps/web/src/index.css`, next to the existing Geist imports
- [x] 1.3 Add `.tp-wordmark-test`/`.tp-wordmark-pulse` utility classes (Recursive Variable, `MONO`/`CASL`/`wght` variation-settings per design.md's chosen weights)

## 2. Header wordmark + icon (TDD)

- [x] 2.1 Write failing `App.test.tsx` assertions: the wordmark's two spans carry the new Recursive utility classes; an icon element (decorative, `aria-hidden`) renders before the wordmark text
- [x] 2.2 Implement: apply the utility classes to the existing two-tone spans; add an inline SVG icon (geometry copied from `assets/brand/testpulse-icon.svg`, recolored via the existing `--primary`/darker-teal custom properties so it tracks theme)
- [x] 2.3 Confirm green

## 3. Verification

- [x] 3.1 `make lint`, `make test`, `make coverage-web` all green
- [x] 3.2 Rebuild the compose stack; verify live in both light and dark, at header scale — confirm legibility and that the icon recolors correctly

## 4. Docs and spec sync

- [x] 4.1 Add the "Brand wordmark" requirement and correct the stale "Project switcher" scenario (still says clicking the project name opens the switcher, from the unreleased-spec redesign) in `specs/ui-navigation/spec.md`
- [x] 4.2 Confirm `openspec validate add-wordmark-icon` passes
