## Context

Both performance suites exist and work (`add-api-performance-tests`,
`add-web-performance-lighthouse`, and their subsequent methodology/
reporting fixes), but only ever run on a developer's own machine via
`make perf-api`/`make perf-web`. `.github/workflows/ci.yml` deliberately
never runs them — they're slower and noisier than functional tests, and
not meant to gate every PR (#24's own framing). This change adds a
*separate* scheduled/manual workflow, leaving `ci.yml` untouched.

Confirmed from the real repo before designing:
- The shipped app image (`Dockerfile`) ends in
  `gcr.io/distroless/static-debian12:nonroot` with only the compiled
  binary — no Go toolchain, no shell. `make seed-perf` must run on the
  CI runner itself (via `actions/setup-go`, same as `ci.yml`'s `api`
  job), not inside a container.
- `deploy/compose/docker-compose.yml`'s `db` service doesn't publish its
  port to the host by default — the existing documented local recipe
  (`apps/api/perf/README.md`) works around this with an inline compose
  override exposing port 5432. This workflow does the same thing as a
  step, not a new committed override file.
- The compose stack's admin credentials are hardcoded fixed dev
  credentials (`admin@example.com` / `correcthorsebatterystaple`),
  explicitly documented as fine for "the local/E2E evaluation stack, not
  production" — no new GitHub secret is needed to create a perf token.
- k6 is not preinstalled on `ubuntu-latest`; Google Chrome is (confirmed
  directly against `actions/runner-images`' published manifest, not
  assumed) — `chrome-launcher` (used by `apps/web/perf/run.mjs`)
  autodetects it, so the Lighthouse suite needs no extra browser-install
  step, unlike `ci.yml`'s `e2e` job which manages Playwright's own
  bundled browser separately.

## Goals / Non-Goals

**Goals:**
- Run both existing suites automatically, on a schedule and on demand,
  without touching `ci.yml` or either suite's own scoring/scenario logic.
- Produce a reviewable artifact from every run (success or failure) so a
  maintainer can inspect results without re-running locally.
- Preserve both suites' existing "not a pass/fail gate" guarantee — this
  workflow surfaces infrastructure failures (compose never ready,
  seed-perf errored, the suite script crashed), never a latency/score
  number.

**Non-Goals:**
- Lighthouse HTML report generation. The suite already writes per-run
  JSON + `summary.json`; adding a human-friendlier HTML format is a
  separate, deferred enhancement to `apps/web/perf/run.mjs` itself (a
  `lighthouse` flag change, `output: ['json', 'html']`), not needed to
  satisfy "wire into CI." Can be revisited if reviewing raw JSON
  artifacts proves painful in practice.
- Any change to `ci.yml`, to either suite's scenario/scoring code, or to
  `deploy/compose/docker-compose.yml`.
- New GitHub repo secrets — the compose stack's existing fixed dev
  credentials suffice.

## Decisions

**D1 — One new workflow file, two triggers, never `pull_request`/`push`.**
`.github/workflows/performance.yml`, triggers: `schedule: - cron: '0 6
* * *'` (06:00 UTC daily — arbitrary off-peak time; nothing user-facing
depends on exactly when this runs) and `workflow_dispatch:` (manual,
for on-demand runs after a suspected regression). No `pull_request`/
`push` trigger at all, so this workflow can never affect PR status
checks or `ci.yml`'s runtime.

**D2 — One job, not two.** A single `performance` job runs both suites
sequentially against one compose stack bring-up, rather than two parallel
jobs each paying their own compose-up/build cost. Steps, in order:
1. Checkout, `actions/setup-go` (for `seed-perf`), `actions/setup-node`
   (for `perf-web`'s `node perf/run.mjs` and its npm-installed
   `lighthouse`/`chrome-launcher` deps).
2. `npm ci` (workspace install, needed for `perf-web`).
3. Install `k6` via the official apt recipe (gpg key import, apt repo
   line, `apt-get install k6`) — verified against Grafana's current
   docs, not a marketplace action, consistent with `ci.yml` preferring
   direct, auditable steps over third-party wrapper actions where
   straightforward.
4. Bring up the compose stack: `docker compose -f
   deploy/compose/docker-compose.yml up --build -d --wait`, same as
   `ci.yml`'s `e2e` job, plus a second `docker compose ... up -d db`
   using an inline-generated override file (heredoc, matching the
   already-documented local recipe — not a new committed file) that
   publishes `db`'s port to `5432` on the runner, so `make seed-perf`
   (host-side) can reach it.
5. `make seed-perf` with `TESTPULSE_DATABASE_URL` pointed at
   `localhost:5432`.
6. Create a scoped token: `curl` login as the fixed admin, extract the
   session cookie, `curl -b` to `POST /api/v1/tokens`, extract `.token`
   via `jq`, export via `$GITHUB_ENV` as `TESTPULSE_PERF_TOKEN`.
7. `make perf-api` (now that `k6`, the fixture, and the token all
   exist), then `make perf-web` (no extra setup needed — Chrome is
   already on the runner, the compose stack is already up).
8. Upload `apps/api/perf/.results/` and `apps/web/perf/.results/` as two
   separate `actions/upload-artifact` steps (same pinned action version
   `ci.yml` already uses), `if: always()`.
9. Tear down: `docker compose ... down -v`, `if: always()`, mirroring
   `e2e`'s teardown step.

**D3 — No new gate.** Steps 7's suite invocations are plain `make`
commands with no added latency/score assertion wrapped around them —
each suite already exits 0 regardless of the numbers it reports (an
existing, tested guarantee from both suites' own specs). This job can
only fail from a genuine infrastructure problem (compose never became
ready, `seed-perf`/token-creation erroring, a suite script's own
internal `fail()`/crash) — exactly the class of failure a maintainer
would want a notification for, and nothing else.

**D4 — Artifacts uploaded always, not only on failure.** Unlike
`playwright-report` (`ci.yml`'s `e2e` job, `if: failure()` — a debugging
aid for a failing functional test), this workflow's entire purpose is
producing the report, so both artifact-upload steps run `if: always()`.
A successful run's artifact is the actual deliverable; a failed run's
artifact (whatever partial `.results/` content exists) is still useful
for diagnosing why.

**D5 — Docs corrected, not expanded.** `docs/testing.md`'s Performance
section intro ("Two local/manual performance suites exist — neither
wired into CI") and both suites' READMEs' "not wired into CI (see
design.md's Non-Goals)" lines are updated to describe the new scheduled/
manual, still-non-blocking workflow accurately. No baseline-table
changes — this change doesn't alter either suite's numbers.

## Risks / Trade-offs

- **Risk:** A scheduled run silently fails (e.g. a transient Docker
  Hub/apt mirror hiccup) with nobody watching. → Mitigation: GitHub
  natively emails/notifies repo watchers on a failed scheduled workflow
  run by default; no additional notification plumbing needed for a
  first version of this.
- **Trade-off:** Running both suites in one job means a Lighthouse
  failure doesn't prevent the k6 results from already being uploaded
  (steps run sequentially, each's artifact upload is independent) — but
  also means total job wall-clock time is the sum of both suites rather
  than parallelized. Accepted: simplicity (one compose bring-up, one set
  of credentials/token plumbing) outweighs shaving a few minutes off a
  non-blocking nightly job.
- **Risk:** The compose stack's fixed dev admin credentials are visible
  in workflow logs if ever echoed. → Mitigation: never echo the
  password; `curl` commands pass it directly in a JSON body argument,
  not a logged variable — consistent with how `apps/web/perf/run.mjs`
  itself already handles the same credentials locally.

## Migration Plan

No migration — adding a new CI workflow file only. Rollout is: merge,
confirm a manual `workflow_dispatch` run succeeds end-to-end (tasks.md's
explicit verification task), then let the daily schedule take over.
Rollback is deleting the workflow file; no other system depends on it
existing.

## Open Questions

None — #24's issue body's three "not yet designed" scope items (workflow
file/triggers, dependency on #22/#23 already existing, artifact upload)
are resolved by D1-D4 above.
