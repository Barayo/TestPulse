## 1. Close the vulnerabilities govulncheck currently finds

- [x] 1.1 Bump `go 1.26.5` → `go 1.26.6` in `apps/api/go.mod`,
  `tools/import-connector/go.mod`, `tools/jira-connector/go.mod`.
- [x] 1.2 Bump `golang.org/x/image` to v0.45.0 in `apps/api/go.mod` (`go get
  golang.org/x/image@v0.45.0 && go mod tidy`).
- [x] 1.3 Run `go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...` in
  each of the three module directories; confirm all report zero
  vulnerabilities. Confirmed: all three report "No vulnerabilities found."
- [x] 1.4 Run each module's full test suite (`go test ./...`), confirm no
  regressions from the toolchain/dependency bumps — `apps/api`'s
  `attachmentimage` package specifically, since it's the `golang.org/x/image`
  call site. All green: apps/api (16 packages), import-connector (10), jira-connector (4). attachmentimage's webp/VP8L decode tests specifically confirmed passing.

## 2. Fix the pre-existing jira-connector lint violations

- [x] 2.1 Fix the 3 unchecked `resp.Body.Close()` errcheck violations in
  `tools/jira-connector/internal/jiraclient/client.go` and
  `tools/jira-connector/internal/testpulseclient/client.go` (wrap as `defer
  func() { _ = resp.Body.Close() }()`, matching this session's own
  `apps/api/internal/service/webhooks.go` precedent).
- [x] 2.2 Fix the ST1005 capitalized-error-string violation in
  `tools/jira-connector/internal/jiraclient/client.go` ("Jira search
  returned %s" → "jira search returned %s").
- [x] 2.3 Run `golangci-lint run` in `tools/jira-connector`, confirm 0
  issues. Confirmed clean.
- [x] 2.4 Run `tools/jira-connector`'s full test suite, confirm green (the
  lint fixes are error-handling-only, no behavior change expected, but
  verify). All 4 packages pass; no test asserted the old capitalized error text, so no test updates needed.

## 3. CI: govulncheck for apps/api

- [x] 3.1 Add a `govulncheck` step to the existing `api` job in
  `.github/workflows/ci.yml`, after the existing `Lint` step: `go run
  golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...`. YAML validated with `python3 -c "import yaml; yaml.safe_load(open(...))"`.

## 4. CI: new import-connector and jira-connector jobs

- [x] 4.1 Add a new `import-connector` job to `.github/workflows/ci.yml`,
  `working-directory: tools/import-connector`, gated `if:
  github.event_name == 'pull_request'` — steps: checkout, setup-go
  (`go-version-file: tools/import-connector/go.mod`), build, vet, lint
  (`golangci-lint-action`), test, govulncheck — mirroring the `api` job's
  step shape exactly.
- [x] 4.2 Add a new `jira-connector` job, identical shape, `working-directory:
  tools/jira-connector`. Verified locally: build+vet+lint+test+govulncheck all pass for both modules in the exact command sequence the CI job runs.
- [ ] 4.3 (deferred to 7.4, combined with 5.4 in one push) Push a throwaway branch (or open a draft PR) to confirm both new
  jobs actually run and pass in real GitHub Actions, not just locally —
  local `golangci-lint`/`go test` runs can behave differently from the
  pinned `golangci-lint-action` version CI uses.

## 5. CodeQL workflow

- [x] 5.1 Create `.github/workflows/codeql.yml`: `on: pull_request` +
  weekly `schedule`; `permissions: security-events: write` (required for
  CodeQL's SARIF upload) plus `actions: read`, `contents: read`; a
  `strategy.matrix` of `{language: go, build-mode: manual}` and
  `{language: javascript-typescript, build-mode: none}`, `fail-fast:
  false`.
- [x] 5.2 For the `go` matrix entry: checkout, `actions/setup-go` (any one
  of the three `go.mod` files — all pin the same version post-task-1.1),
  `github/codeql-action/init@cdf488f595d80d6e07e03d4674febd5ab45fa938 #
  v4.37.9` with `languages: go`, `build-mode: manual`, a manual build step
  running `go build ./...` in each of `apps/api`,
  `tools/import-connector`, and `tools/jira-connector`, then
  `github/codeql-action/analyze@cdf488f595d80d6e07e03d4674febd5ab45fa938 #
  v4.37.9`.
- [x] 5.3 For the `javascript-typescript` matrix entry: checkout,
  `codeql-action/init` with `languages: javascript-typescript`,
  `build-mode: none`, `codeql-action/analyze` — no build step needed
  (source-only analysis).
- [ ] 5.4 (deferred to 7.4, combined with 4.3 in one push) Push a throwaway branch (or open a draft PR) to confirm the
  workflow actually runs to completion for both matrix entries in real
  GitHub Actions and produces a Code Scanning result (even if empty) —
  CodeQL's manual-build-mode wiring is easy to get subtly wrong
  (e.g. wrong working directory) in a way that only surfaces at runtime,
  not from reading the YAML.

## 6. Documentation

- [x] 6.1 Update `docs/testing.md`'s "CI layout" section: note the API job
  now includes `govulncheck`, the two new connector jobs and what they
  cover, and add a short mention of the CodeQL workflow (what it analyzes,
  PR + weekly schedule).

## 7. Full verification

- [ ] 7.1 Run `go build ./... && go test ./...` in all three Go module
  directories, confirm 100% pass.
- [ ] 7.2 Run `make coverage-api`, confirm the ≥80% gate still passes
  (unaffected by this change, but confirm no regression from the
  toolchain/dependency bumps).
- [ ] 7.3 Run `make lint`, confirm clean across `apps/api` (unaffected) and
  the web app (unaffected) — this change doesn't touch `apps/web` source.
- [ ] 7.4 Confirm the real CI runs from tasks 4.3 and 5.4 (or a single
  combined draft PR covering both) are green before merging this change's
  actual PR/commit — this change is CI-infrastructure itself, so "does it
  actually pass in GitHub Actions" cannot be fully verified locally the
  way a normal code change can.
