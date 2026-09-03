## 1. Repo scaffolding

- [x] 1.1 Create the public repo `Barayo/testpulse-go` (MIT license, Go module `github.com/Barayo/testpulse-go`, `go.mod` declaring `go 1.25`)
- [x] 1.2 Add `gotestsum` (>= v1.13.0) as a documented dev-tool dependency (not a Go module dependency of the library itself — it's an external CLI consumers install), and set up the `testdata/` fixture-package layout for the real end-to-end tests
- [x] 1.3 Add GitHub Actions workflow: `go build` + `go vet` + `go test -race ./...` + coverage, on every PR, using Go 1.25+ (`-race` specifically to catch regressions in the attachment allowlist's concurrency safety, not just a plain `go test`)

## 2. Case tagging via t.Attr (test-first)

- [x] 2.1 Write a failing unit test: `testpulse.Case(t, "LOGIN-42")` calls `t.Attr("testpulse_case_key", "LOGIN-42")` — assert via a fake `TestingT`-shaped recorder capturing `Attr` calls (not a real `*testing.T`, so the assertion doesn't itself depend on `gotestsum`)
- [x] 2.2 Implement `Case(t *testing.T, caseKey string, opts ...Option)` until 2.1 passes
- [x] 2.3 Write failing unit tests for `WithPlatform`/`WithVersion`/`WithTags`: each option present emits its corresponding `t.Attr` call, options not passed emit none; implement `Option`/`WithPlatform`/`WithVersion`/`WithTags` until green
- [x] 2.4 Write a failing real end-to-end test: a fixture Go package under `testdata/` with one test calling `testpulse.Case(t, "LOGIN-42")`, run it through a real `gotestsum --junitfile=...` invocation (shelling out, or via gotestsum's own library entrypoint if stable enough to import), assert the produced XML file's `<testcase>` actually contains `<property name="testpulse_case_key" value="LOGIN-42"/>` — this is the test that actually proves the Go-1.25/gotestsum mechanism researched in design.md works end-to-end, not just that `Case` calls `t.Attr` correctly in isolation
- [x] 2.5 Write a failing real end-to-end test: a fixture package with one test that never calls `testpulse.Case`, run through `gotestsum`, assert its `<testcase>` carries no `testpulse_case_key` property

## 3. Attachments: same-test allowlist and invocation-unique storage (test-first)

- [x] 3.1 Write a failing unit test: `Case(t, "LOGIN-42")` followed by `Attach(t, "LOGIN-42", bytes, "failure.png", "image/png")` in the same test succeeds and writes a sidecar file into the `.testpulse/` scratch directory; implement the package-level allowlist map (keyed by `t.Name()`, populated by `Case`) as a `sync.Map` (or a plain map behind a `sync.Mutex` — not a bare unsynchronized map, since `t.Parallel()` subtests write/read it concurrently) and `Attach`'s lookup against it until green
- [x] 3.2 Write a failing unit test: `Attach(t, "OTHER-1", bytes, "failure.png", "image/png")` for a case key `t`'s own `Case` calls never declared returns a non-nil error and writes nothing; implement the rejection until green
- [x] 3.3 Write a failing unit test: content-type validation (`image/png`/`image/jpeg`/`image/webp` only) runs and rejects before the allowlist check would otherwise accept a call, so an unsupported content type is rejected even for a case key the test did declare; implement the ordering until green
- [x] 3.4 Write a failing unit test: a subtest created via `t.Run("sub", ...)` that calls `Attach(t, "LOGIN-42", ...)` WITHOUT first calling `Case` on its own (subtest) `t` — even though the parent test already called `Case(t, "LOGIN-42")` — returns a non-nil error, since the subtest's own `t.Name()` (`"Parent/sub"`) is a distinct map key from the parent's (`"Parent"`); implement the exact-match-only lookup (no ancestor/prefix walk) until green, and add this exact behavior to the README as a documented gotcha, not just a passing test
- [x] 3.5 Write a failing unit test: two `Attach` calls under the same case key within one test (after a single `Case` call) both produce distinct sidecar files, neither overwriting the other; implement invocation-unique filenames (`hash(caseKey + a freshly-generated UUID)`) until green
- [x] 3.6 Write a failing unit test: the scratch-dir reader returns both sidecars sharing a case key as separate entries (feeds task group 5's grouping-into-request-array logic)
- [x] 3.7 Write a failing unit test run under `go test -race`: multiple `t.Parallel()` subtests, each calling its own `Case(t, "<unique-key>")` then `Attach(t, "<unique-key>", ...)` concurrently, complete without a `fatal error: concurrent map writes` crash and without the race detector flagging a data race, and each subtest's attachment is attributed only to its own case key (not leaked into/from a sibling's); this is what actually proves 3.1's `sync.Map`/mutex choice is correct, not just compiling
- [x] 3.8 Write a failing real end-to-end test: a fixture package where one test calls `Attach` under a case key declared by a *different* test in the same package, run via `go test` directly (not through `gotestsum` — this is a library-level rejection, not an XML concern), assert the call returns the documented error — proving the check works against a real `*testing.T`/`t.Name()`, not just a fake recorder
- [x] 3.9 Write a failing real end-to-end test: a fixture package with a test that calls `Case`/`Attach` multiple times under the same case key within itself, run via `go test`, assert all attachments are present in the scratch directory afterward (not just the last one)

## 4. Config resolution (test-first)

- [x] 4.1 Write failing unit tests for `--url`/`--project`/`--fail-on-unmatched`: flag-alone, env-var-alone, flag-overrides-env-var
- [x] 4.2 Write failing unit tests for `--token`: env-var-alone, flag-overrides-env-var
- [x] 4.3 Write a failing unit test asserting the resolved token is never present in any printed output at any verbosity level, across a successful and a failed submission; implement/confirm the resolver and print statements never reference the raw token value until green — covered here at the `Config.String()` level (a redacting `Stringer`, so any accidental `%v`/`%+v` of the whole config can't leak it) and re-confirmed at the full CLI-output level in section 5's submit tests
- [x] 4.4 Implement the flag definitions and the shared resolver (flag > env var, two tiers only) until 4.1–4.3 pass

## 5. Submission, dry run, and exit-code behavior (test-first)

- [x] 5.1 Write a failing unit test: mock a `201` response (`httptest.Server`), assert `submit` exits `0` and prints the matched-count summary
- [x] 5.2 Write a failing unit test: mock a `207` response, default flags, assert `submit` exits `0` and prints unmatched case keys plus the `--fail-on-unmatched` pointer
- [x] 5.3 Write a failing unit test: mock a `207` response with `--fail-on-unmatched` set, assert `submit` exits non-zero
- [x] 5.4 Write a failing unit test: mock a network error and separately a `401`/`400`/`5xx` response, assert `submit` always exits non-zero regardless of `--fail-on-unmatched`
- [x] 5.5 Write a failing unit test: with `--dry-run` set (mock a `GET /cases` response), assert a match preview is printed, no request is made to the import endpoint, and `submit` exits `0` regardless of the preview's match/no-match content
- [x] 5.6 Implement the `submit` command (reading the JUnit XML file plus grouped attachments, POSTing to `/api/v1/projects/{projectKey}/imports`, branching on response per the table in design.md, honoring `--dry-run`) until 5.1–5.5 pass — attachments are discovered via a `--dir` flag (default `.`) searched recursively for `.testpulse/attachments`, since `go test ./...` forks one process per package, each with its own working directory
- [x] 5.7 Write a failing real end-to-end test: a fixture package with a `testpulse.Case`-tagged test, run the full real pipeline (`go test` → `gotestsum --junitfile=...` → `testpulse-go submit --file ... --dry-run`) against a stubbed HTTP import endpoint, assert the whole chain works together, not just each piece in isolation

## 6. Release automation

- [x] 6.1 Configure GitHub Actions release workflow: versioning/tagging/changelog/GitHub-release via `@semantic-release/github` only (no registry-publish step — Go modules are consumed directly from tagged source), gated `on: push (main) / workflow_dispatch` only, `if: github.repository == 'Barayo/testpulse-go'`
- [x] 6.2 Write README (install via `go get`, the Go 1.25 floor stated prominently near the top, the `Case`/`Attach` API reference — including the explicit "subtests must call `Case` again with their own `t` before calling `Attach`, even if a parent test already declared a case key" gotcha with a worked `t.Run` example, not left implicit — the required `gotestsum --junitfile=...` workflow step, config-precedence table, exit-code table, dry-run, an explicit recommendation to use `TESTPULSE_TOKEN` over `--token` in CI so a real token doesn't end up in shell history/process listings) and CONTRIBUTING (unit + real end-to-end test setup, including the `gotestsum` dev-tool install step and running tests with `-race`)

## 7. TestPulse monorepo docs update

- [x] 7.1 Replace the bare "Go" stub (if one exists) in `docs/importing-results.md` with a "Go: `testpulse-go`" section (install, the Go 1.25 floor, `Case`/`Attach` usage, the required `gotestsum` step, build-outcome table), following the same pattern already used there for the pytest/Maven/Jest/Gradle plugin sections; update `docs/README.md`'s index line if it changes scope

<!-- No Sample-Project-showcase task: this is client-tooling published as its own Go module/repo, with no new API endpoint, UI, or seed-data surface inside TestPulse itself -- same as the other four plugin changes. -->
