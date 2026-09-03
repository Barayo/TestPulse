## ADDED Requirements

### Requirement: Case linkage via t.Attr
The plugin SHALL provide `testpulse.Case(t *testing.T, caseKey string,
opts ...Option)`, where `Option` values are `WithPlatform(string)`,
`WithVersion(string)`, and `WithTags(...string)`. `Case` SHALL call Go's
native `t.Attr("testpulse_case_key", caseKey)`, and additionally
`t.Attr("testpulse_platform", ...)`/`testpulse_version`/`testpulse_tags`
only for whichever options were supplied, matching the property names the
`execution-import` capability's importer already reads. The plugin SHALL
NOT parse or rewrite any JUnit XML report itself — it SHALL rely entirely
on `gotestsum` (v1.13.0 or later) to convert `t.Attr` calls into
`<properties>` entries.

#### Scenario: A tagged test's case key is recorded as a property
- **WHEN** a test calls `testpulse.Case(t, "LOGIN-42")` and the suite is
  run via `gotestsum --junitfile=report.xml -- ./...`
- **THEN** the corresponding `<testcase>` in `report.xml` contains a
  `<property name="testpulse_case_key" value="LOGIN-42"/>`

#### Scenario: Optional metadata is recorded only when supplied
- **WHEN** a test calls `testpulse.Case(t, "LOGIN-42",
  testpulse.WithPlatform("linux"), testpulse.WithTags("smoke"))` (no
  version option)
- **THEN** its `<testcase>` gains `testpulse_platform` and
  `testpulse_tags` properties, and no `testpulse_version` property

#### Scenario: An untagged test carries no TestPulse properties
- **WHEN** a test never calls `testpulse.Case`
- **THEN** its `<testcase>` entry carries no `testpulse_case_key`
  property in the `gotestsum`-produced report

### Requirement: Attachments require the same test's own declared case key
The plugin SHALL provide `testpulse.Attach(t *testing.T, caseKey string,
data []byte, filename, contentType string) error`, callable from within a
running test body. It SHALL track, per test name (`t.Name()`), the set of
case keys declared via `Case` calls for that exact test — a subtest
created via `t.Run` has its own distinct `t.Name()` (e.g.
`"Parent/sub"`), which is NOT considered to share its parent's declared
case keys; a subtest that wants to call `Attach` SHALL first call `Case`
itself, with its own `*testing.T`. The plugin SHALL reject (returning a
non-nil error) an `Attach` call whose `caseKey` is not in the current
test's own declared set. This tracking SHALL be safe for concurrent use
from `t.Parallel()` tests running on separate goroutines. Only
`image/png`, `image/jpeg`, and `image/webp` content types SHALL be
accepted; any other content type SHALL be rejected. Content type SHALL be
validated before the case-key allowlist check.

#### Scenario: An attachment matching the same test's own case key is accepted
- **WHEN** `testpulse.Case(t, "LOGIN-42")` was called earlier in the same
  test, and the test then calls `testpulse.Attach(t, "LOGIN-42", bytes,
  "failure.png", "image/png")`
- **THEN** the attachment is registered

#### Scenario: An attachment under a case key belonging to a different test is rejected
- **WHEN** `testpulse.Attach(t, "OTHER-1", bytes, "failure.png",
  "image/png")` is called from a test whose own `Case` calls only
  declared case keys other than `OTHER-1`
- **THEN** `Attach` returns an error and no attachment is registered

#### Scenario: A subtest that hasn't re-declared its own case key is rejected
- **WHEN** a parent test calls `testpulse.Case(t, "LOGIN-42")`, then
  starts a subtest via `t.Run("sub", func(t *testing.T) {...})` whose
  body calls `testpulse.Attach(t, "LOGIN-42", bytes, "failure.png",
  "image/png")` without first calling `testpulse.Case` on the subtest's
  own `t`
- **THEN** `Attach` returns an error and no attachment is registered,
  since the subtest's own `t.Name()` (e.g. `"Parent/sub"`) has no
  declared case keys of its own

#### Scenario: An unsupported content type is rejected
- **WHEN** `testpulse.Attach(t, "LOGIN-42", bytes, "x.pdf",
  "application/pdf")` is called, even for a case key the test did declare
- **THEN** `Attach` returns an error and no attachment is registered

#### Scenario: Concurrent Case/Attach calls from parallel subtests do not corrupt shared state
- **WHEN** multiple `t.Parallel()` subtests concurrently call
  `testpulse.Case` and `testpulse.Attach` (each declaring and using its
  own case key) on separate goroutines
- **THEN** none of the calls crash the test process, and each subtest's
  attachment is correctly attributed only to its own declared case key

### Requirement: Multiple attachments under the same case key are all preserved
Since table-driven subtests (`t.Run`) may legitimately call `Attach`
multiple times under the same case key, and Go tests may run in parallel
(`t.Parallel()`), the scratch-directory storage mechanism SHALL NOT
deduplicate or overwrite attachments sharing a case key — each call SHALL
produce a distinct stored attachment (derived from the case key plus a
fresh UUID generated inside that call, not the case key alone), and
`testpulse-go submit` SHALL include all of them (grouped under that case
key) in the submitted `attachments` array.

#### Scenario: Two attachments under the same case key both survive
- **WHEN** a test calls `testpulse.Case(t, "LOGIN-42")` once, then calls
  `testpulse.Attach(t, "LOGIN-42", ...)` twice within the same test body,
  with different file contents each time
- **THEN** both attachments are present in the scratch directory
  afterward, and both are included in the `submit` request's
  `attachments` array

### Requirement: Submission outcome maps to CLI exit behavior
`testpulse-go submit --file <path>` SHALL read the `gotestsum`-produced
JUnit XML report plus any registered attachments, `POST` them to `POST
/api/v1/projects/{projectKey}/imports` (per the `execution-import`
capability), and SHALL interpret the response as follows: a `201`
response SHALL exit `0` and print a summary of matched count and created
run; a `207` response SHALL, by default, exit `0` while printing the
unmatched case keys and a pointer to `--fail-on-unmatched`, and SHALL
instead exit non-zero when `--fail-on-unmatched` is set; any other
outcome (network failure, authentication error, or a `4xx`/`5xx`
response) SHALL unconditionally exit non-zero, regardless of
`--fail-on-unmatched`.

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
read-only `GET /api/v1/projects/{projectKey}/cases` request, print a match
preview against the case keys found in the report, and SHALL NOT call the
import endpoint. The exit code SHALL reflect only whether the preview
fetch itself succeeded, not the preview's match/no-match content.

#### Scenario: Dry run previews matches without submitting
- **WHEN** `--dry-run` is set and the report contains both case keys that
  exist in the project and ones that don't
- **THEN** `submit` prints which case keys would match and which
  wouldn't, makes no request to the import endpoint, and exits `0`

### Requirement: Configuration resolves CLI flag, then environment variable
For `--url`, `--token`, `--project`, and `--fail-on-unmatched`,
`testpulse-go submit` SHALL resolve each value by checking, in order: the
corresponding CLI flag, then the corresponding environment variable
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

### Requirement: The plugin requires Go 1.25 or later
The plugin's Go module SHALL declare `go 1.25` (or later) in `go.mod`,
reflecting its hard dependency on the `t.Attr` method. The plugin SHALL
NOT provide any alternative tagging mechanism for earlier Go versions.

#### Scenario: The module declares the version floor
- **WHEN** the module's `go.mod` is inspected
- **THEN** it declares `go 1.25` or later, with no conditional
  build-tag-gated fallback for earlier versions
