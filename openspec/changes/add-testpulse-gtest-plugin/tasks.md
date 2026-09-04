## 1. Repo scaffolding and the critical RecordProperty repro

- [ ] 1.1 Create the public repo `Barayo/testpulse-gtest` (MIT license, `CMakeLists.txt` declaring `cmake_minimum_required(VERSION 3.16)` and C++17, `FetchContent`-fetching gtest itself for the plugin's own test suite)
- [ ] 1.2 **Before any other implementation work**: build a minimal isolated repro proving gtest's real `RecordProperty()` output shape. A tiny fixture binary with one `TEST` calling `RecordProperty("probe_key", "probe_value")`, run with `--gtest_output=xml:probe.xml`, and inspect the raw XML file directly — confirm it contains `<properties><property name="probe_key" value="probe_value"/></properties>` nested under the corresponding `<testcase>` (the shape design.md's Context documents from gtest's own fixture source and the upstream docs-bug issue, NOT the stale attribute-based example gtest's own advanced.md shows) rather than assuming research alone is sufficient
- [ ] 1.3 Add GitHub Actions workflow: `cmake --build` + `ctest` on both Linux and macOS, on every PR

## 2. Case tagging via RecordProperty (test-first)

- [ ] 2.1 Write a failing unit test (a real gtest test, dogfooding): `testpulse::Case("LOGIN-42")` called from within a `TEST` body results in `RecordProperty` having been called with `("testpulse_case_key", "LOGIN-42")` — assert via a thin seam allowing the RecordProperty call to be intercepted/verified in-process (e.g. a fixture `TEST_F` whose `TearDown` inspects `current_test_info()`'s recorded properties, if gtest exposes them post-hoc, or by capturing the call through a small internal indirection layer testable without a full XML round-trip)
- [ ] 2.2 Implement `testpulse::Case(const std::string& caseKey, Options... opts)` calling `::testing::Test::RecordProperty("testpulse_case_key", caseKey)` until 2.1 passes
- [ ] 2.3 Write failing unit tests for `WithPlatform`/`WithVersion`/`WithTags`: each option present emits its corresponding `RecordProperty` call, options not passed emit none; implement the `Options`/`WithPlatform`/`WithVersion`/`WithTags` variadic mechanism until green
- [ ] 2.4 Write a failing real end-to-end test: a fixture binary (built via `FetchContent`-consuming the library the way a real consumer would, not a `add_subdirectory` shortcut) with one test calling `testpulse::Case("LOGIN-42")`, run with `--gtest_output=xml:report.xml`, assert the real generated report actually contains `<properties><property name="testpulse_case_key" value="LOGIN-42"/>` — this is the test that actually proves the real mechanism end-to-end (formalizing 1.2's proven repro as a permanent regression test), not just that `Case` calls `RecordProperty` correctly in isolation
- [ ] 2.5 Write a failing real end-to-end test: a fixture binary with one test that never calls `testpulse::Case`, run with `--gtest_output=xml`, assert its `<testcase>` carries no `testpulse_case_key` property

## 3. Attachments: current-test allowlist and invocation-unique storage (test-first)

- [ ] 3.1 Write a failing unit test: `Case("LOGIN-42")` followed by `Attach("LOGIN-42", bytes, "failure.png", "image/png")` in the same test succeeds and writes a sidecar (data file + metadata) into the `.testpulse/` scratch directory; implement the internal allowlist map (keyed by `current_test_info()`'s `test_suite_name()`+`name()`, populated by `Case`, guarded by a mutex — see design.md's concurrency scoping note) and `Attach`'s lookup against it until green
- [ ] 3.2 Write a failing unit test: `Attach("OTHER-1", bytes, "failure.png", "image/png")` for a case key the current test's own `Case` calls never declared throws, and writes nothing; implement the rejection until green
- [ ] 3.3 Write a failing unit test: content-type validation (`image/png`/`image/jpeg`/`image/webp` only) runs and rejects before the allowlist check would otherwise accept a call; implement the ordering until green
- [ ] 3.4 Write a failing unit test: `Attach` called with `current_test_info()` returning null (e.g. invoked from a global function outside any `TEST`/`TEST_F` body) throws a distinct, clearly-worded error rather than dereferencing a null pointer; implement the explicit null check until green
- [ ] 3.5 Write a failing unit test: two `Attach` calls under the same case key within one test both produce distinct sidecar files, neither overwriting the other; implement invocation-unique filenames (hash of the case key plus a freshly-generated identifier) until green
- [ ] 3.6 Write a failing real end-to-end test: a fixture binary with a test that calls `Attach` under a case key belonging to a *different* test in the same binary, run via the compiled fixture directly, assert the call throws with the allowlist rejection message — proving the check works against real gtest execution and `current_test_info()`, not just an isolated in-process assertion
- [ ] 3.7 Write a failing real end-to-end test: a fixture binary with a test that calls `Case`/`Attach` multiple times under the same case key within itself, run via the compiled fixture, assert all attachments are present in the scratch directory afterward (not just the last one)

## 4. Config resolution (test-first)

- [ ] 4.1 Write failing unit tests for `--url`/`--project`/`--fail-on-unmatched`: flag-alone, env-var-alone, flag-overrides-env-var
- [ ] 4.2 Write failing unit tests for `--token`: env-var-alone, flag-overrides-env-var
- [ ] 4.3 Write a failing unit test asserting the resolved token is never present in any printed output at any verbosity level, across a successful and a failed submission; implement/confirm the resolver and print statements never reference the raw token value until green
- [ ] 4.4 Implement the flag definitions and the shared resolver (flag > env var, two tiers only) until 4.1–4.3 pass

## 5. Submission, dry run, and exit-code behavior (test-first)

- [ ] 5.1 Write a failing unit test: mock a `201` response, assert `submit` exits `0` and prints the matched-count summary
- [ ] 5.2 Write a failing unit test: mock a `207` response, default flags, assert `submit` exits `0` and prints unmatched case keys plus the `--fail-on-unmatched` pointer
- [ ] 5.3 Write a failing unit test: mock a `207` response with `--fail-on-unmatched` set, assert `submit` exits non-zero
- [ ] 5.4 Write a failing unit test: mock a network error and separately a `401`/`400`/`5xx` response, assert `submit` always exits non-zero regardless of `--fail-on-unmatched`
- [ ] 5.5 Write a failing unit test: with `--dry-run` set (mock a `GET /cases` response), assert a match preview is printed, no request is made to the import endpoint, and `submit` exits `0` regardless of the preview's match/no-match content
- [ ] 5.6 Implement the `submit` command (reading the JUnit XML file plus grouped attachments, POSTing to `/api/v1/projects/{projectKey}/imports`, branching on response per the table in design.md, honoring `--dry-run`, `--dir` default `.` searched recursively for `.testpulse/attachments`) until 5.1–5.5 pass
- [ ] 5.7 Write a failing real end-to-end test: a fixture binary with a `testpulse::Case`-tagged test, run the full real pipeline (compiled fixture → `--gtest_output=xml` → `testpulse-gtest submit --file ... --dry-run`) against a stubbed HTTP import endpoint, assert the whole chain works together, not just each piece in isolation

## 6. Release automation

- [ ] 6.1 Configure GitHub Actions release workflow: versioning/tagging/changelog/GitHub-release via semantic-release (Angular commit convention, `.releaserc.json` excluding `@semantic-release/npm` — this is not an npm package, matching the fix already needed for testpulse-go/testpulse-dotnet), building and attaching prebuilt `testpulse-gtest` CLI binaries (Linux/macOS/Windows) as release assets, gated `on: push (main) / workflow_dispatch` only, `if: github.repository == 'Barayo/testpulse-gtest'`
- [ ] 6.2 Write README (install via `FetchContent_Declare` pointing at a tagged release, the C++17/CMake 3.16 floor stated prominently near the top, the `Case`/`Attach` API reference, the required `--gtest_output=xml` + `testpulse-gtest submit` workflow steps, config-precedence table, exit-code table, dry-run, an explicit recommendation to use `TESTPULSE_TOKEN` over `--token` in CI) and CONTRIBUTING (unit + real end-to-end test setup, how to test the `FetchContent` consumption path for real rather than an `add_subdirectory` shortcut that wouldn't catch packaging issues)

## 7. TestPulse monorepo docs update

- [ ] 7.1 Add a "Google Test (gtest): `testpulse-gtest`" section to `docs/importing-results.md` (install via `FetchContent`, the C++17/CMake floor, `Case`/`Attach` usage, the required `--gtest_output=xml` + `submit` steps, build-outcome table), following the same pattern already used there for the pytest/Maven/Jest/Gradle/Go/.NET plugin sections; update `docs/README.md`'s index line

<!-- No Sample-Project-showcase task: this is client-tooling published as its own repo, with no new API endpoint, UI, or seed-data surface inside TestPulse itself -- same as every prior plugin change. -->
