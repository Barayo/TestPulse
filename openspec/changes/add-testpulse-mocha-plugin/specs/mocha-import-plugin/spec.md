## ADDED Requirements

### Requirement: Case linkage requires an explicit test-context handle
The plugin SHALL provide `testpulse.Case(context, caseKey, opts?)`,
callable from within a running Mocha test or hook body, where `context`
is the Mocha `Context` available as `this` (requiring a non-arrow
function body). `Case` SHALL record `caseKey` as a `testpulse_case_key`
property against `context.test`/`context.currentTest`, and additionally
record `testpulse_platform`/`testpulse_version`/`testpulse_tags` only
for whichever of `opts.platform`/`opts.version`/`opts.tags` were
supplied, matching the property names the `execution-import`
capability's importer already reads. The plugin SHALL NOT provide any
implicit-global tagging mechanism — Mocha has no equivalent to
`expect.getState()` or `jasmine.getEnv()` accessible from arbitrary code
outside `this`.

#### Scenario: A tagged test's case key is recorded as a property
- **WHEN** a test calls `testpulse.Case(this, 'LOGIN-42')`
- **THEN** the corresponding `<testcase>` in the generated report
  contains a `<property name="testpulse_case_key" value="LOGIN-42"/>`

#### Scenario: Optional metadata is recorded only when supplied
- **WHEN** a test calls `testpulse.Case(this, 'LOGIN-42', { platform:
  'linux', tags: ['smoke'] })` (no version)
- **THEN** its `<testcase>` gains `testpulse_platform` and
  `testpulse_tags` properties, and no `testpulse_version` property

#### Scenario: An untagged test carries no TestPulse properties
- **WHEN** a test never calls `testpulse.Case`
- **THEN** its `<testcase>` entry carries no `testpulse_case_key`
  property in the generated report

### Requirement: Attachments require the currently-executing test's own declared case key
The plugin SHALL provide `testpulse.Attach(context, caseKey, data,
filename, contentType)`, callable from within a running Mocha test body
(same `context`-as-`this` requirement as `Case`). It SHALL verify the
caller's `caseKey` against whatever `testpulse.Case` already recorded
against `context.test`/`context.currentTest`, and SHALL reject (throw)
a mismatch or an absence of any prior `Case` call. Only `image/png`,
`image/jpeg`, and `image/webp` content types SHALL be accepted; any
other content type SHALL be rejected. Content type SHALL be validated
before the case-key check.

#### Scenario: An attachment matching the currently-executing test's own case key is accepted
- **WHEN** `testpulse.Attach(this, 'LOGIN-42', bytes, 'failure.png',
  'image/png')` is called from within a test that earlier called
  `testpulse.Case(this, 'LOGIN-42')`
- **THEN** the attachment is registered

#### Scenario: An attachment under a case key belonging to a different test is rejected
- **WHEN** `testpulse.Attach(this, 'OTHER-1', ...)` is called from
  within a test whose own `Case` call declared a different case key
- **THEN** the call throws, and no attachment is registered

#### Scenario: An unsupported content type is rejected
- **WHEN** `testpulse.Attach(this, 'LOGIN-42', bytes, 'x.pdf',
  'application/pdf')` is called, even from a test that does declare
  `LOGIN-42`
- **THEN** the call throws and no attachment is registered

### Requirement: Multiple attachments under the same case key are all preserved, with no user-controlled data used as a path component
Since a single test may legitimately call `Attach` more than once
within itself (e.g. capturing two screenshots during one test), the
scratch-directory storage mechanism SHALL NOT deduplicate or overwrite
attachments sharing a case key — each call SHALL produce a distinct
stored attachment. The on-disk filename SHALL be a hash (or equivalent
opaque identifier) computed from the case key plus a fresh
per-call-generated identifier, and SHALL NOT itself contain or be
derived in a path-traversable way from the caller-supplied `caseKey` or
`filename` — both SHALL be stored only as JSON *content* inside the
sidecar metadata file, never as or within a filesystem path segment,
since both are caller-controlled strings. The submit step SHALL include
all stored attachments (grouped under that case key) in the submitted
`attachments` array.

#### Scenario: Two attachments under the same case key both survive
- **WHEN** a single test calls `testpulse.Case(this, 'LOGIN-42')` once,
  then calls `testpulse.Attach(this, 'LOGIN-42', ...)` twice within its
  own body, with different file contents each time
- **THEN** both attachments are present in the scratch directory
  afterward, and both are included in the submit request's `attachments`
  array

### Requirement: Attachment storage is scoped to the current run and pruned after a successful submission
The scratch-directory read used to build the submit request's
`attachments` array SHALL read only from the plugin's own
`.testpulse/attachments` directory (never a broader or basename-matched
search), and SHALL re-validate each stored attachment's content type
against the same allowlist `Attach` enforces on write, discarding any
that fail. After a submission the API accepts (`201` or `207`), the
plugin SHALL prune `.testpulse/attachments` so a later run on the same
(non-ephemeral) workspace does not resubmit a stale attachment
alongside a fresh one under the same case key. Attachments SHALL remain
in place after a failed submission, so a retry still has them.

#### Scenario: An unrelated directory elsewhere in the tree is never treated as a source of attachments
- **WHEN** a directory named `attachments` exists somewhere in the
  project tree other than `.testpulse/attachments`
- **THEN** its contents are never included in a submission

#### Scenario: A stale attachment does not survive a successful submission
- **WHEN** an attachment was written during a run that ends in a `201`
  or `207` submission
- **THEN** it is removed from `.testpulse/attachments` afterward and is
  not resubmitted on a subsequent run

#### Scenario: An attachment survives a failed submission, for a retry
- **WHEN** a run's submission fails (network error, `4xx`, or `5xx`)
- **THEN** any attachments written during that run remain in
  `.testpulse/attachments` afterward

### Requirement: The reporter auto-annotates and auto-submits, independent of Mocha's own exit code
The plugin SHALL provide a `TestPulseReporter` class, registered via
Mocha's own `reporter`/`reporterOptions` configuration (e.g.
`.mocharc.js`'s `reporter`/`reporter-option` fields), consuming Mocha's
`Runner` event interface. It SHALL build a JUnit XML report directly
from test results and their recorded properties, without depending on
`mocha-junit-reporter` or any other third-party JUnit XML writer, since
`mocha-junit-reporter` supports only testsuite-level custom properties
with no per-testcase mechanism. In its `EVENT_RUN_END` handler, the
reporter SHALL submit the report (or preview it, in dry-run mode) and
SHALL write a `.testpulse/result.json` marker recording whether the
outcome should fail the build, since Mocha's own CLI determines its
process exit code independent of anything a reporter sets on
`process.exitCode`.

#### Scenario: A genuinely failing test still triggers annotate and submit
- **WHEN** a test carrying `testpulse.Case(this, 'LOGIN-42')` genuinely
  fails
- **THEN** Mocha reports the test failure, AND the reporter's
  `EVENT_RUN_END` handler still runs and still submits the (failed)
  result

### Requirement: All text and attribute content written into the generated report is XML-escaped
Since the reporter builds JUnit XML directly rather than delegating to a
third-party writer, it SHALL escape every value it writes into an
element's text content or attribute value — test titles, classnames,
failure messages and stack traces, and every `Case`/`Attach`-supplied
value (`caseKey`, `platform`, `version`, each tag) — before writing it,
using standard XML entity escaping (`&amp;`, `&lt;`, `&gt;`, `"`, `'`).
None of these values SHALL be trusted as already-safe, since test
titles and failure messages routinely embed data from the code under
test, not just literal strings the test author wrote.

#### Scenario: A failure message containing XML metacharacters cannot inject a forged property
- **WHEN** a test fails with a message containing `</failure>`,
  `<property name="testpulse_case_key" value="OTHER-1"/>`, or a `]]>`
  sequence
- **THEN** the generated report contains that text escaped as literal
  content inside the `<failure>` element, and no additional
  `<property>` or sibling element is introduced by it

#### Scenario: A case key or tag containing XML metacharacters round-trips as literal text
- **WHEN** `testpulse.Case(this, caseKey, opts)` is called with a
  `caseKey` or a tag in `opts.tags` containing `&`, `<`, `>`, or a quote
  character
- **THEN** the generated report's corresponding `<property>` value
  attribute contains that value correctly escaped, not raw

### Requirement: The check CLI is the only mechanism that fails the build
The plugin SHALL provide a `testpulse-mocha check` command that reads
`.testpulse/result.json` and exits non-zero if it indicates failure
(including a specific `reason` in its output when the marker carries
one, e.g. for a missing-configuration skip), or exits non-zero with a
message naming the likely cause if the marker file is absent entirely
(the reporter never ran). Otherwise it SHALL exit `0`. A `reason` value
SHALL name only which configuration variable is missing, and SHALL NOT
include the resolved value of any other configuration setting (e.g. the
resolved `url`), since some settings can carry embedded credentials in
unusual configurations.

#### Scenario: A failed submission fails the build via check
- **WHEN** `.testpulse/result.json` contains `{"failed": true}`
- **THEN** `testpulse-mocha check` exits non-zero

#### Scenario: A missing result marker fails the build with a named cause
- **WHEN** `.testpulse/result.json` does not exist
- **THEN** `testpulse-mocha check` exits non-zero with a message naming
  a likely misconfiguration cause, not a raw file-not-found error

#### Scenario: A missing-configuration skip is distinguishable from a missing marker
- **WHEN** the reporter ran but required configuration
  (`TESTPULSE_URL`/`TESTPULSE_TOKEN`/`TESTPULSE_PROJECT`) was absent
- **THEN** the marker records `{"failed": true, "reason": "..."}`
  naming the missing configuration, and `check` prints that reason
  rather than the generic "marker file is absent" message

### Requirement: Submission outcome maps to the result marker's failed field
The reporter's submit step SHALL `POST` the annotated report (plus any
registered attachments) to `POST /api/v1/projects/{projectKey}/imports`
(per the `execution-import` capability) and SHALL interpret the response
as follows: a `201` response SHALL write `{"failed": false}`; a `207`
response SHALL, by default, write `{"failed": false}` while logging the
unmatched case keys and a pointer to the fail-on-unmatched setting, and
SHALL instead write `{"failed": true}` when fail-on-unmatched is
enabled; any other outcome (network failure, authentication error, or a
`4xx`/`5xx` response) SHALL unconditionally write `{"failed": true}`,
regardless of the fail-on-unmatched setting. When logging a submission
error, the reporter SHALL log only the response status, an error
message, and the target URL with any embedded credentials stripped —
it SHALL NOT log a raw request or response object (or a caught error
object) whole, since most JS HTTP clients' error objects carry the
outgoing request's headers, including the `Authorization` header.

#### Scenario: All tests matched
- **WHEN** every tagged `<testcase>` in the submitted report matches an
  existing case and the API responds `201`
- **THEN** the reporter logs the matched count and created run, and
  `check` exits `0`

#### Scenario: Some tests unmatched, default configuration
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and fail-on-unmatched is not enabled
- **THEN** the reporter logs each unmatched case key alongside a message
  naming fail-on-unmatched as the escalation path, and `check` exits `0`

#### Scenario: Some tests unmatched, fail-on-unmatched enabled
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and fail-on-unmatched is enabled
- **THEN** `check` exits non-zero, even if every individual test passed

#### Scenario: Submission error always fails the build
- **WHEN** the submission request fails outright (network error, `401`,
  `400`, or `5xx`), regardless of the fail-on-unmatched setting
- **THEN** `check` exits non-zero

### Requirement: Dry run never submits and never affects the result marker's failed field
When dry-run is enabled, the reporter SHALL fetch existing case keys via
a read-only `GET /api/v1/projects/{projectKey}/cases` request, log a
match preview against the case keys discovered in the run, and SHALL NOT
call the import endpoint. The result marker SHALL record `{"failed":
false}` regardless of the preview's result, unless the preview fetch
itself fails.

#### Scenario: Dry run previews matches without submitting
- **WHEN** dry-run is enabled and the current run has both tagged case
  keys that exist in the project and ones that don't
- **THEN** the reporter logs which case keys would match and which
  wouldn't, makes no request to the import endpoint, and `check` exits
  `0`

### Requirement: Configuration resolves environment variable over reporter option
For `url`, `token`, `project`, `failOnUnmatched`, and `dryRun`, the
reporter SHALL resolve each value by checking, in order: the
corresponding environment variable (`TESTPULSE_URL`, `TESTPULSE_TOKEN`,
`TESTPULSE_PROJECT`, `TESTPULSE_FAIL_ON_UNMATCHED`, `TESTPULSE_DRY_RUN`),
then the corresponding reporter option (passed via `reporterOptions` in
`.mocharc.js`), using the first one present. There is no third,
config-file-backed resolution tier. The resolved token SHALL NOT be
logged at any verbosity level. `TESTPULSE_FAIL_ON_UNMATCHED` and
`TESTPULSE_DRY_RUN` SHALL be parsed as boolean by a fixed, documented
rule: the case-insensitive string `"true"` or `"1"` resolves to `true`;
every other value (including `"false"`, `"0"`, and an empty string)
resolves to `false`. The plugin SHALL NOT use a bare JavaScript
truthiness check on the raw environment variable string, since any
non-empty string (including the literal text `"false"`) is truthy in
JavaScript.

#### Scenario: Environment variable overrides reporter option
- **WHEN** `TESTPULSE_URL=https://a.example` is set in the environment
  and the reporter is constructed with `{ url: 'https://b.example' }`
- **THEN** the plugin submits to `https://a.example`

#### Scenario: Reporter option is used when no environment variable is set
- **WHEN** no `TESTPULSE_TOKEN` environment variable is set and the
  reporter is constructed with `{ token: 't0k3n' }`
- **THEN** the plugin authenticates using `t0k3n`

#### Scenario: A literal "false" env var value resolves to false, not true
- **WHEN** `TESTPULSE_DRY_RUN=false` is set in the environment
- **THEN** dry-run mode is NOT enabled (the reporter submits for real)

### Requirement: Parallel mode is not supported, and the reporter warns when it detects parallel mode
Since Mocha's `--parallel` mode transmits `Test` objects from worker
processes to the main process via a fixed, hardcoded serialization
format that carries no custom properties, the plugin SHALL NOT claim
support for `--parallel` mode, and its documentation SHALL state this
limitation and its underlying cause explicitly. The reporter SHALL
check Mocha's own resolved `parallel` configuration value (the
documented, stable boolean option available to a reporter, not an
internal runner-type inspection) and, when true, SHALL emit a stderr
warning naming the limitation once per run — so a build that silently
submits zero matched case keys under `--parallel` is diagnosable rather
than indistinguishable from "no tests were tagged."

#### Scenario: A case key set under --parallel does not survive to the reporter
- **WHEN** `testpulse.Case(this, 'LOGIN-42')` is called from a test run
  under `mocha --parallel`
- **THEN** the property is not necessarily present on the corresponding
  result the reporter receives, and this is a documented, known
  limitation rather than an implicit guarantee

#### Scenario: Running under --parallel produces a warning
- **WHEN** the reporter's resolved Mocha options indicate `parallel:
  true`
- **THEN** the reporter logs a stderr warning naming the `--parallel`
  limitation before the run completes

#### Scenario: A case key set under --parallel does not survive to the reporter
- **WHEN** `testpulse.Case(this, 'LOGIN-42')` is called from a test run
  under `mocha --parallel`
- **THEN** the property is not necessarily present on the corresponding
  result the reporter receives, and this is a documented, known
  limitation rather than an implicit guarantee
