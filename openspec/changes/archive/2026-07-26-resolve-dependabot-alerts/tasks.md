## 1. Non-breaking dependency bumps

- [x] 1.1 Re-ran `npm audit` fresh: `postcss` and `fast-uri` had real
  non-breaking fixes. `brace-expansion`/`js-yaml` (both via
  `@redocly/openapi-core` <=1.34.17, latest 1.x line) turned out to have
  **no non-breaking fix** — see 1.3a.
- [x] 1.2 Applied `postcss`/`fast-uri` via `npm audit fix` (lockfile-only,
  no `--force`, no direct dependency changes).
- [x] 1.3 Ran `make generate`, diffed `packages/shared/src/api.ts` against
  pre-bump state — byte-identical, no drift.
- [x] 1.3a **Attempted** forcing `@redocly/openapi-core` to 2.x via an npm
  `overrides` entry to also resolve `brace-expansion`/`js-yaml` (both only
  fixed on redocly's 2.x line; 1.34.17 is the latest 1.x patch, already
  installed). Confirmed this **breaks `make generate`**:
  `openapi-typescript@7.13.0` (latest published) still pins
  `@redocly/openapi-core@^1.34.6` and errors
  (`ERR_MODULE_NOT_FOUND: index-to-position`) when forced to 2.x — npm
  itself flags the tree as `invalid`. Reverted the override. No non-breaking
  fix exists upstream yet (`openapi-typescript` hasn't bumped its own
  `@redocly/openapi-core` dependency to 2.x). Documented as accepted risk in
  design.md alongside the `@hono/node-server` chain: `@redocly/openapi-core`
  is a devDependency used only for `make generate`, processing our own
  first-party, version-controlled `openapi.yaml` — not untrusted input — so
  the DoS/quadratic-CPU advisories have no real exploitation path here.
  Re-check `openapi-typescript`'s dependency on next audit pass.
- [x] 1.4 Full `make test` equivalent for web: `tsc -b` clean, `oxlint`
  clean (pre-existing warnings only), `vitest run` 591/591 passed, `vite
  build` succeeded.
- [x] 1.5 Committed standalone (`fix(deps): resolve non-breaking Dependabot
  alerts`, `46fc44f`) and pushed.

## 2. react-router v7 → v8 migration

- [x] 2.1 Installed `react-router@8.3.0` in isolation and read its actual
  type declarations (`dist/production/index.d.ts`) rather than trusting
  the design doc's assumption: confirmed `BrowserRouter`, `Link`,
  `Navigate`, `Route`, `Routes`, `useLocation`, `useNavigate`, `useParams`,
  `useMatch`, `MemoryRouter` are all still exported unchanged from the root
  `react-router` package — no renames for anything this codebase uses.
- [x] 2.2 Updated `apps/web/package.json`: `react-router-dom` → `react-router
  ^8.3.0`.
- [x] 2.3 Swapped every `import ... from 'react-router-dom'` (39 files,
  app code + tests) to `'react-router'`, plus the 2 `vi.mock('react-router-
  dom', ...)` string references in `SuitesPage.test.tsx`/
  `SuiteDetailPage.test.tsx`.
- [x] 2.4 `npx tsc -b` clean.
- [x] 2.5 Full `vitest` unit suite: 591/591 passed, no assertions changed.
  `oxlint` clean (pre-existing warnings only), `vite build` succeeded.
- [x] 2.6 Full Playwright e2e suite: 71/72 green; the one failure
  ("Switching project via keyboard") re-ran 3/3 passes in isolation,
  confirming it's the pre-existing flake already noted during
  `rework-library-ux`, not a router regression.
- [x] 2.7 Committed (`3ce47a2`) and pushed — but a real mistake surfaced
  immediately in CI: I staged `apps/web/src`, `apps/web/e2e`, and the root
  `package-lock.json` but never staged `apps/web/package.json` itself, so
  the pushed commit had the new lockfile/imports with the *old*
  `react-router-dom@^7.18.1` dependency declaration still in place — an
  inconsistent tree `npm ci` correctly rejected (both the `Web
  (TypeScript)` CI job and the `Release image` Docker build failed
  identically). Invisible locally because verification ran against the
  working tree, which had the uncommitted edit. Fixed with a follow-up
  commit (`49f38a9`) staging the missing file; both CI and Release image
  are green on `49f38a9`.

## 3. @hono/node-server chain

- [x] 3.1 Re-checked: `@modelcontextprotocol/sdk@1.29.0` (latest published)
  still pins `@hono/node-server@^1.19.9`, well below the patched 2.0.5+.
  No non-breaking fix exists upstream yet.
- [x] 3.2b No non-breaking fix exists → documented the accepted-risk
  decision in `design.md` (decision 3) and via the closing comment on #92:
  devDependency only (component-scaffolding CLI), never shipped to
  production, never run in CI, Windows-only local-dev-server exposure.

## 3a. @redocly/openapi-core chain (brace-expansion/js-yaml) — discovered during implementation

- [x] 3a.1 Attempted the fix the proposal assumed existed (bump
  `@redocly/openapi-core` to 2.x via an npm `overrides` entry). Confirmed
  it breaks `make generate`: `openapi-typescript@7.13.0` (latest) still
  pins `@redocly/openapi-core@^1.34.6`, and forcing 2.x leaves the tree
  `npm`-reported `invalid` and fails with `ERR_MODULE_NOT_FOUND:
  index-to-position`. Reverted.
- [x] 3a.2 Documented as accepted risk in `design.md` (decision 3a),
  same reasoning as 3.2b: devDependency, processes only our own
  first-party, version-controlled `openapi.yaml`, not untrusted input.

## 4. Verification and cleanup

- [x] 4.1 Confirmed via `gh api repos/Barayo/TestPulse/dependabot/alerts`:
  exactly 3 open alerts remain (`brace-expansion`, `js-yaml`,
  `@hono/node-server`), matching the two documented accepted-risk chains —
  `postcss`, `fast-uri`, and `react-router` are all resolved. CI (`Web
  (TypeScript)`, `E2E`) and `Release image` both green on the final commit
  (`49f38a9`).
- [x] 4.2 Closed #68 as a duplicate of #92 at the start of implementation;
  closing #92 now with a summary comment referencing all 3 resolving
  commits (`46fc44f`, `3ce47a2`, `49f38a9`).
- [x] 4.3 Sample Project showcase: exempt — dependency/security fix, no
  new or altered user-facing functionality.
- [x] 4.4 Docs: exempt — no docs page names any of these packages or
  versions; no behavior, configuration, API surface, or workflow change
  for a user to read about.
