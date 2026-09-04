# dotnet-import-plugin

## Purpose

The `testpulse-dotnet` package's observable contract — the
`[TestPulseCase]` attribute for tagging xUnit v3 tests, the auto-wired
annotate/submit behavior on a plain `dotnet test` (including its
match-only, exact-method-name-only scope), the `TestPulseAttachments.Attach`
API's test-identity/allowlist mechanism, config resolution, build-outcome
policy, and dry-run behavior. The plugin itself ships as its own public
NuGet package (`Barayo/testpulse-dotnet`, `TestPulse.MSBuild`); this spec
describes what it must do, not how it's implemented.

## Requirements

### Requirement: Case linkage via a dedicated attribute
The plugin SHALL provide a `TestPulseCaseAttribute` applicable to xUnit
`[Fact]`/`[Theory]` test methods, with a required `caseKey` and optional
`platform`/`version`/`tags` values. For each test method carrying this
attribute, the plugin SHALL write `testpulse_case_key`, and whichever of
`testpulse_platform`/`testpulse_version`/`testpulse_tags` were supplied
(non-default), as `<property>` entries under that test's `<testcase>` in
the JUnit XML report it generates from the test run, matching the
property names the `execution-import` capability's importer already
reads. The plugin SHALL NOT reuse xUnit's own `[Trait]` attribute for
this purpose.

#### Scenario: A tagged test's case key is recorded as a property
- **WHEN** a test method is attributed `[TestPulseCase(caseKey:
  "LOGIN-42")]` and the project runs `dotnet test`
- **THEN** the corresponding `<testcase>` in the generated report
  contains a `<property name="testpulse_case_key" value="LOGIN-42"/>`

#### Scenario: Optional metadata is recorded only when supplied
- **WHEN** a test method is attributed `[TestPulseCase(caseKey:
  "LOGIN-42", platform: "linux", tags: new[] { "smoke" })]` (no version)
- **THEN** its `<testcase>` gains `testpulse_platform` and
  `testpulse_tags` properties, and no `testpulse_version` property

#### Scenario: An untagged test carries no TestPulse properties
- **WHEN** a test method carries no `TestPulseCaseAttribute`
- **THEN** its `<testcase>` entry carries no `testpulse_case_key`
  property after the annotate step runs

### Requirement: Annotation matching is exact-method-only
The annotate step SHALL only inject properties for a `<testcase>` whose
`name` maps to exactly one compiled test method via reflection. A
`<testcase>` whose name xUnit has decorated (a `[Theory]` invocation
suffix) or whose class+name resolves to more than one method (an
overload) SHALL be left unmodified, and the step SHALL log a note
identifying it rather than guessing at or silently mismatching an
attribute to it.

#### Scenario: A Theory invocation is left unmodified
- **WHEN** a `[Theory]`-attributed method also carries
  `[TestPulseCase(caseKey: "LOGIN-42")]`, producing multiple decorated
  `<testcase>` entries
- **THEN** the annotate step does not inject a property into those
  decorated entries, and logs a note naming them as skipped

#### Scenario: An overloaded method is left unmodified
- **WHEN** a test class has two methods sharing the same name (an
  overload) and one of them carries `[TestPulseCase(caseKey:
  "LOGIN-42")]`
- **THEN** the annotate step does not inject a property for that
  `<testcase>`, since class+name matches more than one method, and logs
  a note naming it as ambiguous

### Requirement: Attachments require the currently-executing test's own declared case key
The plugin SHALL provide `TestPulseAttachments.Attach(caseKey, data,
filename, contentType)`, callable from within a running xUnit test body.
It SHALL identify the currently-executing test method via xUnit v3's own
`TestContext.Current.TestMethod` (requiring the `xunit.v3` package, not
`xunit` v2), and SHALL reject (throw) an `Attach` call whose `caseKey` is
not among that specific method's own `TestPulseCaseAttribute`-declared
case keys. A null `TestContext.Current.TestMethod` (no active test
context — e.g. `Attach` called from constructor/`IAsyncLifetime` fixture
code, or from an un-awaited fire-and-forget `Task`) SHALL throw a
distinct error naming the cause, never silently succeed and never surface
as an unrelated null-reference exception. Only `image/png`,
`image/jpeg`, and `image/webp` content types SHALL be accepted; any other
content type SHALL be rejected. Content type SHALL be validated before
the case-key allowlist check. `TestPulseCaseAttribute` on a `[Theory]`
method SHALL be treated as unsupported: the annotate step SHALL log a
build-time warning naming it, since a Theory `<testcase>` never receives
a `testpulse_case_key` property (see "Annotation matching is
exact-method-only" above) and so cannot be matched or attached to.

#### Scenario: An attachment matching the currently-executing test's own case key is accepted
- **WHEN** `Attach("LOGIN-42", bytes, "failure.png", "image/png")` is
  called from within a test method carrying `[TestPulseCase(caseKey:
  "LOGIN-42")]`
- **THEN** the attachment is registered

#### Scenario: An attachment under a case key belonging to a different test is rejected
- **WHEN** `Attach("OTHER-1", ...)` is called from within a test method
  whose own `TestPulseCaseAttribute`s only declare case keys other than
  `OTHER-1`
- **THEN** the call throws, and no attachment is registered

#### Scenario: An unsupported content type is rejected
- **WHEN** `Attach("LOGIN-42", bytes, "x.pdf", "application/pdf")` is
  called, even from a test that does declare `LOGIN-42`
- **THEN** the call throws and no attachment is registered

#### Scenario: Attach outside an active test context throws a distinct error
- **WHEN** `Attach("LOGIN-42", ...)` is called while
  `TestContext.Current.TestMethod` is null (no active test execution)
- **THEN** the call throws an error distinctly naming that cause, not a
  null-reference exception, and no attachment is registered

#### Scenario: The ambient test identity survives an async continuation on a different thread
- **WHEN** an `async Task` test method carrying `[TestPulseCase(caseKey:
  "LOGIN-42")]` calls `Attach("LOGIN-42", ...)` after an `await` that
  resumes execution on a different thread than the one that started the
  test
- **THEN** the attachment is still correctly attributed to that test and
  accepted, not rejected due to losing the ambient identity across the
  thread hop

#### Scenario: A Theory method carrying TestPulseCase produces a build warning
- **WHEN** a `[Theory]`-attributed method also carries
  `[TestPulseCase(caseKey: "LOGIN-42")]`
- **THEN** the annotate step logs a build-time warning naming the method,
  since no property will be injected for its decorated `<testcase>`
  entries

### Requirement: Multiple attachments under the same case key are all preserved
Since a single `[Fact]` may legitimately call `Attach` more than once
within itself (e.g. capturing two screenshots during one test), and
xUnit's default parallelization may run different test collections
concurrently, the scratch-directory storage mechanism SHALL NOT
deduplicate or overwrite attachments sharing a case key — each call SHALL
produce a distinct stored attachment (a per-attachment sidecar, derived
from the case key plus a fresh identifier generated inside that call, not
the case key alone, with no shared mutable index across calls), and the
submit step SHALL include all of them (grouped under that case key) in
the submitted `attachments` array.

#### Scenario: Two attachments under the same case key both survive
- **WHEN** a single `[Fact]` calls `Attach("LOGIN-42", ...)` twice within
  its own test body, with different file contents each time
- **THEN** both attachments are present in the scratch directory
  afterward, and both are included in the submit request's `attachments`
  array

#### Scenario: Concurrent Attach calls from different test collections do not corrupt each other
- **WHEN** two tests in different test classes (different xUnit test
  collections, xUnit's default parallelization unit — tests within the
  same class run sequentially by default and would not exercise genuine
  concurrency) call `Attach` with their own distinct case key at
  genuinely overlapping times
- **THEN** both attachments are stored correctly, each attributed only to
  its own caller's case key

### Requirement: The annotate/submit step runs even when tests fail
The mechanism that triggers the annotate/submit step SHALL run after
`dotnet test` regardless of whether the tests themselves passed or
failed — mirroring the requirement that closed an equivalent gap in the
`gradle-import-plugin` capability, where task-graph wiring silently
skipped annotate/submit whenever the underlying test run failed. The
plugin SHALL NOT rely on an MSBuild `AfterTargets` hook for this purpose,
since MSBuild's default behavior aborts the remainder of the requested
target graph — including any `AfterTargets`-attached targets — once a
task (such as the built-in `VSTestTask`) fails, which a genuinely failing
test run always does.

#### Scenario: A genuinely failing test still triggers annotate and submit
- **WHEN** a test carrying `[TestPulseCase(caseKey: "LOGIN-42")]`
  genuinely fails, and `dotnet test` is run
- **THEN** the build reports the test failure, AND the annotate/submit
  step still runs and still submits the (failed) result

### Requirement: Configuration is read from environment variables, populated from MSBuild properties or set directly
The plugin (running as a VSTest logger, a separate process from the test
host) SHALL read `TESTPULSE_URL`, `TESTPULSE_TOKEN`, `TESTPULSE_PROJECT`,
`TESTPULSE_FAIL_ON_UNMATCHED`, and `TESTPULSE_DRY_RUN` real environment
variables on its own (driver) process. For `TESTPULSE_URL`,
`TESTPULSE_PROJECT`, `TESTPULSE_FAIL_ON_UNMATCHED`, and
`TESTPULSE_DRY_RUN`, the package SHALL export the corresponding
`<TestPulse<Name>>` MSBuild property (settable via a plain `.csproj`
`<PropertyGroup>` or overridden with `dotnet test /p:TestPulse<Name>=...`)
as that same-named environment variable directly on the process, before
the driver subprocess is spawned, only when that MSBuild property is
actually set and the environment variable isn't already present — so an
environment variable a user already set directly is never overwritten
with an empty value. `TESTPULSE_TOKEN` SHALL have no MSBuild-property
equivalent at all — it SHALL only ever be read as a directly-set
environment variable, never derived from any MSBuild property or
command-line value, and SHALL NOT be logged at any verbosity level.

#### Scenario: A command-line property override reaches the plugin
- **WHEN** the csproj declares `<TestPulseUrl>https://a.example</TestPulseUrl>`
  and the build runs with `dotnet test /p:TestPulseUrl=https://b.example`
- **THEN** the plugin submits to `https://b.example`

#### Scenario: A csproj-property default reaches the plugin with no direct environment variable set
- **WHEN** the csproj declares `<TestPulseUrl>http://localhost:8080</TestPulseUrl>`
  and `<TestPulseProject>LOGIN</TestPulseProject>`, with no
  `TESTPULSE_URL`/`TESTPULSE_PROJECT` environment variable set directly,
  and the build runs `dotnet test`
- **THEN** the plugin submits to `http://localhost:8080` for project
  `LOGIN`

#### Scenario: A directly-set environment variable is used for the token
- **WHEN** `TESTPULSE_TOKEN=t0k3n` is set directly in the environment
- **THEN** the plugin authenticates using `t0k3n`

### Requirement: Submission outcome maps to build exit behavior
The submit step SHALL submit the annotated report (plus any registered
attachments) to `POST /api/v1/projects/{projectKey}/imports` (per the
`execution-import` capability) and SHALL interpret the response as
follows: a `201` response SHALL leave the build outcome unaffected and
SHALL log a summary of matched count and created run; a `207` response
SHALL, by default, leave the build outcome unaffected while logging the
unmatched case keys and a pointer to the fail-on-unmatched setting, and
SHALL instead fail the build when fail-on-unmatched is enabled; any
other outcome (network failure, authentication error, or a `4xx`/`5xx`
response) SHALL unconditionally fail the build, regardless of the
fail-on-unmatched setting.

#### Scenario: All tests matched
- **WHEN** every tagged `<testcase>` in the submitted report matches an
  existing case and the API responds `201`
- **THEN** the build succeeds, and the build log shows the matched count
  and created run

#### Scenario: Some tests unmatched, default configuration
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and fail-on-unmatched is not enabled
- **THEN** the build succeeds, and the build log lists each unmatched
  case key alongside a message naming fail-on-unmatched as the
  escalation path

#### Scenario: Some tests unmatched, fail-on-unmatched enabled
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and fail-on-unmatched is enabled (by any of its config sources)
- **THEN** the build fails, even if every individual test passed

#### Scenario: Submission error always fails the build
- **WHEN** the submission request fails outright (network error, `401`,
  `400`, or `5xx`), regardless of the fail-on-unmatched setting
- **THEN** the build fails

### Requirement: Dry run never submits and never affects build outcome
When dry-run is enabled (by any of its config sources), the submit step
SHALL fetch existing case keys via a read-only `GET
/api/v1/projects/{projectKey}/cases` request, log a match preview
against the case keys discovered by the annotate step, and SHALL NOT
call the import endpoint. The build outcome SHALL be unaffected
regardless of the preview's result.

#### Scenario: Dry run previews matches without submitting
- **WHEN** dry-run is enabled and the current build has both tagged case
  keys that exist in the project and ones that don't
- **THEN** the step logs which case keys would match and which
  wouldn't, makes no request to the import endpoint, and the build
  succeeds
