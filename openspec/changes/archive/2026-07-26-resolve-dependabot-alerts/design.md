## Context

`main` currently carries 6 open Dependabot alerts (5 high, 1 moderate), already
filed twice as duplicate issues (#68, #92) without being resolved. `npm audit`
(run against the root workspace, which hoists `apps/web` and `packages/shared`
deps) confirms the same 6, plus their dependency paths:

| Package | Severity | Path | Fix available |
|---|---|---|---|
| `postcss` <=8.5.17 | high | direct devDependency | non-breaking (`npm audit fix`) |
| `brace-expansion` <=5.0.7 | high | `@redocly/openapi-core` → `minimatch` | non-breaking |
| `js-yaml` 4.0.0–4.2.0 | high | `@redocly/openapi-core` | non-breaking |
| `fast-uri` 3.0.0–3.1.3 | high | deep transitive | non-breaking |
| `react-router` 7.12.0–8.2.0 | high | `apps/web`'s actual router (`react-router-dom` ^7.18.1) | **breaking** — no fixed `react-router-dom` release exists above 7.18.1; the fix line is v8's unified `react-router` package |
| `@hono/node-server` <2.0.5 | moderate | `shadcn` (devDependency) → `@modelcontextprotocol/sdk` | none non-breaking as of this writing (`npm audit fix --force` would *downgrade* shadcn below 3.8.4) |

## Goals / Non-Goals

**Goals:**
- Zero open Dependabot alerts on `main` after this change ships, or an
  explicit, documented accepted-risk decision for any that genuinely can't be
  fixed yet.
- No behavior change visible to users — this is a dependency/tooling change,
  not a feature. The router migration must be invisible: same routes, same
  URLs, same navigation behavior.
- `make generate` (contract-first OpenAPI codegen, an architecture constraint
  from `establish-architecture`) produces byte-identical output before/after
  the `@redocly/openapi-core` bump — a version-drift regression here would
  violate the "CI fails on drift" invariant.

**Non-Goals:**
- Adopting any new react-router v8 feature (data routers, loaders, RSC mode,
  etc.) — this is a mechanical dependency migration, not a routing-architecture
  change. `apps/web` keeps its current declarative `<Routes>`/`<Route>` shape.
- Fixing vulnerabilities in packages with no available patch — those get
  documented as accepted risk, not force-fixed into a worse state.

## Decisions

**1. Non-breaking bumps first, standalone commit.** `postcss`,
`@redocly/openapi-core` (carries the `brace-expansion`/`js-yaml` fix),
and whatever pins `fast-uri` get bumped via `npm audit fix` (no `--force`),
verified by the full `make test` + `make generate` (diff-checked) + `tsc -b`
+ `oxlint` run. Kept as its own commit so it can ship independently of the
router migration, which is riskier and worth isolating in `git bisect` terms.

**2. `react-router-dom` → `react-router` v8 migration, mechanical.**
`react-router-dom`'s highest published version is 7.18.1, inside the
vulnerable range; v8 unified the DOM bindings into the platform-agnostic
`react-router` package (the split that used to exist between `react-router`
and `react-router-dom` in v6/early v7 is gone). Concretely:
- `apps/web/package.json`: replace `"react-router-dom": "^7.18.1"` with
  `"react-router": "^8.3.0"` (latest at proposal time — re-check for newer
  patches at implementation time).
- Every `import { ... } from 'react-router-dom'` across `apps/web/src`
  (confirmed via grep: `BrowserRouter`, `Link`, `Navigate`, `Route`, `Routes`,
  `useLocation`, `useNavigate`, `useParams`, `useMatch`, `MemoryRouter` are the
  hooks/components actually in use — no data-router APIs like `loader`/
  `action`/`RouterProvider`) becomes `import { ... } from 'react-router'`.
  **Verify the exact v8 export surface against the vendored docs at
  `node_modules/react-router/docs` (shipped in-package since v7.17.0) before
  assuming a 1:1 rename** — if any of these hooks/components were renamed or
  restructured in v8, adjust call sites accordingly rather than assuming the
  identifier survived unchanged.
- Test files under `apps/web/src/**/*.test.tsx` that import `MemoryRouter`/
  `Route`/`Routes` from `react-router-dom` get the same import-path swap.
- No route path, `useParams` key, or navigation call site is expected to
  change in behavior — only the import specifier and package name.

**3. `@hono/node-server` — re-check for a real fix, else document accepted
risk, don't force-downgrade.** `npm audit fix --force` proposes downgrading
`shadcn` below 3.8.4, which is a regression, not a fix. Before accepting risk,
check whether `shadcn`, `@modelcontextprotocol/sdk`, or `@hono/node-server`
have since published a release that breaks this chain (this is a fast-moving
part of the ecosystem). If no non-breaking fix exists at implementation time,
document in this file and in the tracking issue: `shadcn` is a devDependency
(component-scaffolding CLI), never bundled into the shipped web build, never
invoked in CI, and the advisory itself is a Windows-only path-traversal in a
locally-run static-file server — real exposure to TestPulse is effectively
nil. Re-evaluate on the next Dependabot pass rather than leaving it silently
unaddressed.

**3a. `brace-expansion`/`js-yaml` via `@redocly/openapi-core` — same
accepted-risk shape, confirmed during implementation.** The proposal assumed
bumping `@redocly/openapi-core` to its 2.x line would be a non-breaking (or
acceptably breaking) fix for both. In practice, forcing that bump via an npm
`overrides` entry breaks `make generate` outright:
`openapi-typescript@7.13.0` (the latest published release as of
implementation) still declares `@redocly/openapi-core@^1.34.6` as its own
dependency, and 1.34.17 (already installed) is the newest available 1.x
patch — there is no version that is both non-vulnerable and compatible with
our actual codegen tool today. Forcing 2.x leaves npm reporting the tree
`invalid` and `make generate` fails with `ERR_MODULE_NOT_FOUND:
index-to-position` (a transitive dependency of `parse-json` that only
resolves correctly against the 1.x tree). Accepted as risk, same reasoning
as `@hono/node-server`: `@redocly/openapi-core` is a devDependency invoked
only by `make generate` against our own first-party, version-controlled
`openapi.yaml` — never untrusted input — so the DoS (`brace-expansion`) and
quadratic-CPU (`js-yaml`) advisories have no realistic exploitation path in
this codebase. Re-check whether `openapi-typescript` has bumped its own
`@redocly/openapi-core` dependency on the next audit pass.

## Risks / Trade-offs

- **[Risk] The react-router v8 migration touches nearly every page component**
  (import-only, but wide) **→ Mitigation:** mechanical `sed`-style import swap
  followed by full `tsc -b` (catches any renamed export immediately) + full
  `vitest` suite + full Playwright e2e suite (`apps/web/e2e/`) before treating
  it as done. No behavior is intentionally changed, so any test failure is a
  real regression to fix, not an expected diff to update.
- **[Risk] `@redocly/openapi-core` bump could shift generated OpenAPI output**
  (e.g. formatting, `$ref` resolution order) **→ Mitigation:** run
  `make generate` before and after on the same `openapi.yaml` source and diff
  `packages/shared/src/api.ts`; if it drifts, pin to the oldest patched minor
  instead of jumping straight to latest major.
- **[Risk] Accepting risk on `@hono/node-server` leaves one alert open**
  **→ Mitigation:** explicit, reasoned documentation (this file + closing
  comment on #68/#92) rather than a silent gap; re-check on next audit pass.
- **[Trade-off] Bundling 4 unrelated fixes + 1 migration + 1 accepted-risk
  decision in one change** is larger than the repo's usual "1 change = 1
  commit" granularity, but the user explicitly asked for all 6 alerts resolved
  together as one high-priority change — mitigated by splitting into separate
  commits per task (non-breaking bumps / router migration / issue closure)
  even though they ship under one OpenSpec change.

## Migration Plan

1. Non-breaking bumps (`postcss`, `@redocly/openapi-core`, `fast-uri`'s pinning
   package) → verify → commit.
2. `react-router` v8 migration → verify (`tsc -b`, full unit + e2e suites) →
   commit.
3. Re-check `@hono/node-server` chain for a fix; either bump or document
   accepted risk → commit.
4. Confirm `npm audit` (or `gh api .../dependabot/alerts`) shows 0 open alerts
   (or exactly the documented accepted-risk one) → close #68 and #92.

Rollback: each of the 3 commits is independently revertible; the router
migration is the only one with meaningful blast radius, and is verified by the
full existing test suite before merging, not by new tests (no new behavior is
being added).

## Open Questions

- Is there a newer `react-router` v8 patch release by implementation time?
  Re-check `npm view react-router version` rather than trusting this doc's
  pinned number.
- Has `@hono/node-server`, `@modelcontextprotocol/sdk`, or `shadcn` shipped a
  fix for the transitive chain by implementation time?
