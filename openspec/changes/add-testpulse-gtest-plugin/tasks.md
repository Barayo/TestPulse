## 1. Repo scaffolding and the critical RecordProperty repro

- [x] 1.1 Create the public repo `Barayo/testpulse-gtest` (MIT license, `CMakeLists.txt` declaring `cmake_minimum_required(VERSION 3.16)` and C++17, `FetchContent`-fetching gtest itself for the plugin's own test suite — pinned to `v1.18.0` via `GIT_TAG`, never `main`, per design.md's Repo & packaging decision)
- [x] 1.2 **Before any other implementation work**: build a minimal isolated repro proving gtest's real `RecordProperty()` output shape. Confirmed against real gtest v1.18.0: `RecordProperty("probe_key", "probe_value")` + `--gtest_output=xml` produces exactly `<properties><property name="probe_key" value="probe_value"/></properties>` nested under `<testcase>` — matches design.md's Context exactly, not the stale attribute-based example gtest's own advanced.md shows
- [ ] 1.3 Add GitHub Actions workflow: `cmake --build` + `ctest` on both Linux and macOS, on every PR

## 2. Case tagging via RecordProperty (test-first)

- [x] 2.1 Write a failing unit test (a real gtest test, dogfooding): `testpulse::Case("LOGIN-42")` called from within a `TEST` body results in the property being recorded — asserted via `TestResult::GetTestProperty`/`test_property_count()` on `current_test_info()->result()`, a simpler in-process seam than the originally-sketched `TearDown`-based approach, verifiable without a full XML round-trip (`tests/case_test.cc`)
- [x] 2.2 Implement `testpulse::Case(const std::string& caseKey, Options... opts)` calling `::testing::Test::RecordProperty("testpulse_case_key", caseKey)` until 2.1 passes
- [x] 2.3 Write failing unit tests for `WithPlatform`/`WithVersion`/`WithTags`: each option present emits its corresponding `RecordProperty` call, options not passed emit none; implemented via a C++17 fold expression over a variadic `Options...` pack, each option a small struct with an `Apply(CaseOptions&)` method
- [x] 2.4 Write a failing real end-to-end test: a fixture binary (`tests/fixtures/tagged_fixture.cc`, linked directly against the `testpulse::testpulse` target within this repo's own CMake build — see 6.2's CONTRIBUTING note on why a separate cross-repo `FetchContent` fixture wasn't needed here, unlike testpulse-dotnet's NuGet-packaging concern) with one test calling `testpulse::Case("LOGIN-42")`, run with `--gtest_output=xml:report.xml` as a real subprocess, assert the real generated report actually contains `<properties><property name="testpulse_case_key" value="LOGIN-42"/>` (`tests/e2e_test.cc`'s `E2ETaggedFixture` suite) — formalizes 1.2's proven repro as a permanent regression test
- [x] 2.5 Write a failing real end-to-end test: the same `tagged_fixture` binary's second test (`UntaggedTest`) never calls `testpulse::Case`; the same `E2ETaggedFixture` test asserts its `<testcase>` carries no `testpulse_case_key` property

## 3. Attachments: current-test allowlist and invocation-unique storage (test-first)

- [x] 3.1 Write a failing unit test: `Case("LOGIN-42")` followed by `Attach("LOGIN-42", bytes, "failure.png", "image/png")` in the same test succeeds and writes a sidecar (data file + metadata) into the `.testpulse/` scratch directory; implemented the internal allowlist map (keyed by `current_test_info()`'s `test_suite_name()`+`name()`, populated by `Case`, guarded by a mutex — see design.md's concurrency scoping note) and `Attach`'s lookup against it (`tests/attach_test.cc`)
- [x] 3.2 Write a failing unit test: `Attach("OTHER-1", ...)` for a case key the current test's own `Case` calls never declared throws, and writes nothing; implemented the rejection
- [x] 3.3 Write a failing unit test: content-type validation (`image/png`/`image/jpeg`/`image/webp` only) runs and rejects before the allowlist check would otherwise accept a call; implemented the ordering (content-type check first)
- [x] 3.4 Write a failing unit test: `Attach` called with `current_test_info()` returning null throws a distinct, clearly-worded error rather than dereferencing a null pointer — exercised via a real `::testing::Environment::SetUp()` hook (which genuinely runs before any `TEST`, when `current_test_info()` is null), not a simulated call, since the null path can't be reached from inside a running `TEST` body itself
- [x] 3.5 Write a failing unit test: two `Attach` calls under the same case key within one test both produce distinct sidecar files, neither overwriting the other; implemented invocation-unique filenames (`std::hash` of the case key plus an atomically-incrementing counter, not the case key alone)
- [x] 3.6 Write a failing real end-to-end test: `tests/fixtures/cross_test_fixture.cc` has one test declare `LOGIN-42` and a second test attempt `Attach("LOGIN-42", ...)` — a real cross-test rejection, run as a real subprocess and asserted via `E2ECrossTestFixture` in `tests/e2e_test.cc`
- [x] 3.7 Write a failing real end-to-end test: `tests/fixtures/multi_attach_fixture.cc` calls `Case`/`Attach` twice under the same case key; `E2EMultiAttachFixture` in `tests/e2e_test.cc` asserts both attachment `.data` files are present in the scratch directory afterward

## 4. Config resolution (test-first)

- [x] 4.1 Write failing unit tests for `--url`/`--project`/`--fail-on-unmatched`: flag-alone, env-var-alone, flag-overrides-env-var (`cli/tests/config_test.cc`)
- [x] 4.2 Write failing unit tests for `--token`: env-var-alone, flag-overrides-env-var
- [x] 4.3 Write a failing unit test asserting the resolved token is never present in any printed output at any verbosity level, across a successful and a failed submission (`ConfigTest.RedactedNeverContainsTheRawToken`, `SubmitTest.TokenNeverAppearsInOutput`); `Config` is never printed directly and no submit code path references the raw token in output
- [x] 4.4 Implement the flag definitions (`CliFlags`) and the shared resolver (`ResolveConfig`: flag > env var, two tiers only, throwing `std::invalid_argument` naming the missing setting) until 4.1–4.3 pass (`cli/src/config.cc`)

## 5. Submission, dry run, and exit-code behavior (test-first)

- [x] 5.1 Write a failing unit test: mock a `201` response, assert `submit` exits `0` and prints the matched-count summary (`SubmitTest.AllMatchedExitsZero`)
- [x] 5.2 Write a failing unit test: mock a `207` response, default flags, assert `submit` exits `0` and prints unmatched case keys plus the `--fail-on-unmatched` pointer (`SubmitTest.UnmatchedDefaultConfigExitsZero`)
- [x] 5.3 Write a failing unit test: mock a `207` response with `--fail-on-unmatched` set, assert `submit` exits non-zero (`SubmitTest.UnmatchedWithFailOnUnmatchedExitsNonZero`)
- [x] 5.4 Write a failing unit test: mock a network error and separately a `5xx` response, assert `submit` always exits non-zero regardless of `--fail-on-unmatched` (`SubmitTest.NetworkErrorExitsNonZeroRegardlessOfFailOnUnmatched`, `SubmitTest.ServerErrorExitsNonZero`)
- [x] 5.5 Write a failing unit test: with `--dry-run` set (mock a `GET /cases` response), assert a match preview is printed, no request is made to the import endpoint, and `submit` exits `0` regardless of the preview's match/no-match content (`SubmitTest.DryRunPreviewsWithoutSubmitting`, plus `DryRunFetchFailureExitsNonZero` for the fetch-itself-failed case)
- [x] 5.6 Implement `RunSubmit` (reading the JUnit XML file plus grouped attachments via `ReadAttachments`, POSTing to `/api/v1/projects/{projectKey}/imports`, branching on response per the table in design.md, honoring `--dry-run`, `--dir` default `.` searched recursively for `.testpulse/attachments`) until 5.1–5.5 pass (`cli/src/submit.cc`); attachment data is base64-encoded via a small dependency-free encoder, request/response bodies built and parsed via `nlohmann::json` (FetchContent-pinned to `v3.11.3`), HTTP via a real `CurlHttpClient` behind an `HttpClient` interface unit tests substitute with a fake
- [x] 5.7 Write a failing real end-to-end test: a real HTTP stub server (`cli/tests/stub_server.hpp`, a minimal real POSIX-socket HTTP/1.1 server, not a mock) plus a real subprocess invocation of the actual compiled `testpulse-gtest` binary — proves the full real pipeline (`RealSubmissionAgainstAStubServerSucceeds`, `RealDryRunAgainstAStubServerPreviewsWithoutSubmitting` in `cli/tests/submit_e2e_test.cc`), not just each piece in isolation

## 6. Release automation

- [ ] 6.1 Configure GitHub Actions release workflow: versioning/tagging/changelog/GitHub-release via semantic-release (Angular commit convention, `.releaserc.json` excluding `@semantic-release/npm` — this is not an npm package, matching the fix already needed for testpulse-go/testpulse-dotnet), building and attaching prebuilt `testpulse-gtest` CLI binaries (Linux/macOS/Windows) as release assets, gated `on: push (main) / workflow_dispatch` only, `if: github.repository == 'Barayo/testpulse-gtest'`
- [ ] 6.2 Write README (install via `FetchContent_Declare` pointing at a tagged release — the example snippet MUST use a pinned `GIT_TAG v<version>`, never `GIT_TAG main`, per design.md's Repo & packaging decision — the C++17/CMake 3.16 floor stated prominently near the top, the `Case`/`Attach` API reference, the required `--gtest_output=xml` + `testpulse-gtest submit` workflow steps, config-precedence table, exit-code table, dry-run, an explicit recommendation to use `TESTPULSE_TOKEN` over `--token` in CI) and CONTRIBUTING (unit + real end-to-end test setup, how to test the `FetchContent` consumption path for real rather than an `add_subdirectory` shortcut that wouldn't catch packaging issues)

## 7. TestPulse monorepo docs update

- [ ] 7.1 Add a "Google Test (gtest): `testpulse-gtest`" section to `docs/importing-results.md` (install via `FetchContent`, the C++17/CMake floor, `Case`/`Attach` usage, the required `--gtest_output=xml` + `submit` steps, build-outcome table), following the same pattern already used there for the pytest/Maven/Jest/Gradle/Go/.NET plugin sections; update `docs/README.md`'s index line

<!-- No Sample-Project-showcase task: this is client-tooling published as its own repo, with no new API endpoint, UI, or seed-data surface inside TestPulse itself -- same as every prior plugin change. -->
