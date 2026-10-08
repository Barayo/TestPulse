## Context

No performance signal exists for the web UI today — only functional
coverage (Vitest unit tests + Playwright E2E; see `docs/testing.md`'s
test pyramid). Backlog #23 asks for Lighthouse-based checks
(performance/accessibility/best-practices) against the app's heaviest
pages. This mirrors `api-performance-testing` (#22, refined by #216),
which closed the same kind of gap for the API — same "documented
baseline, not a CI gate" shape, same `make <target>` + `docs/testing.md`
delivery pattern.

**Target pages**, confirmed against `apps/web/src/App.tsx`'s route
tables:
- `/` — `ProjectsPage`, the project list.
- `/projects/:projectKey` — `ProjectPage`, a project landing page.
- `/projects/:projectKey/library` — `FolderExplorerPage`, the two-pane
  Library browser (`openspec/specs/ui-navigation`'s "Library with
  two-pane navigation" requirement: full section tree + case list +
  inline previews). This is the heaviest page by DOM/data volume, not
  because of the landing page's "Dense project stays legible" scenario
  (that scenario is actually about `ProjectPage`'s own Library *panel*,
  a capped preview — a different, lighter-weight element on a different
  page; the issue's citation was imprecise, corrected here).
- `/runs/:runKey` — `RunPage`, the run execution board.

**Auth is solved by an existing feature, not new plumbing.** All four
routes are registered in `App.tsx`'s `PROJECT_CONTENT_ROUTES` with
`anonymous: true`, rendered through `AllowAnonymous`
(`unify-authenticated-and-public-views`) rather than `RequireAuth`. The
always-on Sample Project is deliberately marked public
(`apps/api/internal/sampledata/seed.go:63`, `PublicAccess: true`)
specifically so it's reachable with no session. This is a real
difference from `api-performance-testing`'s k6 suite, which needed a
`TESTPULSE_PERF_TOKEN` because its target API endpoints have no
anonymous mode — this suite needs no credential at all.

Project/run **keys are not stable across reseeds** — human-readable keys
are assigned at creation time (`add-human-readable-keys`), so the suite
must discover the Sample Project's key and a real run key from the
running API at suite-start, the same discovery-not-hardcoding approach
`apps/api/perf/summaries-and-run-items.js`'s `setup()` already uses for
its own fixture (`GET /api/v1/projects`, filter, then
`GET /api/v1/projects/{key}/runs`).

## Goals / Non-Goals

**Goals:**
- A runnable Lighthouse CI suite covering the four target pages,
  producing real performance/accessibility/best-practices scores and
  core web vitals (LCP, TBT, CLS).
- A `make perf-web` target, matching the existing `make perf-api`/
  `make e2e` UX — one documented command against a running compose
  stack.
- A real baseline recorded in `docs/testing.md`'s Performance section,
  run against the always-on Sample Project (no extra seed step needed —
  see D2), as a range across multiple runs, not a single sample.

**Non-Goals:**
- No CI wiring. #24 (a separate, optional CI stage) explicitly depends
  on this change existing first; this change produces the tooling #24
  will later consume, it doesn't consume itself.
- No pass/fail score thresholds/gate. Per the issue: "Budget thresholds
  ... need a real baseline run before they mean anything — don't invent
  numbers up front." Lighthouse CI's `assertions` are left unset (or
  informational-only, `warn` not `error`) in this change.
- No Sample Project *content* changes. This is dev/test tooling with no
  new user-facing product surface — CLAUDE.md's "purely internal work"
  exemption applies, same as the k6 suite.
- No coverage of authenticated-only pages (Library's Suites/Runs lists,
  settings pages, run creation). The issue scopes this to the four pages
  above; a future change can extend coverage once this suite's pattern
  exists to copy (same relationship the k6 suite has to #180's
  unaddressed write-path concern).

## Decisions

### D1: `lighthouse` + `chrome-launcher` directly, not `@lhci/cli`
The issue names `@lhci/cli` (Lighthouse CI) as a candidate tool. Installing
it during implementation surfaced a real cost: its dependency tree pulls
in ~17 new high/moderate-severity `npm audit` findings (puppeteer-core,
extract-zip, tmp, the proxy-agent/get-uri/pac-proxy-agent chain, argparse,
js-yaml, sprintf-js, uuid, inquirer/external-editor) — all from `@lhci/cli`'s
own wrapper tooling (its interactive `wizard` command, `lhci server`
upload support), not from Lighthouse itself. Verified directly: installing
bare `lighthouse` + `chrome-launcher` alone adds **zero** `npm audit`
findings on top of this repo's existing baseline.

Since this change doesn't use any `@lhci/cli`-specific feature — no
`lhci server`/upload, no historical trend storage, no wizard (see D4) —
the only functionality actually needed is "launch Chrome, run Lighthouse
against a URL, read back the scores and vitals," which the `lighthouse`
npm package's own programmatic API (`lighthouse(url, flags, config)`)
and `chrome-launcher` (`chrome-launcher.launch()`) provide directly, with
no wrapper in between. A ~40-line runner script replaces `lhci autorun`:
launch Chrome once, loop over the four discovered URLs calling
`lighthouse()` `numberOfRuns` times each (D2), take the median, print
scores/vitals. Apache-2.0 licensed (both packages), satisfying CLAUDE.md's
open-source constraint. Costs a small amount of extra code (the runner
loop + median calculation) that `lhci autorun` would have provided for
free — accepted, since it's one-time and keeps the dependency tree clean.

If #24 later wires this into CI, `treosh/lighthouse-ci-action` isn't
usable without reintroducing `@lhci/cli` as its runtime — that decision
belongs to #24, which can re-evaluate once CI wiring is actually in
scope (e.g. running this same custom script in a GitHub Actions step
needs no CI-specific action at all).

### D2: Target the always-on Sample Project, not a `seed-demo`-style fixture
Unlike the k6 suite (which needed `make seed-perf`'s 60-project fixture
to exercise aggregation cost that scales with data volume), Lighthouse
scores a single page load's rendering/interactivity cost — not request
throughput. The Sample Project's existing density (4 suites, 37 cases
per `api-performance-tests`' design.md, several runs with mixed
verdicts) is representative of the pages' real DOM shape and needs no
new fixture. This also means `make perf-web` has one fewer precondition
than `make perf-api`: no seed step, no token — just the compose stack.

### D3: A small Node discovery script, feeding the runner directly
A `discover-urls.mjs` script (plain Node, `fetch` against
`TESTPULSE_BASE_URL`) resolves the Sample Project's key via
`GET /api/v1/projects` (filtering for the project flagged `isSample`,
mirroring the k6 script's discovery pattern) and a run key via
`GET /api/v1/projects/{key}/runs`, returning the four resolved URLs as a
plain object. `run.mjs` (D1) imports and calls it directly in-process —
no intermediate config file to write/read, since there's no `lhci` config
format to populate. Keeps the "find today's real keys" logic in one
small, independently testable unit.

This script is plain application logic (not a declarative config file),
so it follows normal TDD: a failing Vitest test first (mock `fetch`,
assert the resolved URL list/shape), then the minimal implementation —
unlike `run.mjs`'s own orchestration code or `apps/api/perf/summaries-and-
run-items.js`, which are script artifacts with no failing-test-first
equivalent (same line `apps/api/perf/README.md` already draws for the k6
script).

### D4: No results server, no historical storage
No results-upload/trend-dashboard step. Out of scope: this change's
deliverable is the same "documented range in `docs/testing.md`, re-run
manually" shape as the k6 suite, not a new piece of infrastructure to
operate. `lighthouse()`'s full JSON result for each run is written to a
git-ignored local directory (`apps/web/perf/.results/`) so a maintainer
can inspect a single run's detail if a logged summary number looks off,
without needing any server component.

### D5: Scores and vitals reported per-page, not blended
Lighthouse naturally reports per-URL results (unlike k6's per-request
model, which needed explicit tagging to avoid a blended summary — see
`api-performance-testing`'s D4/D5 follow-up in #216). No equivalent work
needed here: `run.mjs` prints one block per URL, so `docs/testing.md`'s
baseline table is a straightforward transcription of four per-page rows.

## Risks / Trade-offs

- **Local-only baseline, not reproducible CI hardware** → scores depend
  on whoever's machine ran `make perf-web`, same caveat the k6 baseline
  already documents. Mitigated the same way: document the exact command
  and precondition, record a range across multiple runs, and frame it
  explicitly as a before/after comparison aid, not a certified score.
- **Lighthouse's own run-to-run variance** (CPU throttling simulation is
  noisy on shared/laptop hardware) → mitigated by running Lighthouse
  multiple times per URL (`numberOfRuns`, a `run.mjs` constant) and taking
  the median, rather than a single sample per page.
- **Four pages is a narrow slice** → doesn't cover authenticated-only
  pages or interaction-level performance (e.g. drag-and-drop in the
  Library). Accepted: matches the issue's explicit scope; the pattern
  this change establishes (discovery script + runner + `make` target +
  documented baseline) is reusable for a future change to extend
  coverage.
- **Hand-rolled runner instead of a maintained CLI** → `lhci autorun`
  handles edge cases (retries, Chrome flag tuning) this change's runner
  won't initially cover. Accepted given the vulnerability finding in D1;
  the runner stays intentionally small (~40 lines) so its surface is easy
  to audit and extend if a real gap shows up in practice.

## Migration Plan

No migration — pure test tooling addition, no schema/API/production web
code changes. `make perf-web` is opt-in and local-only; nothing changes
for anyone who doesn't run it.
