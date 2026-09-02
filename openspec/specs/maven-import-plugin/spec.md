# maven-import-plugin

## Purpose

The `testpulse-maven-plugin`/`testpulse-annotations` observable contract —
the `@TestPulse` annotation's shape, the `annotate` goal's XML-rewrite
behavior (including its match-only-clean-cases scope), and the `submit`
goal's config resolution and exit-code behavior. The plugin itself ships
as its own public repos (`Barayo/testpulse-annotations`,
`Barayo/testpulse-maven-plugin`); this spec describes what it must do, not
how it's implemented.

## Requirements

### Requirement: Case linkage via annotation
`testpulse-annotations` SHALL provide a `@TestPulse(caseKey, platform =
"", version = "", tags = {})` annotation with `RetentionPolicy.RUNTIME`,
applicable to test methods. For each test method carrying this
annotation, the `annotate` goal SHALL write `testpulse_case_key`, and
whichever of `testpulse_platform`/`testpulse_version`/`testpulse_tags`
were supplied (non-default), as `<property>` entries under that test's
`<testcase>` in the Surefire-generated `TEST-*.xml` report, matching the
property names the `execution-import` capability's importer already
reads.

#### Scenario: An annotated test's case key is recorded as a property
- **WHEN** a test method is annotated `@TestPulse(caseKey = "LOGIN-42")`
  and the build runs `surefire:test` followed by the `annotate` goal
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
  property after the `annotate` goal runs

### Requirement: Annotation matching is exact-method-only
The `annotate` goal SHALL only inject properties for a `<testcase>` whose
`name` maps to exactly one compiled test method via reflection. A
`<testcase>` whose name Surefire has decorated (a parameterized-test
invocation suffix, a dynamic or nested JUnit 5 test), or whose class+name
resolves to more than one method (an overload), SHALL be left unmodified,
and the goal SHALL log a note identifying it rather than guessing at or
silently mismatching an annotation to it. A class that fails to load
during the reflection scan (e.g. `NoClassDefFoundError`) SHALL be skipped
with a logged warning naming it, rather than aborting the scan for the
rest of the project's test classes.

#### Scenario: A parameterized test invocation is left unmodified
- **WHEN** a `@ParameterizedTest`-annotated method also carries
  `@TestPulse("LOGIN-42")`, producing multiple decorated `<testcase>`
  entries (e.g. `name="test(String)[1]"`)
- **THEN** the `annotate` goal does not inject a property into those
  decorated entries, and logs a note naming them as skipped

#### Scenario: An overloaded method is left unmodified
- **WHEN** a test class has two methods sharing the same name (an
  overload) and one of them carries `@TestPulse("LOGIN-42")`
- **THEN** the `annotate` goal does not inject a property for that
  `<testcase>`, since class+name matches more than one `Method`, and logs
  a note naming it as ambiguous

#### Scenario: A class that fails to load does not abort the scan
- **WHEN** one compiled test class throws `NoClassDefFoundError` during
  the reflection scan (e.g. a missing optional runtime dependency), and
  other test classes in the same project have valid `@TestPulse`
  annotations
- **THEN** the `annotate` goal logs a warning naming the failed class and
  continues; the other classes' annotations are still injected normally

### Requirement: No annotated tests means no configuration is required
When the `annotate` goal's reflection scan finds zero `@TestPulse`-
annotated methods anywhere in the project's test classes, the `submit`
goal SHALL require no configuration and SHALL NOT attempt a request to
the import endpoint. The build outcome SHALL be unaffected.

#### Scenario: A project with no annotated tests needs no config
- **WHEN** a build runs `annotate` and `submit` but no test method in the
  project carries `@TestPulse`, and none of `url`/`token`/`project` are
  configured anywhere
- **THEN** the build succeeds; `submit` performs no configuration
  resolution and makes no request

### Requirement: A missing Surefire report fails the build with a named path
If the `annotate` goal's reflection scan finds one or more `@TestPulse`-
annotated methods, but the corresponding `target/surefire-reports/
TEST-*.xml` report does not exist (e.g. tests were skipped, or a
test-compile failure prevented Surefire from running), the goal SHALL
fail the build with a message naming the expected report path, rather
than letting an unhandled exception propagate.

#### Scenario: Annotated tests exist but no report was produced
- **WHEN** a test method carries `@TestPulse("LOGIN-42")` but the build
  ran with `-DskipTests`, so `target/surefire-reports/TEST-*.xml` for
  that class does not exist
- **THEN** the build fails, and the logged error names the expected
  report path — not a raw `IOException`/stack trace

### Requirement: The XML reader rejects external entities
The `annotate` goal's XML parser SHALL have DOCTYPE processing and
external entity resolution disabled, regardless of the fact that
Surefire's own report-writing escapes test output (making the input
trusted in practice) — the parser configuration SHALL NOT rely on that
assumption holding.

#### Scenario: A crafted external-entity payload is not expanded
- **WHEN** a `TEST-*.xml` file contains a `<!DOCTYPE>` declaration with an
  external entity reference
- **THEN** the `annotate` goal's parser does not resolve or expand that
  entity

### Requirement: Configuration resolves system property, then pom configuration
For `url`, `project`, and `failOnUnmatched`, the plugin SHALL resolve
each value by checking, in order: the corresponding Maven system property
(`-Dtestpulse.<name>=...`), then the corresponding `<configuration>`
element in the plugin's pom.xml declaration, using the first one present.
For `token`, the plugin SHALL additionally check the `TESTPULSE_TOKEN`
environment variable, consulted between the system property and the pom
configuration (system property, then env var, then pom configuration) —
since a token is a secret that should not need to be written into a `-D`
flag or committed pom.

#### Scenario: System property overrides pom configuration
- **WHEN** the plugin's pom declaration configures
  `<configuration><url>https://a.example</url></configuration>` and the
  build runs with `-Dtestpulse.url=https://b.example`
- **THEN** the plugin submits to `https://b.example`

#### Scenario: Env var is used for the token when no system property is set
- **WHEN** `TESTPULSE_TOKEN=t0k3n` is set in the environment and no
  `-Dtestpulse.token` system property is passed
- **THEN** the plugin authenticates using `t0k3n`

#### Scenario: System property overrides the token env var
- **WHEN** `TESTPULSE_TOKEN=env-token` is set in the environment and the
  build runs with `-Dtestpulse.token=cli-token`
- **THEN** the plugin authenticates using `cli-token`

### Requirement: Submission outcome maps to build exit behavior
The `submit` goal SHALL submit the annotated report to `POST
/api/v1/projects/{projectKey}/imports` (per the `execution-import`
capability) and SHALL interpret the response as follows: a `201`
response SHALL leave the build outcome unaffected and SHALL log a
summary of matched count and created run; a `207` response SHALL, by
default, leave the build outcome unaffected while logging the unmatched
case keys and a pointer to the `failOnUnmatched` setting, and SHALL
instead fail the build when `failOnUnmatched` is enabled; any other
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
  case key alongside a message naming `failOnUnmatched` as the way to
  make this a hard failure

#### Scenario: Some tests unmatched, failOnUnmatched enabled
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and `failOnUnmatched` is enabled (by any of its config sources)
- **THEN** the build fails, even if every individual test passed

#### Scenario: Submission error always fails the build
- **WHEN** the submission request fails outright (network error, `401`,
  `400`, or `5xx`), regardless of the `failOnUnmatched` setting
- **THEN** the build fails
