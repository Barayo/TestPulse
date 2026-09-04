# gtest-import-plugin

## Purpose

The `testpulse-gtest` plugin's observable contract — the `Case`/`Attach`
API's role and identification mechanism (built on gtest's own native
`RecordProperty()` and `current_test_info()`), the `testpulse-gtest
submit` CLI's exit-code/config/dry-run behavior, and the property-name
contract it writes into JUnit XML. The plugin itself ships as its own
public repo (`Barayo/testpulse-gtest`); this spec describes what it must
do, not how it's implemented.

## Requirements

### Requirement: Case linkage via RecordProperty
The plugin SHALL provide `testpulse::Case(const std::string& caseKey,
Options... opts)`, callable from anywhere with no test handle required
(gtest's `::testing::Test::RecordProperty` is a `static` member
function). `Case` SHALL call `RecordProperty("testpulse_case_key",
caseKey)`, and additionally `RecordProperty("testpulse_platform",
...)`/`testpulse_version`/`testpulse_tags` only for whichever of
`testpulse::WithPlatform(string)`/`WithVersion(string)`/`WithTags(vector<string>)`
were supplied, matching the property names the `execution-import`
capability's importer already reads. The plugin SHALL NOT parse or
rewrite any JUnit XML report itself — it SHALL rely entirely on gtest's
own native `--gtest_output=xml` writer to produce the `<properties>`
entries.

#### Scenario: A tagged test's case key is recorded as a property
- **WHEN** a test calls `testpulse::Case("LOGIN-42")` and the binary is
  run with `--gtest_output=xml:report.xml`
- **THEN** the corresponding `<testcase>` in `report.xml` contains a
  `<property name="testpulse_case_key" value="LOGIN-42"/>` nested inside
  a `<properties>` element

#### Scenario: Optional metadata is recorded only when supplied
- **WHEN** a test calls `testpulse::Case("LOGIN-42",
  testpulse::WithPlatform("linux"), testpulse::WithTags({"smoke"}))` (no
  version option)
- **THEN** its `<testcase>` gains `testpulse_platform` and
  `testpulse_tags` properties, and no `testpulse_version` property

#### Scenario: An untagged test carries no TestPulse properties
- **WHEN** a test never calls `testpulse::Case`
- **THEN** its `<testcase>` entry carries no `testpulse_case_key`
  property in the generated report

### Requirement: Attachments require the currently-executing test's own declared case key
The plugin SHALL provide `testpulse::Attach(const std::string& caseKey,
const std::vector<uint8_t>& data, const std::string& filename, const
std::string& contentType)`, callable from within a running gtest test
body. It SHALL identify the currently-executing test via
`::testing::UnitTest::GetInstance()->current_test_info()`, and SHALL
reject (throw) an `Attach` call whose `caseKey` is not among that
specific test's own `Case`-declared case keys. A null `current_test_info()`
result (no active test — e.g. `Attach` called from global setup/teardown
outside any `TEST`/`TEST_F` body) SHALL throw a distinct error naming the
cause, never silently succeed and never surface as an unrelated
null-pointer dereference. Only `image/png`, `image/jpeg`, and
`image/webp` content types SHALL be accepted; any other content type
SHALL be rejected. Content type SHALL be validated before the case-key
allowlist check.

#### Scenario: An attachment matching the currently-executing test's own case key is accepted
- **WHEN** `testpulse::Attach("LOGIN-42", bytes, "failure.png",
  "image/png")` is called from within a test that earlier called
  `testpulse::Case("LOGIN-42")`
- **THEN** the attachment is registered

#### Scenario: An attachment under a case key belonging to a different test is rejected
- **WHEN** `testpulse::Attach("OTHER-1", ...)` is called from within a
  test whose own `Case` calls only declared case keys other than
  `OTHER-1`
- **THEN** the call throws, and no attachment is registered

#### Scenario: An unsupported content type is rejected
- **WHEN** `testpulse::Attach("LOGIN-42", bytes, "x.pdf",
  "application/pdf")` is called, even from a test that does declare
  `LOGIN-42`
- **THEN** the call throws and no attachment is registered

#### Scenario: Attach outside an active test throws a distinct error
- **WHEN** `testpulse::Attach("LOGIN-42", ...)` is called while
  `current_test_info()` returns null (no active test execution)
- **THEN** the call throws an error distinctly naming that cause, not a
  null-pointer dereference, and no attachment is registered

### Requirement: Multiple attachments under the same case key are all preserved
Since a single test may legitimately call `Attach` more than once within
itself (e.g. capturing two screenshots during one test), the
scratch-directory storage mechanism SHALL NOT deduplicate or overwrite
attachments sharing a case key — each call SHALL produce a distinct
stored attachment (derived from the case key plus a fresh identifier
generated inside that call, not the case key alone), and
`testpulse-gtest submit` SHALL include all of them (grouped under that
case key) in the submitted `attachments` array.

#### Scenario: Two attachments under the same case key both survive
- **WHEN** a single test calls `testpulse::Case("LOGIN-42")` once, then
  calls `testpulse::Attach("LOGIN-42", ...)` twice within its own test
  body, with different file contents each time
- **THEN** both attachments are present in the scratch directory
  afterward, and both are included in the `submit` request's
  `attachments` array

### Requirement: Submitted attachments are scoped to the report being submitted
Since `--dir`'s attachment search is directory-wide and not aware of
which report is currently being submitted, a stale
`.testpulse/attachments` entry left over from an unrelated earlier test
binary or run (a real occurrence in a shared CI workspace) SHALL NOT be
included in a submission for a report that never declared its case key.
`submit` SHALL only include, in the submitted `attachments` array, stored
attachments whose case key appears among the case keys the *current*
report itself declares (via its own `testpulse_case_key` properties).

#### Scenario: A stale attachment from an unrelated run is excluded
- **WHEN** `--dir` contains a stored attachment under case key `OTHER-99`
  left over from an earlier, unrelated test run, and the report currently
  being submitted contains no `testpulse_case_key` property with that
  value
- **THEN** the submitted `attachments` array does not include that stored
  attachment

### Requirement: Submission outcome maps to CLI exit behavior
`testpulse-gtest submit --file <path>` SHALL read the JUnit XML report
`--gtest_output=xml` produced, plus any registered attachments, `POST`
them to `POST /api/v1/projects/{projectKey}/imports` (per the
`execution-import` capability), and SHALL interpret the response as
follows: a `201` response SHALL exit `0` and print a summary of matched
count and created run; a `207` response SHALL, by default, exit `0`
while printing the unmatched case keys and a pointer to
`--fail-on-unmatched`, and SHALL instead exit non-zero when
`--fail-on-unmatched` is set; any other outcome (network failure,
authentication error, or a `4xx`/`5xx` response) SHALL unconditionally
exit non-zero, regardless of `--fail-on-unmatched`.

#### Scenario: All tests matched
- **WHEN** every tagged `<testcase>` in the submitted report matches an
  existing case and the API responds `201`
- **THEN** `submit` exits `0` and prints the matched count and created run

#### Scenario: Some tests unmatched, default configuration
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and `--fail-on-unmatched` is not set
- **THEN** `submit` exits `0` and prints each unmatched case key alongside
  a message naming `--fail-on-unmatched` as the escalation path

#### Scenario: Some tests unmatched, --fail-on-unmatched set
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and `--fail-on-unmatched` is set
- **THEN** `submit` exits non-zero, even if every individual test passed

#### Scenario: Submission error always exits non-zero
- **WHEN** the submission request fails outright (network error, `401`,
  `400`, or `5xx`), regardless of `--fail-on-unmatched`
- **THEN** `submit` exits non-zero

### Requirement: Dry run never submits and never affects exit code beyond its own fetch
When `--dry-run` is set, `submit` SHALL fetch existing case keys via a
read-only `GET /api/v1/projects/{projectKey}/cases` request, print a
match preview against the case keys found in the report, and SHALL NOT
call the import endpoint. The exit code SHALL reflect only whether the
preview fetch itself succeeded, not the preview's match/no-match content.

#### Scenario: Dry run previews matches without submitting
- **WHEN** `--dry-run` is set and the report contains both case keys that
  exist in the project and ones that don't
- **THEN** `submit` prints which case keys would match and which
  wouldn't, makes no request to the import endpoint, and exits `0`

### Requirement: Configuration resolves CLI flag, then environment variable
For `--url`, `--token`, `--project`, and `--fail-on-unmatched`,
`testpulse-gtest submit` SHALL resolve each value by checking, in order:
the corresponding CLI flag, then the corresponding environment variable
(`TESTPULSE_URL`, `TESTPULSE_TOKEN`, `TESTPULSE_PROJECT`,
`TESTPULSE_FAIL_ON_UNMATCHED`), using the first one present. There is no
third, config-file-backed resolution tier. The resolved token SHALL NOT
be printed at any verbosity level.

#### Scenario: Flag overrides environment variable
- **WHEN** `TESTPULSE_URL=https://a.example` is set in the environment and
  `submit` is run with `--url=https://b.example`
- **THEN** the plugin submits to `https://b.example`

#### Scenario: Environment variable is used when no flag is set
- **WHEN** `TESTPULSE_TOKEN=t0k3n` is set in the environment and `submit`
  is run without `--token`
- **THEN** the plugin authenticates using `t0k3n`

### Requirement: The plugin requires C++17 and CMake 3.16 or later
The plugin's `CMakeLists.txt` SHALL declare a minimum CMake version of
3.16 and require C++17, matching gtest 1.18.x's own current floor. The
plugin SHALL NOT provide any alternative tagging mechanism for earlier
C++ standards.

#### Scenario: The build declares the version floor
- **WHEN** the plugin's `CMakeLists.txt` is inspected
- **THEN** it declares `cmake_minimum_required(VERSION 3.16)` and
  requires C++17 or later, with no conditional fallback for earlier
  standards
