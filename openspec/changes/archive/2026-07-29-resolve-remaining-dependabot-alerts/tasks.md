## 1. Apply the fix

- [x] 1.1 `npm audit fix` alone only fixed `@hono/node-server` (non-breaking, via the MCP
  SDK's widened peer range). `js-yaml` and `minimatch`/`brace-expansion` are pinned to
  *exact* versions inside `@redocly/openapi-core@1.34.17`'s own `package.json`
  (`js-yaml: 4.2.0`, `minimatch: 5.1.9`) — no non-breaking bump exists via `npm audit
  fix` alone, since no newer `openapi-typescript` major exists yet to pull in Redocly
  2.x. Used root `package.json`'s `overrides`, scoped specifically to
  `@redocly/openapi-core`'s own dependency resolution (not global), to force
  `js-yaml` → `4.3.0` (same major, exact-API-compatible patch) and `minimatch` →
  `^10.2.5` (a real major jump, but Redocly only uses it internally for glob
  matching — not part of any surface we call). `npm audit` now reports 0
  vulnerabilities.
- [x] 1.2 Confirmed no unexpected direct-dependency version bumps in `package.json`
  beyond the new `overrides` block — `package-lock.json`'s 395-line diff is entirely
  transitive resolution.

## 2. Verify no contract drift

- [x] 2.1 Ran `make generate`; `packages/shared/src/api.ts` is byte-identical
  afterward — zero drift, confirming the `js-yaml`/`minimatch` override doesn't change
  `openapi-typescript`'s output.

## 3. Verification

- [x] 3.1 Full web unit suite green (665/665), coverage gate maintained.
- [x] 3.2 `tsc -b` / `oxlint` clean (oxlint's only output is pre-existing, unrelated
  `react/only-export-components` warnings).
- [x] 3.3 `make build` succeeds (Go binary + web bundle both build clean, confirming the
  MCP-SDK/shadcn devDependency bump doesn't break anything build-time-relevant).

## 4. Ship

- [x] 4.1 Sync the `platform-deployment` delta into `openspec/specs/platform-deployment/spec.md`,
  then archive the change.
- [x] 4.2 Filed issue #101, labeled `bug`, board status Planned; move to To Review once
  merged and CI is green, close once GitHub's Dependabot view confirms 0 open alerts.
- [ ] 4.3 Commit + push; wait for CI green and confirm GitHub's Dependabot alert count
  drops to 0 on `main`.
