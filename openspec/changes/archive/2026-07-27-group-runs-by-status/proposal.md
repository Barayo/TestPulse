## Why

As a QA lead, when I open a project's Runs list, I want to quickly tell which runs
I'm still actively working versus already closed, and read each run's health at a
glance, instead of scanning a flat, plain-text feed of names. `rework-runs-list-ux`
(#94) only fixed the page's *navigation* (list-first instead of form-first) — it
never carried forward the richer per-row design (status badge, pass-rate health
bar, created date) its own source mockup already specified, and nothing groups
runs by open/closed. On the live dogfood project this is made worse by CI's
automated e2e-result imports, which add many near-duplicate auto-generated runs
on every push to `main`, burying the handful of runs someone is actually working.

## What Changes

- `GET /api/v1/projects/{projectKey}/runs` gains a server-computed `passRate`
  (0-100, or `null` if the run has no items yet) on each returned `Run` — computed
  in one aggregate query, not a per-run round trip (`packages/shared/openapi.yaml`
  + `RunRepo.List`).
- `RunsPage.tsx` renders each run as a row with a status badge, `HealthBar`
  (reusing the existing component), and a relative "created" timestamp — bringing
  the page in line with the row design `rework-runs-list-ux`'s own mockup already
  specified but the implementation dropped.
- Runs split into two sections, **Open** first, then **Closed**, per Pepe's design
  pass (`design.md`, `mockup.html`) — covers section headers/counts, sort order
  within each section, and how the list holds up with a long, noisy Closed section.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `ui-navigation`: the "Run creation" requirement's Runs-list scenarios are
  replaced with grouped, richer-row behavior (status badge, health bar, date,
  Open/Closed sections).

## Impact

- `packages/shared/openapi.yaml`, `apps/api/internal/store/runs.go` (`RunRepo.List`),
  `apps/api/internal/domain/domain.go` (`Run.PassRate`) — contract-first backend
  aggregate.
- `apps/web/src/pages/RunsPage.tsx`, `apps/web/src/pages/RunsPage.test.tsx` —
  grouped, richer row rendering.
- `docs/test-management.md` — Runs section description.
- Sample Project (`apps/api/internal/sampledata/seed.go`) — needs both open and
  closed runs with varied pass rates to showcase the grouping; verify during
  implementation, add if missing.
