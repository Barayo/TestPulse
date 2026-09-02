## ADDED Requirements

### Requirement: Case linkage without title pollution
`testpulse-jest` SHALL provide a `testpulse(caseKey, opts?)` function that
wraps `test`/`it`, where `opts` may supply `platform`, `version`, and
`tags`. For each test defined through this wrapper, the resulting
`AssertionResult`'s `title`/`ancestorTitles` (and therefore the JUnit
report's `<testcase name>`/`classname`, and any console/CI output showing
the test's name) SHALL be identical to what an unwrapped `test`/`it` call
with the same name would have produced — the case key and options SHALL
NOT appear anywhere in the visible test name.

#### Scenario: A wrapped test's title is unchanged
- **WHEN** a test is defined as `testpulse('LOGIN-42')('logs in
  successfully', fn)`
- **THEN** the resulting `AssertionResult.title` is exactly `"logs in
  successfully"`, with no case-key marker appended

#### Scenario: caseKey is validated at definition time
- **WHEN** `testpulse('')` or `testpulse(undefined)` is called (an empty or
  missing case key)
- **THEN** an error is thrown synchronously, at test-file load time, before
  any test runs

### Requirement: Scratch-dir sidecar filenames are content-derived, not path-derived
Since Jest test names (`ancestorTitles`/`title`, and therefore
`expect.getState().currentTestName`) are fully user-controlled strings
with no character restrictions, `testpulse()` and `testpulseAttach()`
SHALL NOT use a test's name directly, or any lightly-escaped derivative of
it, as a scratch-directory filename or path component. The sidecar
filename SHALL be a SHA-256 hash of the fullName; the fullName SHALL be
stored only as JSON content inside the sidecar file. `junitTestCaseProperties`
SHALL perform the same hash to look up a sidecar, never a direct
filesystem operation on the untrusted fullName string.

#### Scenario: A test name containing path-traversal characters cannot escape the scratch directory
- **WHEN** a test is defined with a title containing `../../` (e.g. via
  `test.each` generating titles from external data)
- **THEN** its sidecar is written inside the scratch directory, at a
  hashed filename, and no file is created outside the scratch directory

### Requirement: Property injection via the jest-junit hook
`testpulse-jest/junitTestCaseProperties` SHALL export a function
compatible with `jest-junit`'s `testCasePropertiesFile` option. For a
testcase whose `title`/`ancestorTitles` match a test defined via
`testpulse()`, the function SHALL return `testpulse_case_key`, and
whichever of `testpulse_platform`/`testpulse_version`/`testpulse_tags`
were supplied, matching the property names the `execution-import`
capability's importer already reads. For a testcase with no matching
`testpulse()` registration, the function SHALL return an empty object.

#### Scenario: A tagged test's case key is injected into jest-junit's output
- **WHEN** a test is defined `testpulse('LOGIN-42')('logs in
  successfully', fn)`, the suite runs with `jest-junit` configured to use
  this module as `testCasePropertiesFile`, and `jest-junit` writes its
  report
- **THEN** the corresponding `<testcase>` in the JUnit XML report contains
  `<property name="testpulse_case_key" value="LOGIN-42"/>`

#### Scenario: Optional metadata is recorded only when supplied
- **WHEN** a test is defined `testpulse('LOGIN-42', { platform: 'linux',
  tags: ['smoke'] })('...', fn)` (no `version`)
- **THEN** its `<testcase>` gains `testpulse_platform` and
  `testpulse_tags` properties, and no `testpulse_version` property

#### Scenario: An untagged test carries no TestPulse properties
- **WHEN** a test is defined via plain `test`/`it`, not `testpulse()`
- **THEN** `junitTestCaseProperties` returns `{}` for it, and its
  `<testcase>` carries no `testpulse_*` properties

### Requirement: Attachments require a case key
`testpulseAttach(bufferOrPath, opts)` SHALL be callable from within any
running test body and SHALL register the given content as an attachment
for that test's result, to be submitted alongside the import request.
Calling it from within a test with no `testpulse()` registration SHALL log
a warning and SHALL NOT register an attachment. Only `image/png`,
`image/jpeg`, and `image/webp` content types SHALL be accepted; any other
content type SHALL be rejected with a thrown error at the call site.

#### Scenario: An attachment on a tagged test is registered
- **WHEN** `testpulseAttach(buffer, { filename: 'failure.png', contentType:
  'image/png' })` is called from within a test defined via `testpulse('LOGIN-42')`
- **THEN** the attachment is included, keyed to case key `LOGIN-42`, in the
  reporter's subsequent import submission

#### Scenario: An attachment on an untagged test is dropped
- **WHEN** `testpulseAttach(...)` is called from within a test defined via
  plain `test`/`it`, not `testpulse()`
- **THEN** a warning is logged and no attachment is registered for that
  test

#### Scenario: An unsupported content type is rejected
- **WHEN** `testpulseAttach(buffer, { contentType: 'application/pdf' })` is
  called
- **THEN** an error is thrown synchronously and no attachment is
  registered

### Requirement: The reporter requires jest-junit's output to exist
The `testpulse-jest` reporter's `onRunComplete` SHALL read the JUnit XML
file at its configured `junitFile` path (default `./junit.xml`). If that
file does not exist, the reporter SHALL fail with a message naming the
likely cause (the `reporters` array ordering, or `jest-junit` not being
configured), rather than propagating a raw file-system error.

#### Scenario: Missing jest-junit output fails with a named cause
- **WHEN** the `testpulse-jest` reporter runs but no file exists at its
  configured `junitFile` path
- **THEN** the run fails, and the logged error names `reporters` ordering
  and missing `jest-junit` configuration as the likely causes

### Requirement: Submission outcome maps to process exit code
The reporter SHALL submit the JUnit XML report (plus any registered
attachments) to `POST /api/v1/projects/{projectKey}/imports` (per the
`execution-import` capability) and SHALL interpret the response as
follows: a `201` response SHALL leave `process.exitCode` untouched and
SHALL log a summary of matched count and created run; a `207` response
SHALL, by default, leave `process.exitCode` untouched while logging the
unmatched case keys and a pointer to the `failOnUnmatched` setting, and
SHALL instead set `process.exitCode = 1` when `failOnUnmatched` is
enabled; any other outcome (network failure, authentication error, or a
`4xx`/`5xx` response) SHALL unconditionally set `process.exitCode = 1`,
regardless of the `failOnUnmatched` setting.

#### Scenario: All tests matched
- **WHEN** every tagged test in the submitted report matches an existing
  case and the API responds `201`
- **THEN** `process.exitCode` is untouched, and the log shows the matched
  count and created run

#### Scenario: Some tests unmatched, default configuration
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and `failOnUnmatched` is not enabled
- **THEN** `process.exitCode` is untouched, and the log lists each
  unmatched case key alongside a message naming `failOnUnmatched` as the
  escalation path

#### Scenario: Some tests unmatched, failOnUnmatched enabled
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and `failOnUnmatched` is enabled (by env var or reporter option)
- **THEN** `process.exitCode` is set to `1`, even if every individual test
  passed

#### Scenario: Submission error always fails the run
- **WHEN** the submission request fails outright (network error, `401`,
  `400`, or `5xx`), regardless of the `failOnUnmatched` setting
- **THEN** `process.exitCode` is set to `1`

### Requirement: Dry run never submits and never affects exit code
When the `dryRun` option is enabled (by env var or reporter option), the
reporter SHALL fetch existing case keys via a read-only `GET
/api/v1/projects/{projectKey}/cases` request, log a match preview against
the case keys registered via `testpulse()` in the current run, and SHALL
NOT call the import endpoint. `process.exitCode` SHALL be unaffected
regardless of the preview's outcome.

#### Scenario: Dry run previews matches without submitting
- **WHEN** `dryRun` is enabled and the current run has tests tagged with
  both matching and non-matching case keys
- **THEN** the reporter logs which case keys would match and which
  wouldn't, makes no request to the import endpoint, and leaves
  `process.exitCode` untouched

### Requirement: Configuration resolves environment variables over reporter options
For `url`, `token`, `project`, `failOnUnmatched`, and `dryRun`, the
reporter SHALL resolve each value by checking the corresponding
environment variable (`TESTPULSE_URL`, `TESTPULSE_TOKEN`,
`TESTPULSE_PROJECT`, `TESTPULSE_FAIL_ON_UNMATCHED`, `TESTPULSE_DRY_RUN`)
first, falling back to the corresponding reporter option from
`jest.config.js` when the environment variable is not set.

#### Scenario: Environment variable overrides reporter option
- **WHEN** the reporter is configured with `{ url: 'https://a.example' }`
  in `jest.config.js` and `TESTPULSE_URL=https://b.example` is set in the
  environment
- **THEN** the reporter submits to `https://b.example`

#### Scenario: Reporter option is used when no environment variable is set
- **WHEN** `TESTPULSE_PROJECT` is not set in the environment and
  `jest.config.js` configures `{ project: 'LOGIN' }`
- **THEN** the reporter submits to project `LOGIN`
