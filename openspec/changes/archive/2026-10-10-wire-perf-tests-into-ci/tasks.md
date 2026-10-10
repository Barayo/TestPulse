## 1. Workflow file

- [x] 1.1 Create `.github/workflows/performance.yml` with `name:
  Performance`, `on: schedule: [{cron: '0 6 * * *'}]` and `on:
  workflow_dispatch:`, and top-level `permissions: contents: read`
  (matching `ci.yml`'s minimal-permissions convention). No
  `pull_request`/`push` trigger.
- [x] 1.2 Add the `performance` job (`runs-on: ubuntu-latest`) with
  steps, in order: `actions/checkout` (pinned SHA matching `ci.yml`),
  `actions/setup-go` (go-version-file: `apps/api/go.mod`),
  `actions/setup-node` (node-version 24, cache npm), `npm ci`.
- [x] 1.3 Add an "Install k6" step using the verified official apt
  recipe (gpg key import from `dl.k6.io`, apt repo line, `apt-get
  update`, `apt-get install -y k6`).
- [x] 1.4 Add a "Start compose stack" step:
  `docker compose -f deploy/compose/docker-compose.yml up --build -d
  --wait`, then a readiness-wait loop against `http://localhost:8080/readyz`
  (mirroring `ci.yml`'s `e2e` job's own loop, including its failure-path
  `docker compose logs` + `exit 1`).
- [x] 1.5 Add an "Expose db port" step: write an inline compose override
  (heredoc) publishing `db`'s port to `5432`, then `docker compose -f
  deploy/compose/docker-compose.yml -f <override> up -d db`.
- [x] 1.6 Add a "Seed perf fixture" step: `TESTPULSE_DATABASE_URL`
  pointed at `postgres://testpulse:testpulse@localhost:5432/testpulse?sslmode=disable`,
  running `make seed-perf`.
- [x] 1.7 Add a "Create scoped API token" step: `curl` login against
  `/api/v1/auth/login` with the compose stack's fixed admin credentials,
  extract the session cookie, `curl -b` `POST /api/v1/tokens`, extract
  `.token` via `jq`, append `TESTPULSE_PERF_TOKEN=<token>` to
  `$GITHUB_ENV`. Ensure the password is never echoed to the log (passed
  as a `curl -d` JSON body argument, not printed).
- [x] 1.8 Add "Run API perf suite" (`make perf-api`) and "Run web perf
  suite" (`make perf-web`) steps, each a plain `make` invocation with no
  added pass/fail wrapper.
- [x] 1.9 Add two `actions/upload-artifact` steps (same pinned
  action/version `ci.yml` uses), `if: always()`, one for
  `apps/api/perf/.results/` (name `api-perf-results`) and one for
  `apps/web/perf/.results/` (name `web-perf-results`).
- [x] 1.10 Add a "Stop compose stack" step, `if: always()`:
  `docker compose -f deploy/compose/docker-compose.yml down -v`.

## 2. Docs

- [x] 2.1 Update `docs/testing.md`'s Performance section intro sentence
  ("Two local/manual performance suites exist — neither wired into CI")
  to describe the new scheduled/manual workflow, while still stating
  neither suite gates a PR.
- [x] 2.2 Update `apps/api/perf/README.md`'s "not wired into CI (see
  design.md's Non-Goals)" line to reference the new workflow.
- [x] 2.3 Update `apps/web/perf/README.md`'s equivalent line the same
  way.
- [x] 2.4 Commit (workflow file + docs together — the docs changes only
  describe the workflow this commit adds):
  `ci: add scheduled performance workflow for k6/Lighthouse suites`.

## 3. Verification

- [x] 3.1 Push the commit, then manually trigger the workflow via `gh
  workflow run performance.yml` (or the Actions UI) and watch it to
  completion — confirm the job succeeds, both artifacts are present
  (`gh run view <run-id>` / `gh api .../artifacts`), and the compose
  stack was torn down (ephemeral runner — nothing to verify locally).
  First run (38083805143) succeeded but uploaded zero-file artifacts —
  `actions/upload-artifact` excludes dot-directories by default; fixed
  with `include-hidden-files: true` (commit eab65cd). Re-run
  (38084319777) confirmed both artifacts present with real content
  (web-perf-results 1.44MB, api-perf-results 3.2KB).

## 4. Spec sync & archive

- [ ] 4.1 Verify `openspec validate --changes wire-perf-tests-into-ci
  --strict` passes.
- [ ] 4.2 Run `/opsx:archive wire-perf-tests-into-ci`, syncing the new
  `performance-ci-workflow` spec.
