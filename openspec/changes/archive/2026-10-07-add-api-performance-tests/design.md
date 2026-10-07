## Context

No performance/load test suite exists for the Go API today — only
functional layers (unit, db-integration, handler, E2E; see
`docs/testing.md`'s test pyramid). Backlog #22 asks for one, scoped to
two endpoints with real aggregation/pagination cost:

- `GET /api/v1/projects/summaries` (`listProjectSummaries`) —
  `add-project-stats-endpoint`'s whole reason for existing: one request
  returns suite/case counts and latest-run pass rate for every
  non-archived project, explicitly designed to keep request count flat
  regardless of project count. No baseline exists for what "flat" costs
  in practice as project count grows.
- `GET /api/v1/runs/{runKey}/items` (`listRunItems`) — cursor-paginated,
  the run execution board's main data source.

Every route requires authentication (`add-identity-basics`); scoped API
tokens (`Authorization: Bearer tp_<token>`) are the agent-facing auth
path and the natural fit for a scripted load test — no session-cookie
flow to script around.

`ProjectSummary` (the `summaries` response shape) only carries
`projectId` (the internal UUID) — no project name or `key`, confirmed
against `store/projects.go`'s `Summaries()` (`SELECT id, archived FROM
projects`). It can't be used to discover the "Banca Móvil" project by
name. `GET /api/v1/projects` (`listProjects`) returns full `Project`
objects with both `key` (the human-readable identifier used in path
params) and `name`, so the k6 setup stage discovers the target project
there instead — `summaries` is only exercised as part of the measured
load, never for discovery.

A sibling backlog issue (#24) wants these wired into a separate,
non-blocking CI workflow — but #24 explicitly depends on #22 **and** #23
(web/Lighthouse perf testing) both existing first. #23 is not part of
this change, so CI wiring is out of scope here (see Non-Goals).

## Goals / Non-Goals

**Goals:**
- A runnable, scripted load test suite for the two target endpoints,
  producing real p95/p99 latency and throughput numbers.
- A `make perf-api` target so running it is a one-line, documented
  command, matching the existing `make e2e`/`make coverage-api` UX.
- A real baseline recorded in `docs/testing.md`, run against realistic
  data density (`make seed-demo`'s "Banca Móvil" project), not the
  minimal always-on Sample Project.

**Non-Goals:**
- No CI wiring. #24 (the separate performance workflow) explicitly needs
  both #22 and #23 to exist first; #23 (web/Lighthouse) is a separate,
  unselected backlog item. This change produces the tooling #24 will
  later consume — it doesn't consume itself.
- No pass/fail threshold/gate. The issue is explicit: "baseline +
  regression budget... rather than a pass/fail gate initially — needs a
  real baseline run before any threshold means anything." k6's
  `thresholds` config is left unset (or informational-only) in this
  change; a future change can add real thresholds once the baseline
  numbers this change produces have been observed over time.
- No coverage of write endpoints (`POST`/`PATCH`/`DELETE`) or any
  endpoint beyond the two the issue names. A known related issue (#180,
  N+1 query amplification in `CreateRun`'s case-key resolution) is a
  real performance concern but a different one — out of scope here,
  worth its own targeted load test once this suite's pattern exists to
  copy.
- No Sample Project showcase. This is dev/CI tooling with no new
  user-facing product surface — falls under CLAUDE.md's "purely
  internal work" exemption from that standing rule.

## Decisions

### D1: k6 as the load-testing tool
Over Gatling (JVM-based — adds a JVM dependency to a Go+Node stack and to
any future CI job, poor fit) and vegeta/hey (Go-native, lightweight, but
single-endpoint hammering only — no multi-step scenario scripting, so
"authenticate once, then exercise two endpoints with a realistic mix"
can't be expressed as one flow).

k6 scripts in JS but ships as a single static Go binary (no Node
toolchain dependency at run time), supports multi-step scenarios and
weighted endpoint mixes, and has built-in `thresholds`/`checks` that map
directly onto the issue's own "baseline + regression budget" language —
the right shape for a future threshold-gate change to build on without a
tool swap. k6 is AGPL-3.0 licensed open source, satisfying CLAUDE.md's
"all stack additions must be open source" constraint. This is dev/CI
tooling only (like Playwright or Vitest already in this repo) — never
bundled into the shipped product, so it doesn't need a David
trademark-review gating pass the way a vendor-named product integration
(e.g. a TestRail importer) would.

### D2: Auth via a pre-created scoped token, not self-provisioning
The k6 setup stage reads a pre-created scoped API token from
`TESTPULSE_PERF_TOKEN` rather than creating one itself via the tokens
API. Token creation is a one-time, documented manual setup step (create
a token at `/settings/tokens` or via `POST /api/v1/tokens`, export it)
— keeping it out of the measured load-test flow avoids skewing the
latency numbers with unrelated token-creation cost and keeps the script
simple (one read-only credential in, no cleanup-on-exit logic needed).

### D3: Target data is `make seed-demo`'s Banca Móvil project, not the Sample Project
The always-on Sample Project (`apps/api/internal/sampledata/seed.go`) is
deliberately small (4 suites, 37 cases) — a showroom, not a load-test
fixture. `make seed-demo`'s "Banca Móvil" project (nested folders, one
with 30+ cases, 7 suites, several runs with mixed results — see
`docs/development.md`) is the existing dev-tooling fixture already built
for "realistic content density," reused here rather than inventing a
third seeding path.

### D4: Baseline only, recorded in docs — no CI gate
Per the issue's explicit ask, this change's deliverable is a documented
number (p95/p99 latency at a defined req/s for each endpoint), not a
pass/fail gate. Adding a threshold before a real baseline exists would
be inventing a number, which the issue explicitly warns against for both
sibling issues (#23 says the same about Lighthouse score budgets).

## Risks / Trade-offs

- **Local-only baseline, not reproducible CI hardware** → the numbers
  this change records depend on whoever's machine ran `make perf-api`.
  Mitigated by documenting the exact command and seed data precondition
  in `docs/testing.md`, so the baseline is at least re-creatable, and by
  explicitly not treating the number as an absolute gate (see D4) — it's
  a before/after comparison aid, not a certified SLA.
- **Two endpoints is a narrow slice** → doesn't catch regressions in
  write-heavy paths (e.g. #180's `CreateRun` N+1). Accepted: matches the
  issue's explicit scope, and this suite's structure (k6 scenario +
  `make` target + documented baseline) is the reusable pattern a future
  change can copy for other endpoints without re-deciding the tooling.

## Migration Plan

No migration — pure test tooling addition, no schema/API/runtime
changes. `make perf-api` is opt-in and local-only; nothing changes for
anyone who doesn't run it.
