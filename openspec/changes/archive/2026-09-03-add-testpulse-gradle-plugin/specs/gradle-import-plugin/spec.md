## ADDED Requirements

### Requirement: Case linkage via the shared annotation
The plugin SHALL reuse `testpulse-annotations`' `@TestPulse(caseKey,
platform = "", version = "", tags = {})` annotation. For each test method
carrying this annotation, the `testpulseAnnotate` task SHALL write
`testpulse_case_key`, and whichever of
`testpulse_platform`/`testpulse_version`/`testpulse_tags` were supplied
(non-default), as `<property>` entries under that test's `<testcase>` in
the Gradle-generated `build/test-results/test/TEST-*.xml` report, matching
the property names the `execution-import` capability's importer already
reads.

#### Scenario: An annotated test's case key is recorded as a property
- **WHEN** a test method is annotated `@TestPulse(caseKey = "LOGIN-42")`
  and the build runs `test` followed by the `testpulseAnnotate` task
- **THEN** the corresponding `TEST-*.xml`'s `<testcase>` for that method
  contains a `<property name="testpulse_case_key" value="LOGIN-42"/>`

#### Scenario: Optional metadata is recorded only when supplied
- **WHEN** a test method is annotated `@TestPulse(caseKey = "LOGIN-42",
  platform = "linux", tags = {"smoke"})` (no `version`)
- **THEN** its `<testcase>` gains `testpulse_platform` and
  `testpulse_tags` properties, and no `testpulse_version` property

#### Scenario: An unannotated test carries no TestPulse properties
- **WHEN** a test method has no `@TestPulse` annotation
- **THEN** its `<testcase>` entry carries no `testpulse_case_key`
  property after `testpulseAnnotate` runs

### Requirement: Annotation matching is exact-method-only
The `testpulseAnnotate` task SHALL only inject properties for a
`<testcase>` whose `name` maps to exactly one compiled test method via
reflection. A `<testcase>` whose name Gradle has decorated (a
parameterized-test invocation suffix, a dynamic or nested JUnit 5 test),
or whose class+name resolves to more than one method (an overload), SHALL
be left unmodified, and the task SHALL log a note identifying it rather
than guessing at or silently mismatching an annotation to it.

#### Scenario: A parameterized test invocation is left unmodified
- **WHEN** a `@ParameterizedTest`-annotated method also carries
  `@TestPulse("LOGIN-42")`, producing multiple decorated `<testcase>`
  entries
- **THEN** the `testpulseAnnotate` task does not inject a property into
  those decorated entries, and logs a note naming them as skipped

#### Scenario: An overloaded method is left unmodified
- **WHEN** a test class has two methods sharing the same name (an
  overload) and one of them carries `@TestPulse("LOGIN-42")`
- **THEN** the `testpulseAnnotate` task does not inject a property for
  that `<testcase>`, since class+name matches more than one method, and
  logs a note naming it as ambiguous

### Requirement: Attachments require the caller's own annotated case key
`TestPulseAttachments.attach(caseKey, bytes, filename, contentType)`
SHALL be callable from within a running test body. It SHALL identify the
calling class (without relying on any JUnit-version-specific hook) and
SHALL reject the call, throwing, unless `caseKey` matches one of the
`@TestPulse`-annotated case keys declared on that class's own methods.
Only `image/png`, `image/jpeg`, and `image/webp` content types SHALL be
accepted; any other content type SHALL be rejected with a thrown error.
Content type SHALL be validated before any content type-unrelated
rejection (the allowlist check) prevents an attachment from being
registered.

#### Scenario: An attachment matching the calling class's own case key is accepted
- **WHEN** `TestPulseAttachments.attach("LOGIN-42", bytes, "failure.png",
  "image/png")` is called from within a test method in a class where some
  method carries `@TestPulse(caseKey = "LOGIN-42")`
- **THEN** the attachment is registered

#### Scenario: An attachment under a case key belonging to a different class is rejected
- **WHEN** `TestPulseAttachments.attach("OTHER-1", ...)` is called from
  within a class whose own `@TestPulse`-annotated methods only declare
  case keys other than `OTHER-1`
- **THEN** the call throws, and no attachment is registered

#### Scenario: An unsupported content type is rejected
- **WHEN** `TestPulseAttachments.attach("LOGIN-42", bytes, "x.pdf",
  "application/pdf")` is called, even from a class that does declare
  `LOGIN-42`
- **THEN** the call throws and no attachment is registered

### Requirement: Multiple attachments under the same case key are all preserved
Since `@ParameterizedTest`/data-driven tests may legitimately call
`attach()` multiple times under the same case key within a single test
run, the scratch-directory storage mechanism SHALL NOT deduplicate or
overwrite attachments sharing a case key — each call SHALL produce a
distinct stored attachment, and `testpulseSubmit` SHALL include all of
them (grouped under that case key) in the submitted `attachments` array,
not only the most recent one.

#### Scenario: Two attachments under the same case key both survive
- **WHEN** a parameterized test invokes `attach("LOGIN-42", ...)` twice
  within the same build, with different file contents each time
- **THEN** both attachments are present in the scratch directory
  afterward, and both are included in the `testpulseSubmit` request's
  `attachments` array

### Requirement: A missing test report fails the build with a named path
If the `testpulseAnnotate` task's reflection scan finds one or more
`@TestPulse`-annotated methods, but the corresponding
`build/test-results/test/TEST-*.xml` report does not exist (e.g. tests
were skipped, or a compile failure prevented the `test` task from
running), the task SHALL fail the build with a message naming the
expected report path, rather than letting an unhandled exception
propagate.

#### Scenario: Annotated tests exist but no report was produced
- **WHEN** a test method carries `@TestPulse("LOGIN-42")` but the `test`
  task did not run (e.g. `-x test`), so no report exists for that class
- **THEN** the build fails, and the logged error names the expected
  report path — not a raw stack trace

### Requirement: The XML reader rejects external entities
The `testpulseAnnotate` task's XML parser SHALL have DOCTYPE processing
and external entity resolution disabled, regardless of the fact that
Gradle's own report-writing escapes test output (making the input trusted
in practice) — the parser configuration SHALL NOT rely on that assumption
holding.

#### Scenario: A crafted external-entity payload is not expanded
- **WHEN** a `TEST-*.xml` file contains a `<!DOCTYPE>` declaration with an
  external entity reference
- **THEN** the `testpulseAnnotate` task's parser does not resolve or
  expand that entity

### Requirement: Configuration resolves project property, then env var, then extension DSL
For `url`, `project`, `failOnUnmatched`, and `dryRun`, the plugin SHALL
resolve each value by checking, in order: the corresponding command-line
project property (`-Ptestpulse.<name>=...`), then the corresponding field
in the `testpulse { }` extension DSL block, using the first one present.
For `token`, the plugin SHALL additionally check the `TESTPULSE_TOKEN`
environment variable, consulted between the project property and the DSL
block (project property, then env var, then DSL block) — since a token is
a secret that should not need to be written into a `-P` flag or a
committed `build.gradle`. The resolved token SHALL NOT be logged at any
log level.

#### Scenario: Project property overrides the extension DSL block
- **WHEN** the extension configures `testpulse { url =
  'https://a.example' }` and the build runs with `-Ptestpulse.url=https://b.example`
- **THEN** the plugin submits to `https://b.example`

#### Scenario: Env var is used for the token when no project property is set
- **WHEN** `TESTPULSE_TOKEN=t0k3n` is set in the environment and no
  `-Ptestpulse.token` project property is passed
- **THEN** the plugin authenticates using `t0k3n`

#### Scenario: Project property overrides the token env var
- **WHEN** `TESTPULSE_TOKEN=env-token` is set in the environment and the
  build runs with `-Ptestpulse.token=cli-token`
- **THEN** the plugin authenticates using `cli-token`

### Requirement: Submission outcome maps to build exit behavior
The `testpulseSubmit` task SHALL submit the annotated report (plus any
registered attachments) to `POST /api/v1/projects/{projectKey}/imports`
(per the `execution-import` capability) and SHALL interpret the response
as follows: a `201` response SHALL leave the build outcome unaffected and
SHALL log a summary of matched count and created run; a `207` response
SHALL, by default, leave the build outcome unaffected while logging the
unmatched case keys and a pointer to the `failOnUnmatched` setting, and
SHALL instead fail the build when `failOnUnmatched` is enabled; any other
outcome (network failure, authentication error, or a `4xx`/`5xx`
response) SHALL unconditionally fail the build, regardless of the
`failOnUnmatched` setting.

#### Scenario: All tests matched
- **WHEN** every annotated `<testcase>` in the submitted report matches
  an existing case and the API responds `201`
- **THEN** the build succeeds, and the build log shows the matched count
  and created run

#### Scenario: Some tests unmatched, default configuration
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and `failOnUnmatched` is not enabled
- **THEN** the build succeeds, and the build log lists each unmatched
  case key alongside a message naming `failOnUnmatched` as the escalation
  path

#### Scenario: Some tests unmatched, failOnUnmatched enabled
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and `failOnUnmatched` is enabled (by any of its config sources)
- **THEN** the build fails, even if every individual test passed

#### Scenario: Submission error always fails the build
- **WHEN** the submission request fails outright (network error, `401`,
  `400`, or `5xx`), regardless of the `failOnUnmatched` setting
- **THEN** the build fails

### Requirement: Dry run never submits and never affects build outcome
When `dryRun` is enabled (by any of its config sources), `testpulseSubmit`
SHALL fetch existing case keys via a read-only `GET
/api/v1/projects/{projectKey}/cases` request, log a match preview against
the case keys discovered by `testpulseAnnotate`, and SHALL NOT call the
import endpoint. The build outcome SHALL be unaffected regardless of the
preview's result.

#### Scenario: Dry run previews matches without submitting
- **WHEN** `dryRun` is enabled and the current build has both annotated
  case keys that exist in the project and ones that don't
- **THEN** the task logs which case keys would match and which wouldn't,
  makes no request to the import endpoint, and the build succeeds
