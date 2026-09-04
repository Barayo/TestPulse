## ADDED Requirements

### Requirement: Case linkage via Jasmine's own setSpecProperty
The plugin SHALL provide `testpulse.Case(caseKey, opts?)`, callable from
within a running Jasmine spec. `Case` SHALL call
`jasmine.getEnv().setSpecProperty('testpulse_case_key', caseKey)`, and
additionally `setSpecProperty('testpulse_platform', ...)`/
`testpulse_version`/`testpulse_tags` only for whichever of
`opts.platform`/`opts.version`/`opts.tags` were supplied, matching the
property names the `execution-import` capability's importer already
reads. The plugin SHALL NOT maintain its own scratch-directory-based
tagging mechanism for case-key metadata — it SHALL rely entirely on
Jasmine's own native `setSpecProperty`/reporter `properties` field.

#### Scenario: A tagged spec's case key is recorded as a property
- **WHEN** a spec calls `testpulse.Case('LOGIN-42')`
- **THEN** the corresponding `<testcase>` in the generated report
  contains a `<property name="testpulse_case_key" value="LOGIN-42"/>`

#### Scenario: Optional metadata is recorded only when supplied
- **WHEN** a spec calls `testpulse.Case('LOGIN-42', { platform: 'linux',
  tags: ['smoke'] })` (no version)
- **THEN** its `<testcase>` gains `testpulse_platform` and
  `testpulse_tags` properties, and no `testpulse_version` property

#### Scenario: An untagged spec carries no TestPulse properties
- **WHEN** a spec never calls `testpulse.Case`
- **THEN** its `<testcase>` entry carries no `testpulse_case_key`
  property in the generated report

### Requirement: Attachments require the currently-executing spec's own declared case key
The plugin SHALL provide `testpulse.Attach(caseKey, data, filename,
contentType)`, callable from within a running Jasmine spec body. It
SHALL verify the caller's `caseKey` against
`jasmine.getEnv().getSpecProperty('testpulse_case_key')` (Jasmine's own
native readback of the value `Case` set), and SHALL reject (throw) a
mismatch. A call outside an active spec SHALL throw (Jasmine's own
`setSpecProperty`/`getSpecProperty` already throw
`"'getSpecProperty' was used when there was no current spec"` in that
case, and the plugin SHALL let that error surface rather than swallowing
or duplicating it). Only `image/png`, `image/jpeg`, and `image/webp`
content types SHALL be accepted; any other content type SHALL be
rejected. Content type SHALL be validated before the case-key check.

#### Scenario: An attachment matching the currently-executing spec's own case key is accepted
- **WHEN** `testpulse.Attach('LOGIN-42', bytes, 'failure.png',
  'image/png')` is called from within a spec that earlier called
  `testpulse.Case('LOGIN-42')`
- **THEN** the attachment is registered

#### Scenario: An attachment under a case key belonging to a different spec is rejected
- **WHEN** `testpulse.Attach('OTHER-1', ...)` is called from within a
  spec whose own `Case` call declared a different case key
- **THEN** the call throws, and no attachment is registered

#### Scenario: An unsupported content type is rejected
- **WHEN** `testpulse.Attach('LOGIN-42', bytes, 'x.pdf',
  'application/pdf')` is called, even from a spec that does declare
  `LOGIN-42`
- **THEN** the call throws and no attachment is registered

#### Scenario: Attach outside an active spec throws
- **WHEN** `testpulse.Attach('LOGIN-42', ...)` is called while no spec is
  currently executing
- **THEN** the call throws, and no attachment is registered

### Requirement: Multiple attachments under the same case key are all preserved
Since a single spec may legitimately call `Attach` more than once within
itself (e.g. capturing two screenshots during one spec), the
scratch-directory storage mechanism SHALL NOT deduplicate or overwrite
attachments sharing a case key — each call SHALL produce a distinct
stored attachment (derived from the case key plus a fresh identifier
generated inside that call, not the case key alone), and the submit step
SHALL include all of them (grouped under that case key) in the submitted
`attachments` array.

#### Scenario: Two attachments under the same case key both survive
- **WHEN** a single spec calls `testpulse.Case('LOGIN-42')` once, then
  calls `testpulse.Attach('LOGIN-42', ...)` twice within its own body,
  with different file contents each time
- **THEN** both attachments are present in the scratch directory
  afterward, and both are included in the submit request's `attachments`
  array

### Requirement: The reporter auto-annotates and auto-submits, independent of Jasmine's own exit code
The plugin SHALL provide a reporter (registered via a Jasmine `helpers`
file entry — the plugin SHALL NOT depend on a declarative `reporters`
config array, since Jasmine's config format has none) that builds a
JUnit XML report directly from each spec's `properties` field, without
depending on `jasmine-reporters` or any other third-party JUnit XML
writer. In its `jasmineDone` handler, the reporter SHALL submit the
report (or preview it, in dry-run mode) and SHALL write a
`.testpulse/result.json` marker recording whether the outcome should
fail the build, since Jasmine's own CLI runner determines its process
exit code purely from spec pass/fail status and provides no mechanism
for a reporter to alter it.

#### Scenario: A genuinely failing spec still triggers annotate and submit
- **WHEN** a spec carrying `testpulse.Case('LOGIN-42')` genuinely fails
- **THEN** Jasmine reports the spec failure, AND the reporter's
  `jasmineDone` handler still runs and still submits the (failed) result

### Requirement: The check CLI is the only mechanism that fails the build
The plugin SHALL provide a `testpulse-jasmine check` command that reads
`.testpulse/result.json` and exits non-zero if it indicates failure, or
exits non-zero with a message naming the likely cause if the marker file
is absent entirely (the reporter never ran). Otherwise it SHALL exit `0`.

#### Scenario: A failed submission fails the build via check
- **WHEN** `.testpulse/result.json` contains `{"failed": true}`
- **THEN** `testpulse-jasmine check` exits non-zero

#### Scenario: A missing result marker fails the build with a named cause
- **WHEN** `.testpulse/result.json` does not exist
- **THEN** `testpulse-jasmine check` exits non-zero with a message naming
  a likely misconfiguration cause, not a raw file-not-found error

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
regardless of the fail-on-unmatched setting.

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
- **THEN** `check` exits non-zero, even if every individual spec passed

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

### Requirement: Configuration resolves reporter option, then environment variable
For `url`, `token`, `project`, `failOnUnmatched`, and `dryRun`, the
reporter SHALL resolve each value by checking, in order: the
corresponding reporter option (passed to `addReporter(new
TestPulseReporter(options))`), then the corresponding environment
variable (`TESTPULSE_URL`, `TESTPULSE_TOKEN`, `TESTPULSE_PROJECT`,
`TESTPULSE_FAIL_ON_UNMATCHED`, `TESTPULSE_DRY_RUN`), using the first one
present. There is no third, config-file-backed resolution tier. The
resolved token SHALL NOT be logged at any verbosity level.

#### Scenario: Reporter option overrides environment variable
- **WHEN** `TESTPULSE_URL=https://a.example` is set in the environment
  and the reporter is constructed with `{ url: 'https://b.example' }`
- **THEN** the plugin submits to `https://b.example`

#### Scenario: Environment variable is used when no reporter option is set
- **WHEN** `TESTPULSE_TOKEN=t0k3n` is set in the environment and the
  reporter is constructed without a `token` option
- **THEN** the plugin authenticates using `t0k3n`
