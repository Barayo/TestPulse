# Web performance tests

A local Lighthouse baseline covering the web app's four heaviest/most
representative pages: the project list (`/`), a project landing page, the
Library two-pane browser, and a run execution board. See
`openspec/changes/archive/` (once archived) for the full design rationale.

This is a local/manual tool, not wired into CI (see design.md's
Non-Goals) — no pass/fail gate, just a documented baseline. Runs
`lighthouse`/`chrome-launcher` directly rather than `@lhci/cli` — the
latter's own wrapper tooling (interactive wizard, server-upload support,
neither used here) pulls in ~17 high/moderate `npm audit` findings with
no functional benefit for this suite's scope (design.md D1).

## Prerequisites

- A running compose stack (`make compose-up`). Unlike `apps/api/perf/`,
  **no extra seed step is needed** — this suite scores page-load/
  interactivity cost, not a throughput-scaling aggregation query, so the
  always-on Sample Project's existing density is representative
  (design.md D2). Nothing to set up for auth either: the suite logs in
  itself using the compose stack's fixed admin credentials
  (`TESTPULSE_ADMIN_EMAIL`/`TESTPULSE_ADMIN_PASSWORD` in
  `deploy/compose/docker-compose.yml`), the same ones `cmd/seed-demo`/
  `cmd/seed-perf` already rely on existing
  (`fix-web-perf-lighthouse-methodology` D2 — logging in, rather than
  relying on the Sample Project's public-access flags, also avoids a
  redirect that otherwise collapses two of the four target pages into
  one; see that change's design.md for the full story).
- `lighthouse` + `chrome-launcher` are regular npm devDependencies
  (`apps/web/package.json`) — already installed by the repo's normal
  `npm install`, no separate binary to install (unlike k6).

## Running

```bash
make perf-web
```

Resolves the Sample Project's real key and a real run key from the
running API (`discover-urls.mjs`, D3 — keys aren't stable across
reseeds), runs Lighthouse against all four pages 3 times each, and
prints the median performance/accessibility/best-practices score and
LCP/TBT/CLS per page to the terminal. Also prints the 2-3 performance
audits with the greatest actual impact on each page's score, with
extracted detail where available (e.g. the specific element behind a
layout shift), and the page's console error count
(`improve-perf-suite-reporting` D3/D4) — not just the score, but a hint
at why. Exits 0 regardless of score — see `run.mjs`'s own doc comment.
Each run's full Lighthouse JSON report, plus a `summary.json` with every
page's scores/vitals, is saved under `apps/web/perf/.results/`
(git-ignored) — the per-run JSON for closer inspection if a logged number
looks off, the summary for a future script or CI step to consume without
re-running the suite.

## Baseline

See `docs/testing.md`'s "Performance" section for the last captured
baseline numbers and when/where they were captured.
