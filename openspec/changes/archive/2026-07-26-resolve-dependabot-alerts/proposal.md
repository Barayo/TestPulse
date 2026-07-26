## Why

As a Tenant Admin running a real, continuously-deployed instance of TestPulse, when I see GitHub flag 5 high and 1 moderate open Dependabot alerts on `main` (already tracked in duplicate issues #68 and #92), I want the dependency tree cleaned up so the deployed app and its build/contract tooling aren't carrying known, fixable vulnerabilities. This has sat open across two separate filings without being resolved; treating it as high priority now closes both.

## What Changes

- Bump `postcss` to a patched version (>=8.5.23) — direct devDependency, path-traversal in sourcemap auto-loading (GHSA-r28c-9q8g-f849). Non-breaking.
- Resolve `brace-expansion` (DoS, GHSA-mh99-v99m-4gvg) and `js-yaml` (quadratic CPU, GHSA-52cp-r559-cp3m), both pulled in transitively through `@redocly/openapi-core` (our contract-first OpenAPI tooling, `make generate`). Bump `@redocly/openapi-core` to a patched line and verify `make generate` produces zero diff against `packages/shared/openapi.yaml`/`api.ts` before and after.
- Resolve `fast-uri` (host-confusion via backslash authority delimiter, GHSA-v2hh-gcrm-f6hx), a deep transitive dependency — bump via whichever direct/intermediate package pins it, non-breaking.
- **BREAKING (internal only, no user-facing behavior change)**: migrate `apps/web` from `react-router-dom` v7 (capped at 7.18.1, inside the vulnerable 7.12.0–8.2.0 range for GHSA-qwww-vcr4-c8h2) to the unified `react-router` v8 package. `react-router-dom` has no fixed release above 7.18.1 — v8 folded routing into a single package. Touches every page's router imports (`Link`, `useNavigate`, `useParams`, route config) but changes no visible behavior or URL structure.
- Document `@hono/node-server` (moderate, Windows-only path-traversal in `serve-static`, GHSA-frvp-7c67-39w9) as an accepted risk if no non-breaking fix exists at implementation time: it's pulled in transitively through `@modelcontextprotocol/sdk` via `shadcn`, our component-scaffolding devDependency — never shipped to production, never run in CI, exploitable only via a local Windows dev server. Re-check for a clean upstream fix before accepting; only fall back to documenting if none exists.
- Close #68 and #92 (duplicate tracking issues) on completion.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `platform-deployment`: adds a requirement that the dependency tree carries no
  open, fixable security alerts (or documents accepted risk when a fix
  genuinely doesn't exist yet) — no user-facing requirement changes, but this
  capability already covers deployment/operational health.

## Impact

- `package.json` / `package-lock.json` (root workspace), `apps/web/package.json` (react-router-dom → react-router migration, postcss).
- `packages/shared/openapi.yaml`, `packages/shared/src/api.ts` — regenerated via `make generate` after the `@redocly/openapi-core` bump; must produce no unintended drift.
- Every `apps/web/src/pages/*.tsx` and any component importing from `react-router-dom` (router migration is mechanical but wide-reaching).
- GitHub issues #68, #92 (close as resolved), CI (`migrations`/`coverage-web`/lint jobs must stay green post-migration).
