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
  **no extra seed step and no API token are needed**: all four target
  pages are anonymously reachable because the always-on Sample Project
  is marked public by default (`apps/api/internal/sampledata/seed.go`),
  and this suite scores page-load/interactivity cost, not a
  throughput-scaling aggregation query — the Sample Project's existing
  density is representative (design.md D2).
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
LCP/TBT/CLS per page to the terminal. Exits 0 regardless of score — see
`run.mjs`'s own doc comment. Each run's full Lighthouse JSON report is
saved under `apps/web/perf/.results/` (git-ignored) for closer
inspection if a logged number looks off.

## Baseline

See `docs/testing.md`'s "Performance" section for the last captured
baseline numbers and when/where they were captured.
