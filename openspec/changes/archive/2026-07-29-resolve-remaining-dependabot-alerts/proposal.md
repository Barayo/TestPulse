## Why

As the project maintainer, when GitHub flags open vulnerabilities on the default branch, I
want them resolved immediately rather than accumulating, so the repo never carries known,
fixable security issues. `resolve-dependabot-alerts` (issue #92) closed 3 of 6 alerts and
explicitly deferred these 3 (brace-expansion, js-yaml, @hono/node-server) as accepted risk,
because at the time `npm audit fix` required forcing `@redocly/openapi-core` and the MCP SDK
tooling to breaking major versions. Re-running `npm audit fix --dry-run` today shows all 3
now resolve via `npm audit fix` (no `--force`, no major bump) — upstream `@redocly/openapi-core`
and `@modelcontextprotocol/sdk` have since shipped patch releases carrying the fixed
transitive deps within their existing semver ranges.

## What Changes

- Run `npm audit fix` in `apps/web` to pick up the patched transitive versions of
  `brace-expansion`/`minimatch` (via `@redocly/openapi-core`) and `@hono/node-server`
  (via `@modelcontextprotocol/sdk`, a `shadcn` devDependency) — all within existing
  semver ranges, no `package.json` direct-dependency version bumps expected.
- Re-run `make generate` after the bump to confirm `@redocly/openapi-core`'s newer patch
  version produces no OpenAPI-contract drift (the exact risk the original change flagged
  and deferred on).
- No production code changes — this is a lockfile-only dependency update.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — no spec-level behavior changes; purely a dependency/security update)

## Impact

- `apps/web/package-lock.json` (and possibly `apps/web/package.json` if npm bumps a
  direct version — `@redocly/openapi-core`/`shadcn` are both devDependencies).
- `packages/shared/openapi.yaml` / generated types — verified, not expected to change.
- Purely internal maintenance work (dependency bump), exempt from the docs-update and
  Sample-Project-showcase standing tasks per CLAUDE.md.
