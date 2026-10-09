## Context

`add-web-performance-lighthouse` (#23) shipped the same day this change
was proposed. A post-ship review — a direct inspection of the saved
`.results/*.json` reports plus an independent Pepe (Fable 5) dispatch,
both converging on the same three findings — found it before #24 (wire
perf tests into CI) started, which would otherwise have baked these bugs
into CI's first captured report. This change corrects only the three
items judged urgent enough to block #24; four lower-priority findings
(machine-readable summary output, root-cause/audit-detail surfacing,
`CreateRun`/#180 endpoint coverage, `discover-urls.mjs`'s unstated
run-ordering assumption) are filed as issue #217 and explicitly out of
scope here.

## Goals / Non-Goals

**Goals:**
- Lighthouse scores reflect a desktop usage profile, matching how
  TestPulse is actually used.
- The suite's four target pages are four genuinely distinct renders, not
  three distinct renders plus a duplicate.
- `make seed-perf` is safely re-runnable without a manual DB wipe.
- A corrected 3-run baseline replaces the provisional one in
  `docs/testing.md`.

**Non-Goals:**
- Everything filed as issue #217 — explicitly deferred, not forgotten.
- No Sample Project content changes. One option considered and rejected
  for Bug 2 (below) was adding a second public project to Sample Project
  content specifically to defeat the single-public-project redirect —
  that's a product-content change made to appease test tooling, and
  conflicts with the original change's own "no Sample Project changes"
  decision for the same dev-tooling-only reason.
- No change to the redirect behavior itself (`ProjectsPage.tsx:284`) —
  it's correct, intentional product behavior; the suite adapts to it,
  not the other way around.

## Decisions

### D1: Desktop Lighthouse config via `lighthouse/core/config/desktop-config.js`
Lighthouse ships its own desktop preset (confirmed present in
`lighthouse@13.5.0`, already a devDependency):
```js
{
  extends: 'lighthouse:default',
  settings: {
    formFactor: 'desktop',
    throttling: constants.throttling.desktopDense4G,
    screenEmulation: constants.screenEmulationMetrics.desktop,
    emulatedUserAgent: constants.userAgents.desktop,
  },
}
```
`run.mjs` imports and passes this as `lighthouse()`'s third argument
(`config`), replacing the current `undefined`. No custom config
authored — reusing Lighthouse's own maintained preset means future
Lighthouse upgrades keep this suite's desktop throttling numbers current
without this project tracking them by hand.

### D2: Authenticate via the compose stack's fixed admin credentials, not a new public-project fixture
Bug 2's root cause: the suite runs fully anonymous (original design.md
D1's explicit goal — zero auth setup), and `ProjectsPage.tsx:284`
redirects anonymous visitors straight to the single public project when
exactly one exists. Two fixes were considered:

1. **Add a second public project to Sample Project content**, so `/`
   never qualifies for the single-project redirect. Rejected: this
   changes product-visible seed content solely to accommodate test
   tooling, and reintroduces exactly the Sample-Project-coupling the
   original change deliberately avoided.
2. **Authenticate the suite** (chosen). The compose stack already sets
   fixed `TESTPULSE_ADMIN_EMAIL`/`TESTPULSE_ADMIN_PASSWORD`
   (`deploy/compose/docker-compose.yml`) for exactly this kind of
   tooling use (the same credentials `cmd/seed-demo`/`cmd/seed-perf`
   already rely on existing). `run.mjs` POSTs once to
   `/api/v1/auth/login` with those credentials, reads the `Set-Cookie`
   response header, and passes it as `extraHeaders: { Cookie: ... }` to
   every `lighthouse()` call — Lighthouse's Node API supports
   `flags.extraHeaders` for exactly this.

Authenticating also removes the suite's dependency on the Sample
Project's `PublicAccess` flag and the instance's `publicProjectsEnabled`
switch both staying on — either one being toggled off (both are
real, documented, admin-configurable settings) would previously have
broken the suite with no indication why. And it makes the baseline
reflect the realistic common case (an authenticated tester/dev using the
app) rather than the minority anonymous-public-viewer case.

Since the suite authenticates anyway now, `discover-urls.mjs` switches
from `/api/v1/public/projects`/`/api/v1/public/projects/{key}/runs` to
the authenticated `/api/v1/projects`/`/api/v1/projects/{key}/runs` —
keeping the public-route code path around with no remaining caller
would be dead weight. This also matches the k6 suite's own discovery
pattern (`apps/api/perf/summaries-and-run-items.js`'s `setup()`), so both
suites now discover fixtures the same way.

### D3: `seed-perf` idempotency via skip-if-exists, not delete-then-recreate
`DeleteProject` (`service.go:442`) requires the project to already be
archived, and even then only queues it (`MarkForDeletion` →
`ListPendingDeletion`, a background-reaper model, confirmed in
`store/projects.go`) rather than synchronously removing it — not a good
fit for a dev CLI tool that needs re-running to converge immediately,
with no reaper necessarily running. Simpler fix: `seedPerfFixture` lists
existing projects first and skips creating any `Perf Load NN` whose name
already exists, making repeated runs converge to the same 60 projects
rather than erroring, deleting, or duplicating. Trade-off: if the fixture
definition itself changes (e.g. `runItemCounts`), a stale existing
project from before the change won't pick up the new shape until the DB
is wiped — acceptable for dev tooling, the same "wipe for a truly fresh
fixture" workflow already documented elsewhere in this project (e.g.
`reinstate-incremental-migrations`'s reset instructions).

With seeding now idempotent, `summaries-and-run-items.js`'s own guard
tightens from `perfProjects.length < EXPECTED_PROJECT_COUNT` (a floor
that silently passed at 120) to `!== EXPECTED_PROJECT_COUNT` (fails
loudly on any drift) — meaningful now that a correct re-run always
converges to exactly 60.

## Risks / Trade-offs

- **Desktop throttling numbers will differ substantially from the
  provisional mobile-profile baseline** — expected and intended; the old
  numbers are being replaced specifically because they measured the
  wrong profile, not refined.
- **Authenticating couples the suite to login working at all** — a
  regression in `/api/v1/auth/login` itself would now break this suite
  too, whereas before it only needed read routes to work. Accepted:
  login is exercised by `make e2e` on every push already, so a login
  regression would already be caught elsewhere first.
- **Skip-if-exists can mask a fixture-shape change** (see D3) until a
  manual DB wipe. Accepted and documented, not fixed, per D3's
  reasoning — cheap enough to live with for dev-only tooling.

## Migration Plan

No migration — pure test-tooling correction, no schema/API/production
code changes. `make perf-web`/`make seed-perf` behavior changes for
whoever runs them; nothing else is affected.
