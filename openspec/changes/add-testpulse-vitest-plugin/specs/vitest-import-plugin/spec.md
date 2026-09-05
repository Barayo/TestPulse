## ADDED Requirements

### Requirement: Case linkage via Vitest's own native annotate API
The plugin SHALL provide `testpulse.Case(context, caseKey, opts?)`,
callable from within a running Vitest test body, where `context` is the
test context object (the parameter Vitest passes into a test function,
exposing `annotate` and `task`). `Case` SHALL call
`context.annotate(caseKey, 'testpulse_case_key')`, and additionally
`context.annotate(opts.platform, 'testpulse_platform')`/
`testpulse_version`/`testpulse_tags` only for whichever of
`opts.platform`/`opts.version`/`opts.tags` were supplied, matching the
property names the `execution-import` capability's importer already
reads. The plugin SHALL NOT maintain its own scratch-directory-based
tagging mechanism — it SHALL rely entirely on Vitest's own native
`annotate()`/`task.annotations` array.

#### Scenario: A tagged test's case key is recorded as a property
- **WHEN** a test calls `testpulse.Case(context, 'LOGIN-42')`
- **THEN** the corresponding `<testcase>` in the generated report
  contains a `<property name="testpulse_case_key" value="LOGIN-42"/>`

#### Scenario: Optional metadata is recorded only when supplied
- **WHEN** a test calls `testpulse.Case(context, 'LOGIN-42', {
  platform: 'linux', tags: ['smoke'] })` (no version)
- **THEN** its `<testcase>` gains `testpulse_platform` and
  `testpulse_tags` properties, and no `testpulse_version` property

#### Scenario: An untagged test carries no TestPulse properties
- **WHEN** a test never calls `testpulse.Case`
- **THEN** its `<testcase>` entry carries no `testpulse_case_key`
  property in the generated report

### Requirement: Attachments use the same native annotation mechanism, verified against the currently-executing test's own declared case key
The plugin SHALL provide `testpulse.Attach(context, caseKey, data,
filename, contentType)`, callable from within a running Vitest test
body. It SHALL verify the caller's `caseKey` against
`context.task.annotations` for an existing `testpulse_case_key` entry
matching it, and SHALL reject (throw) a mismatch or an absence of any
prior `Case` call. Only `image/png`, `image/jpeg`, and `image/webp`
content types SHALL be accepted; any other content type SHALL be
rejected. Content type SHALL be validated before the case-key check. On
success, it SHALL call `context.annotate(filename,
'testpulse_attachment', { body: data, contentType })` — the plugin
SHALL NOT write attachment data to a scratch directory or any other
filesystem location; Vitest's own annotation mechanism SHALL be the
sole channel for attachment data reaching the reporter.

#### Scenario: An attachment matching the currently-executing test's own case key is accepted
- **WHEN** `testpulse.Attach(context, 'LOGIN-42', bytes, 'failure.png',
  'image/png')` is called from within a test that earlier called
  `testpulse.Case(context, 'LOGIN-42')`
- **THEN** the attachment annotation is recorded

#### Scenario: An attachment under a case key belonging to a different test is rejected
- **WHEN** `testpulse.Attach(context, 'OTHER-1', ...)` is called from
  within a test whose own `Case` call declared a different case key
- **THEN** the call throws, and no attachment annotation is recorded

#### Scenario: An unsupported content type is rejected
- **WHEN** `testpulse.Attach(context, 'LOGIN-42', bytes, 'x.pdf',
  'application/pdf')` is called, even from a test that does declare
  `LOGIN-42`
- **THEN** the call throws and no attachment annotation is recorded

### Requirement: Multiple attachments under the same case key are all preserved
Since a single test may legitimately call `Attach` more than once
within itself (e.g. capturing two screenshots during one test), the
plugin SHALL NOT deduplicate or overwrite attachment annotations
sharing a case key — each call SHALL produce a distinct annotation, and
the submit step SHALL include all of them (grouped under that case key)
in the submitted `attachments` array.

#### Scenario: Two attachments under the same case key both survive
- **WHEN** a single test calls `testpulse.Case(context, 'LOGIN-42')`
  once, then calls `testpulse.Attach(context, 'LOGIN-42', ...)` twice
  within its own body, with different file contents each time
- **THEN** both attachments are included in the submit request's
  `attachments` array

### Requirement: The reporter builds JUnit XML directly from native annotation data, without depending on the built-in junit reporter's file output
The plugin SHALL provide a `TestPulseReporter` class implementing
Vitest's Reporter interface (`onTestModuleEnd`/`onTestRunEnd`),
registered via the `reporters` array in `vitest.config.ts`. It SHALL
build a JUnit XML report directly from each test's own
`annotations()` (via `TestCase.annotations()`) and result data, and
SHALL NOT read the built-in `junit` reporter's output file, since that
file's write is asynchronous relative to other configured reporters'
own hooks and is not guaranteed complete when a subsequent reporter's
hook runs. In `onTestRunEnd`, the reporter SHALL submit the assembled
report (or preview it, in dry-run mode) and SHALL write a
`.testpulse/result.json` marker recording whether the outcome should
fail the build. (A reporter's `process.exitCode` assignment was found
during implementation to actually survive on the Vitest versions
tested, contrary to this project's own earlier, since-corrected repro —
see design.md's Context #5 — but the marker-plus-`check`-CLI mechanism
is still used regardless, for consistency with the Jasmine/Mocha
plugins and because relying on `process.exitCode` isn't part of
Vitest's documented reporter contract.)

#### Scenario: A genuinely failing test still triggers annotate and submit
- **WHEN** a test carrying `testpulse.Case(context, 'LOGIN-42')`
  genuinely fails
- **THEN** Vitest reports the test failure, AND the reporter's
  `onTestRunEnd` handler still runs and still submits the (failed)
  result

#### Scenario: Case keys from multiple test files are all included in one submission
- **WHEN** a run spans more than one test file, each containing at
  least one `testpulse.Case`-tagged test
- **THEN** the single submitted report includes every tagged
  `<testcase>` from every file, correctly attributed to its own file's
  `<testsuite>`

### Requirement: All text and attribute content written into the generated report is XML-escaped
Since the reporter builds JUnit XML directly rather than delegating to
a third-party or built-in writer, it SHALL escape every value it writes
into an element's text content or attribute value — test names,
classnames/file paths, failure messages and stack traces, and every
`Case`-supplied value (`caseKey`, `platform`, `version`, each tag) —
before writing it, using standard XML entity escaping (`&amp;`, `&lt;`,
`&gt;`, `"`, `'`). None of these values SHALL be trusted as
already-safe.

#### Scenario: A failure message containing XML metacharacters cannot inject a forged property
- **WHEN** a test fails with a message containing `</failure>`,
  `<property name="testpulse_case_key" value="OTHER-1"/>`, or a `]]>`
  sequence
- **THEN** the generated report contains that text escaped as literal
  content inside the `<failure>` element, and no additional
  `<property>` or sibling element is introduced by it

#### Scenario: A case key or tag containing XML metacharacters round-trips as literal text
- **WHEN** `testpulse.Case(context, caseKey, opts)` is called with a
  `caseKey` or a tag in `opts.tags` containing `&`, `<`, `>`, or a quote
  character
- **THEN** the generated report's corresponding `<property>` value
  attribute contains that value correctly escaped, not raw

### Requirement: The check CLI is the only mechanism that fails the build
The plugin SHALL provide a `testpulse-vitest check` command that reads
`.testpulse/result.json` and exits non-zero if it indicates failure
(including a specific `reason` in its output when the marker carries
one, e.g. for a missing-configuration skip), or exits non-zero with a
message naming the likely cause if the marker file is absent entirely
(the reporter never ran). Otherwise it SHALL exit `0`. A `reason` value
SHALL name only which configuration variable is missing, and SHALL NOT
include the resolved value of any other configuration setting.

#### Scenario: A failed submission fails the build via check
- **WHEN** `.testpulse/result.json` contains `{"failed": true}`
- **THEN** `testpulse-vitest check` exits non-zero

#### Scenario: A missing result marker fails the build with a named cause
- **WHEN** `.testpulse/result.json` does not exist
- **THEN** `testpulse-vitest check` exits non-zero with a message
  naming a likely misconfiguration cause, not a raw file-not-found
  error

#### Scenario: A missing-configuration skip is distinguishable from a missing marker
- **WHEN** the reporter ran but required configuration
  (`TESTPULSE_URL`/`TESTPULSE_TOKEN`/`TESTPULSE_PROJECT`) was absent
- **THEN** the marker records `{"failed": true, "reason": "..."}`
  naming the missing configuration, and `check` prints that reason
  rather than the generic "marker file is absent" message

### Requirement: Submission outcome maps to the result marker's failed field
The reporter's submit step SHALL `POST` the annotated report (plus any
registered attachments) to `POST /api/v1/projects/{projectKey}/imports`
(per the `execution-import` capability) and SHALL interpret the
response as follows: a `201` response SHALL write `{"failed": false}`;
a `207` response SHALL, by default, write `{"failed": false}` while
logging the unmatched case keys and a pointer to the fail-on-unmatched
setting, and SHALL instead write `{"failed": true}` when
fail-on-unmatched is enabled; any other outcome (network failure,
authentication error, or a `4xx`/`5xx` response) SHALL unconditionally
write `{"failed": true}`, regardless of the fail-on-unmatched setting.
When logging a submission error, the reporter SHALL log only the
response status, an error message, and the target URL with any
embedded credentials stripped — it SHALL NOT log a raw request or
response object (or a caught error object) whole.

#### Scenario: All tests matched
- **WHEN** every tagged `<testcase>` in the submitted report matches an
  existing case and the API responds `201`
- **THEN** the reporter logs the matched count and created run, and
  `check` exits `0`

#### Scenario: Some tests unmatched, default configuration
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and fail-on-unmatched is not enabled
- **THEN** the reporter logs each unmatched case key alongside a
  message naming fail-on-unmatched as the escalation path, and `check`
  exits `0`

#### Scenario: Some tests unmatched, fail-on-unmatched enabled
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and fail-on-unmatched is enabled
- **THEN** `check` exits non-zero, even if every individual test passed

#### Scenario: A 207 response with failOnUnmatched already enabled does not suggest enabling it
- **WHEN** the API responds `207` with unmatched case keys and
  fail-on-unmatched is already enabled
- **THEN** the logged message states the build is failing because
  fail-on-unmatched is enabled, not a suggestion to enable a setting
  that is already active

#### Scenario: Submission error always fails the build
- **WHEN** the submission request fails outright (network error,
  `401`, `400`, or `5xx`), regardless of the fail-on-unmatched setting
- **THEN** `check` exits non-zero

### Requirement: Dry run never submits, and a failed preview fetch fails closed
When dry-run is enabled, the reporter SHALL fetch existing case keys
via a read-only `GET /api/v1/projects/{projectKey}/cases` request, log
a match preview against the case keys discovered in the run, and SHALL
NOT call the import endpoint. The result marker SHALL record
`{"failed": false}` only when the preview fetch itself succeeds; if the
preview fetch fails (network error, authentication error, or a
non-2xx response), the marker SHALL record `{"failed": true}`, and the
same credential-safe error-logging rule (status/message/
credential-stripped URL, never a raw error/response object) SHALL
apply to this path exactly as it does to the real-submission path. Dry
run is often used specifically to smoke-test that configuration/auth
is correct in CI; a preview-fetch failure silently reported as success
would defeat that purpose.

#### Scenario: Dry run previews matches without submitting
- **WHEN** dry-run is enabled and the current run has both tagged case
  keys that exist in the project and ones that don't
- **THEN** the reporter logs which case keys would match and which
  wouldn't, makes no request to the import endpoint, and `check` exits
  `0`

#### Scenario: A dry-run preview-fetch failure fails the build
- **WHEN** dry-run is enabled and the `GET /cases` preview request
  fails (network error, `401`, or `5xx`)
- **THEN** the marker records `{"failed": true}`, the logged error
  contains only status/message/credential-stripped URL, and `check`
  exits non-zero

### Requirement: Configuration resolves environment variable over reporter option
For `url`, `token`, `project`, `failOnUnmatched`, and `dryRun`, the
reporter SHALL resolve each value by checking, in order: the
corresponding environment variable (`TESTPULSE_URL`, `TESTPULSE_TOKEN`,
`TESTPULSE_PROJECT`, `TESTPULSE_FAIL_ON_UNMATCHED`,
`TESTPULSE_DRY_RUN`), then the corresponding reporter option (passed
via the reporter's constructor options in `vitest.config.ts`), using
the first one present. There is no third, config-file-backed
resolution tier. The resolved token SHALL NOT be logged at any
verbosity level. `TESTPULSE_FAIL_ON_UNMATCHED` and `TESTPULSE_DRY_RUN`
SHALL be parsed as boolean by a fixed, documented rule, applied
uniformly regardless of which of the two sources (environment variable
or reporter option) supplied the raw value: the case-insensitive
string `"true"` or `"1"` resolves to `true`; every other string value
(including `"false"`, `"0"`, and an empty string) resolves to `false`;
a genuine boolean reporter-option value (`true`/`false`) is used
as-is. The plugin's TypeScript types SHALL declare these reporter
options as `boolean` only (not `boolean | string`), so a config
author's IDE/type-checker catches an accidental string value at the
call site rather than relying on runtime parsing alone. The plugin
SHALL NOT use a bare JavaScript truthiness check
on the raw environment variable string.

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

#### Scenario: A reporter-option boolean value is used as-is, and TypeScript rejects a string value
- **WHEN** the reporter is constructed with `{ dryRun: true }` and no
  `TESTPULSE_DRY_RUN` environment variable is set
- **THEN** dry-run mode is enabled; a hypothetical `{ dryRun: 'false' }`
  (a string, not a boolean) is a TypeScript type error at the call
  site, not a value the runtime parsing logic ever needs to handle
