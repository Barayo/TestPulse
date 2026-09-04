## Context

`add-execution-import` (#38) shipped `POST
/api/v1/projects/{projectKey}/imports`, matching `<testcase>` entries in a
JUnit XML report to existing cases by a `testpulse_case_key` `<property>`.
Issue #58 tracked installable plugins for the major JUnit-XML-producing
ecosystems; it was split into #154 (pytest, shipped), #155 (npm/Jest,
shipped), #156 (Maven, shipped), #157 (Gradle, shipped), #169 (Go,
shipped), #170 (.NET/xUnit, this change).

.NET's `dotnet test` has no built-in JUnit XML output. The de facto
standard tool, `JunitXml.TestLogger` (`dotnet test --logger:junit`) —
confirmed via reading the package's own GitHub repo — explicitly does
**not** support writing `<properties>` into its output ("the logger
currently does not log any properties," per the maintainers). This is the
same fundamental gap Surefire and Gradle's own JUnit XML writer had,
solved the same proven way: a reflection-only post-processor that injects
`<properties>` after the fact, no test-runtime extension. Unlike Java,
.NET test projects compile to a single assembly (`.dll`) per test
project, not many `.class` files — simpler to load than the JVM plugins'
`TestClassLoader`.

**How the post-processor gets triggered went through a real, implementation-time
correction, not just research.** The original draft of this design proposed
auto-wiring via a `.targets` file's `AfterTargets="VSTest"` hook (the
mechanism `coverlet.msbuild` documentation references), reasoning that
.NET's MSBuild — unlike Go's total absence of a plugin/hook system —
would let this plugin match Gradle/Maven's "one command does everything"
convenience. That reasoning about *which* mechanism to use turned out to
be wrong in a way research alone couldn't have caught: a real isolated
repro (a throwaway `.targets` file with `AfterTargets="VSTest"` printing
a message, against a project with one genuinely failing `[Fact]`) showed
the message never printed — confirmed via a full MSBuild diagnostic log
(`-v diag`) that the custom target was never even scheduled. The cause:
`VSTestTask` returns `false` on a failing test run without logging an
explicit error, and MSBuild's default behavior aborts the rest of the
requested target graph — including `AfterTargets`-attached targets —
once a task fails, the same class of "silently skipped whenever the
thing you most need it for happens" trap the Gradle plugin's original
`dependsOn`/`finalizedBy` wiring fell into, but rooted in MSBuild's core
task-failure semantics rather than a task-ordering subtlety.

The real, verified fix: implement the post-processor as a **custom
VSTest logger extension** (`ITestLogger`/`ITestLoggerWithParameters`,
the same extensibility point `JunitXml.TestLogger` itself is built on),
not an MSBuild target at all. VSTest invokes every registered logger's
`TestRunComplete` handler when the run finishes, pass or fail — this was
independently confirmed with the identical isolated-repro discipline: a
minimal custom logger registered against the same failing-test project
correctly received `TestRunComplete` (`IsCanceled=False,
IsAborted=False`). Auto-wiring without requiring the user to pass any
`--logger`/`--test-adapter-path` CLI flags is still possible, and still
preserves the "one command does everything" goal: `dotnet test --logger:junit`
itself is shorthand for the MSBuild property `$(VSTestLogger)`, which
`Microsoft.TestPlatform.targets` reads to build the real VSTest
invocation — confirmed by setting `<VSTestLogger>`/
`<VSTestTestAdapterPath>` directly in a test project's `.csproj` (no CLI
flags at all) and observing a plain `dotnet test` still discovered and
ran the custom logger, failure survival included. A package's own
`.props` file can set these same properties as defaults (guarded by
`Condition=" '$(VSTestLogger)' == '' "` so an explicit user choice isn't
clobbered), achieving the auto-wiring goal through a mechanism that is
provably immune to the failure-abort problem, rather than one that
merely resembles a working precedent.

## Goals / Non-Goals

**Goals:**
- Auto-wire a VSTest logger extension so a plain `dotnet test` both
  annotates the report and submits it, matching Gradle/Maven's parity
  rather than Go's CLI-only approach — verified via real repro to survive
  test failures, unlike the `AfterTargets="VSTest"` approach originally
  proposed (see Context).
- Screenshot/file attachments in v1 (deferred by `testpulse-maven-plugin`
  only), with the same per-test trust boundary the Gradle/Go plugins
  established, adapted to xUnit's lack of a direct "current test" handle.
- A dry-run preview, matching the parity already established by
  `testpulse-jest`/`testpulse-gradle-plugin`/`testpulse-go`.

**Non-Goals (v1):**
- NUnit, MSTest — xUnit only, matching the issue's own framing ("xUnit
  most used") and the established "one framework per plugin" precedent.
- `[Theory]` (parameterized) tests entirely, for annotation-matching
  purposes — a `<testcase>` xUnit has decorated with a Theory invocation
  suffix is left unmodified (no `testpulse_case_key` property injected at
  all), exactly matching every other plugin's exact-match-only rule for
  a decorated/parameterized test name (Maven/Gradle: "a parameterized
  test invocation is left unmodified"). An earlier draft of this design
  incorrectly claimed Theory invocations "share one case key" for
  property injection — caught as a real cross-document contradiction in
  gating review: since `execution-import` only matches a `<testcase>`
  via its own `testpulse_case_key` property, and Theory invocations never
  get one injected, any attachment collected during a `[Theory]` test
  would be silently dropped at submit time (an unmatched case's
  attachments are dropped, not orphaned, per `run-result-attachments`).
  Consequence: `TestPulseCaseAttribute` on a `[Theory]` method is a
  documented no-op for both property injection and attachments — the
  annotate step SHALL log a build-time warning naming any `[Theory]`
  method it finds carrying `[TestPulseCase]`, so this isn't discovered
  by a user as a silent data loss.
- A separate attributes-only NuGet package (unlike Maven's
  `testpulse-annotations` split) — there is no second .NET build tool
  that would need to consume just the attribute in isolation the way
  both Maven and Gradle needed to share it, so a split would be pure
  ceremony.

## Decisions

### Repo & packaging
New public repo `Barayo/testpulse-dotnet`, MIT license, single combined
NuGet package `TestPulse.MSBuild`, targeting `net8.0`+, depending on
`xunit.v3.extensibility.core` (test-scoped — required specifically for
`TestContext.Current`, see the Attachments decision below) and
`Microsoft.TestPlatform.ObjectModel` (for the `ITestLogger` extensibility
surface itself). **No dependency on `JunitXml.TestLogger`** — an earlier
draft of this design depended on it as a normal, transitively-flowing
`PackageReference` for its JUnit XML output, but this was dropped
entirely during implementation (see Reflection-based property injection
below) once `TestPulseLogger` was rebuilt to construct its own JUnit XML
report directly from `TestResult` events. The package ships its own
compiled VSTest logger extension (built as a separate
`TestPulse.TestLogger.dll` — the naming convention VSTest's own extension
discovery relies on, confirmed empirically: an assembly named merely
`ProbeLogger.dll` was not discovered via `--test-adapter-path`, but
renaming it to `Probe.TestLogger.dll` was) inside `build/tools/`,
referenced via the package's own `.props` file (see Auto-wiring below).

### Tagging via a dedicated attribute, not xUnit's own `[Trait]`
```csharp
[TestPulseCase(caseKey: "LOGIN-42", platform: "linux", tags: new[] { "smoke" })]
[Fact]
public void LoginSucceeds() { /* ... */ }
```
`TestPulseCaseAttribute` is a plain custom attribute class, discoverable
via `MethodInfo.GetCustomAttribute<TestPulseCaseAttribute>()` —
confirmed this does **not** require xUnit's `ITraitDiscoverer`/
`ITraitAttribute` extensibility machinery, which exists to integrate with
Test Explorer's own trait UI and isn't needed here. Reusing xUnit's own
`[Trait]` was considered and rejected: `[Trait]` is a flat string
key/value pair with no first-class way to express the optional
platform/version/tags shape the other four plugins' annotation already
established, and would couple this plugin to xUnit's own trait-discovery
pipeline for no benefit.

### Reflection-based property injection (same lineage as Maven/Gradle), building JUnit XML directly rather than post-processing a second logger's file
The original draft of this design (like Maven/Gradle) planned to
post-process a report file `JunitXml.TestLogger` had already written,
depending on VSTest's logger-registration-order to guarantee that file
existed by the time `TestPulseLogger` ran. **That plan was abandoned
during implementation**, not merely refined: `$(VSTestLogger)` — the
MSBuild property that registers loggers for a plain `dotnet test` run —
cannot combine two independently-named loggers into one run. Setting it
to `"junit;testpulse"` silently drops one of the two (confirmed
empirically, and consistent with a documented VSTest CLI behavior change
since SDK 6.0.300); each name works fine alone. This is a real VSTest
platform limitation, not fixable through any MSBuild property syntax
variation (a semicolon-separated list and `VSTestCLIRunSettings` were
both tried).

The fix: `TestPulseLogger` builds its own JUnit XML report directly from
the `TestResult` events it already observes, with no dependency on a
second logger at all. Inside its `TestRunComplete` handler
(`Internal/JUnitReportBuilder.cs`):
1. Accumulates one `ObservedResult` (class, method, display name,
   duration, outcome, error message/stack trace) per `TestResult` event
   received during the run — no file is read.
2. Loads the compiled test assembly via `Assembly.LoadFrom` (its path
   comes directly from `TestCase.Source` on the first observed result —
   a VSTest-supplied, process-independent value, not derived from either
   process's own notion of "base directory"; see the `TestOutputDir`
   discovery below).
3. Reflects over the assembly's types/methods for `[TestPulseCase]`,
   matching each to an accumulated result by class+method name —
   exact-match-only: a decorated `[Theory]` invocation name or a
   class+name that resolves to more than one method (an overload) is
   left unmodified with a logged note, not guessed at — same rule as
   every prior plugin.
4. Builds `<testsuites><testsuite><testcase>` XML directly via
   `System.Xml.Linq`, injecting `testpulse_case_key`/`testpulse_platform`/
   `testpulse_version`/`testpulse_tags` as `<property>` elements at
   construction time (no read-modify-write step, so the XXE-hardening
   concern a post-processor would need doesn't apply here at all — there
   is no untrusted XML being parsed).
5. Submits the report plus attachments to TestPulse's import API.

This removes the `JunitXml.TestLogger` dependency, the multi-logger
limitation, and the registration-order assumption the original design was
carrying, all in one change.

### Auto-wiring via a custom VSTest logger, not `AfterTargets="VSTest"`
**This mechanism was corrected during implementation, not merely
researched — see Context above for the full isolated-repro story.** The
original `AfterTargets="VSTest"` MSBuild-target design was disproven by a
real repro (the target was never scheduled at all when the underlying
test genuinely failed — confirmed via an MSBuild diagnostic log, the
exact class of bug that bit the Gradle plugin's `dependsOn`/
`finalizedBy` wiring, but rooted one layer deeper, in MSBuild's own
task-failure-aborts-the-target-graph default behavior rather than a
task-ordering subtlety).

The verified replacement: a custom VSTest logger extension,
`TestPulseLogger` (`ITestLogger`, the same extensibility point
`JunitXml.TestLogger` itself uses), auto-wired via default MSBuild
properties in the package's own `.props` file:
```xml
<!-- build/TestPulse.MSBuild.props, packaged inside TestPulse.MSBuild -->
<Project>
  <PropertyGroup>
    <VSTestLogger Condition=" '$(VSTestLogger)' == '' ">testpulse</VSTestLogger>
    <VSTestTestAdapterPath Condition=" '$(VSTestTestAdapterPath)' == '' ">$(MSBuildThisFileDirectory)tools</VSTestTestAdapterPath>
  </PropertyGroup>
</Project>
```
Confirmed via a real isolated repro (a minimal custom logger, registered
purely through `<VSTestLogger>`/`<VSTestTestAdapterPath>` csproj
properties with **zero CLI flags**) that a plain `dotnet test` both
discovers the logger automatically and correctly still receives
`TestRunComplete` when the underlying test genuinely fails
(`IsCanceled=False, IsAborted=False`) — the two properties this design
depends on (auto-wiring, and surviving failure) verified together in one
repro, not assumed separately. `Condition=" '$(VSTestLogger)' == '' "`
means a consumer who already sets their own `--logger`/`<VSTestLogger>`
isn't silently overridden — this plugin's logger simply isn't added in
that case, a documented limitation (README) rather than a silent
conflict.

### Attachments: xUnit needs call-site identification, unlike Go
```csharp
public static void Attach(string caseKey, byte[] data, string filename, string contentType)
```
Unlike Go's `Attach(t, caseKey, ...)`, which receives the actual running
test's handle directly as an argument, xUnit test methods have no
argument-based handle to pass. Three mechanisms were considered:
- **`System.Diagnostics.StackTrace`-based inference** (the .NET analogue
  of Gradle's `StackWalker`): walk the call stack to find the nearest
  frame whose method carries a `[Fact]`/`[Theory]` attribute.
- **A custom `BeforeAfterTestAttribute`** (xUnit's own extensibility hook
  for wrapping test execution) hand-rolling an `AsyncLocal<MethodInfo>`
  slot, set before the test body runs and read by `Attach`.
- **xUnit v3's own first-party `TestContext.Current`** — an ambient,
  `AsyncLocal`-backed test context xUnit itself introduced specifically
  for this class of problem (confirmed via xUnit's own source: `static
  readonly AsyncLocal<TestContext?>` in `xunit.v3.core`), exposing
  `TestContext.Current.TestMethod` (`null` outside an active test).

**Chosen: xUnit v3's `TestContext.Current`, requiring the `xunit.v3`
package (not `xunit` v2).** An earlier draft of this design chose to
hand-roll the second option — a custom `BeforeAfterTestAttribute` plus a
raw `AsyncLocal<MethodInfo>` — reasoning that xUnit had no built-in
ambient context. That was wrong: xUnit v3 (current, GA) already ships
exactly this capability, built by the xUnit team against their own
scheduler and already handling the same async-continuation-hop concern
this design was solving from scratch. Depending on it directly removes
an entire category of risk this design would otherwise be carrying as
its own (whether a hand-rolled `AsyncLocal` genuinely survives every
xUnit scheduling path, including ones not exercised by this plugin's own
tests) — the same reasoning as reusing `JunitXml.TestLogger`/gotestsum
rather than writing a second JUnit-XML-writer: don't rebuild what the
ecosystem's own maintainers already built and vetted. This does mean
`testpulse-dotnet` requires `xunit.v3` specifically; xUnit v2 projects
would need to upgrade to use this plugin — stated explicitly here as a
real, deliberate version-floor trade-off, the same kind of explicit
floor Go's `t.Attr` (Go 1.25+) already established as an acceptable
pattern for this project's plugins.

Three fixes carry over from (or were newly caught during) Luis's reviews
of this and the Gradle/Go plugins:
1. **Per-test case-key check, with an explicit null-context error.** A
   small wrapper reads `TestContext.Current.TestMethod` and that
   method's own `[TestPulseCase]` attribute (one per method, matching
   every other plugin's one-case-key-per-test scope — `AllowMultiple =
   false`; the "multiple attachments per case key" scenario below is
   about repeated `Attach` calls within one test, not multiple case keys
   on one method). `Attach` rejects (throws) unless the passed `caseKey`
   equals that declared case key —
   the same protection Gradle's class-level allowlist and Go's per-test
   allowlist provide, scoped per-method here (xUnit has no meaningful
   "which class is this" ambiguity the way reflection-only Gradle did,
   since the ambient slot already pins the exact method). **A null
   `TestContext.Current.TestMethod` (no active test context — e.g.
   `Attach` called from constructor/`IAsyncLifetime` fixture code, or
   from an un-awaited fire-and-forget `Task` a test started) SHALL throw
   a distinct, clearly-worded error** ("Attach called outside an active
   TestPulse test execution"), never silently succeed and never surface
   as an unexplained null-reference exception a user might work around by
   suppressing — caught in gating review as an unspecified case the
   original draft left to chance.
2. **Invocation-unique storage: an explicit per-attachment sidecar, not a
   shared index.** Each `Attach()` call writes two files: the raw image
   bytes named `hash(caseKey + a GUID generated fresh inside that call)`,
   and a small per-attachment JSON sidecar (case key, filename, content
   type) beside it — the same shape `testpulse-go`'s `attachments.go`
   uses. This is stated explicitly here because gating review found the
   original draft asserted "no locking needed" without ever specifying
   *how* the submit step would recover which case key a hashed filename
   belongs to — a hash is one-way, so grouping-by-case-key at submit time
   requires either this per-attachment sidecar (no shared mutable state,
   so the "no locking needed" claim holds) or some shared/appended index
   (which would NOT be lock-free, the same class of bug Luis's Go review
   caught in an unsynchronized shared map). This design uses the sidecar
   approach specifically to keep the no-locking property true, not as an
   assumption.
3. **A real test that actually exercises concurrency, not just parallel
   *scheduling intent*.** xUnit's default parallelization unit is the
   *test collection* — by default, a single class is one collection, and
   tests within one class run sequentially; only tests in *different*
   classes (different collections) actually run concurrently by default.
   The concurrency-safety test (tasks.md 4.8) MUST put its two
   `Attach`-calling tests in separate classes for this reason, and MUST
   assert genuine overlap occurred (e.g. both tests block on a shared
   `ManualResetEventSlim`/barrier until both have started, rather than
   just asserting the end-state files are correct) — a test whose two
   calls never actually overlap in time would pass regardless of whether
   the "no locking needed" claim is true, giving false confidence in the
   single riskiest claim in this design.

`[Theory]` invocations are out of scope for `Attach` too, as a direct
consequence of Non-Goals above: since a Theory `<testcase>` never gets a
`testpulse_case_key` property, any case matched from one is never created
by import, so an attachment collected during a Theory test would have
nothing to attach to. The "multiple attachments under one case key"
scenario (spec.md) is instead motivated by an ordinary `[Fact]` calling
`Attach` more than once within itself (e.g. capturing two screenshots
during one test), not by Theory invocations.

Storage is a `.testpulse/` scratch directory via real disk I/O, since
`Attach` calls happen during the test run itself while `TestPulseLogger`'s
`TestRunComplete` handler (which reads and submits them) runs afterward,
and multiple test assemblies in a solution each get their own test
process. On-disk filenames are
derived from a hash, never from the caller-supplied `filename` argument
directly — no path-traversal surface from a caller-controlled filename,
the same property `testpulse-go`'s attachment storage has. Only
`image/png`, `image/jpeg`, `image/webp` accepted, same allow-list as
every other plugin.

### Submission, dry run, and exit-code behavior
Same 201/207/error policy already shipped identically in all four prior
plugins:

| Response | Behavior |
|---|---|
| `201` all matched | build succeeds; summary logged |
| `207` some unmatched | build succeeds by default (unmatched keys logged, points at the fail-on-unmatched setting); fails the build if it's enabled |
| network/auth/4xx/5xx error | always fails the build, unconditionally |

A dry-run mode does a read-only `GET /api/v1/projects/{projectKey}/cases`
preview instead of submitting, matching testpulse-jest's/
testpulse-gradle-plugin's/testpulse-go's parity.

### Failing the build: a hybrid of the logger and a narrow AfterTargets check
A VSTest `ITestLogger` has no mechanism to affect the overall `dotnet
test` exit code by itself — a thrown exception inside a logger's event
handler doesn't propagate to fail the build (VSTest's logger framework
isolates logger failures from the test run's own result). Discovered
during implementation, the same "verify, don't assume" way the
`AfterTargets`-doesn't-survive-failure problem was found. The fix is a
narrow, verified-safe use of `AfterTargets="VSTest"` alongside the
logger, not instead of it:

- `TestPulseLogger`'s `TestRunComplete` handler (reliable regardless of
  pass/fail, per the earlier finding) does the real work — annotate,
  submit, dry-run preview — and writes a small `.testpulse/result.json`
  marker recording whether submission itself failed or was unmatched
  with fail-on-unmatched enabled.
- A packaged `.targets` file defines a **second**, narrow
  `AfterTargets="VSTest"` target that reads that marker (if present) and
  fails the build via an MSBuild `<Error>` task if it indicates failure.

This composition is safe specifically because of what was verified,
independently, for each half: the logger reliably runs on both pass and
fail (first repro); a *plain, successful* `VSTestTask` reliably schedules
its `AfterTargets` targets, and an `<Error>` task inside one genuinely
sets a non-zero exit code (confirmed via a second isolated repro: a
passing-tests project with an `AfterTargets="VSTest"` target containing
a conditional `<Error>`, run with `dotnet test`, exited `0` normally and
exited `1` when the condition was forced true). The one case this
combination cannot separately signal is "tests failed AND submission
also failed for an unrelated reason (e.g. a bad token)" — in that case
the `AfterTargets` check is not guaranteed to run, but this is not a
silent failure: the build's exit code is already non-zero from the test
failure itself (the correct outcome), and the logger's own console
output already reported the submission failure detail regardless of
whether the `AfterTargets` check ran.

**Two further implementation-time corrections, both caught the same
"verify, don't assume" way.** First, `TestPulseLogger` (running inside
VSTest's "driver" process — `dotnet`/`vstest.console`) initially derived
its output/marker directory from `AppContext.BaseDirectory`, matching
what `Attach()` (running inside the separate "test host" process) already
used. This was wrong: confirmed empirically that the driver process's
`AppContext.BaseDirectory` resolves to the .NET SDK's own install
directory (e.g. `/usr/share/dotnet/sdk/8.0.424/`), not the test project's
build output — the two processes have entirely different notions of
"base directory," a distinction the original design didn't anticipate
because it hadn't yet drawn the driver-process/test-host-process boundary
explicitly. The fix: `TestPulseLogger` derives its output directory
(`TestOutputDir`) from `Path.GetDirectoryName` of the test assembly's own
path — a value VSTest hands the logger directly via `TestResultEventArgs`,
independent of either process's ambient state — while `Attach()` keeps
using its own process's `AppContext.BaseDirectory`, since the two
processes' build-output-relative paths happen to coincide there. Second,
the packaged `.targets` file's build-failure check initially tried to
test the marker file's content with
`$([System.String]::new('@(TestPulseResultLines)').Contains(...))`,
embedding an `@(ItemName)` reference inside a quoted MSBuild function-call
argument — this does not reliably expand and the `<Error>` condition
silently never matched. Fixed by assigning the item to a plain property
first (`<TestPulseResultContent>@(TestPulseResultLines)</TestPulseResultContent>`)
and using the standard `$(TestPulseResultContent.Contains(...))`
property-function syntax against that property instead.

### Config: environment variables, set directly or bridged from MSBuild properties by an inline task
`TestPulseLogger` runs in VSTest's driver process, a separate OS process
from the one that later spawns it — it reads plain environment variables,
never MSBuild properties directly. Getting an MSBuild property's value
into that specific process's environment took three attempts, and only
the third was verified to actually work; each is recorded here because
each looked plausible before being tried against the real mechanism:

1. **`VSTestEnvironment`** (the real, MSBuild-recognized item for mapping
   properties into environment variables) — rejected after confirming
   empirically that it only injects variables into the spawned *test
   host* process, never into the separate *driver* process
   `TestPulseLogger` itself runs in. A value set purely via an MSBuild
   property never reached `Config.Resolve()` under this design.
2. **Embedding `Key=Value` pairs into `$(VSTestLogger)`** itself (e.g.
   `testpulse;Url=$(TestPulseUrl)`), on the theory that
   `ITestLoggerWithParameters` would receive them as logger parameters —
   rejected two different ways. First, `$(VSTestLogger)` turned out to be
   a semicolon-delimited *list of loggers*, not a single
   `name;Key=Value` parameter string: VSTest split
   `"testpulse;Url=http://..."` into separate, mostly-invalid logger
   entries ("The Test Logger URI 'Url=' is not valid"), the exact same
   splitting behavior already responsible for the "`junit;testpulse`
   silently drops one" discovery elsewhere in this design — both are
   instances of one underlying fact about this property, not two
   unrelated bugs. Second, even after routing the values through a
   properly-generated `.runsettings` file's `Logger`/`Configuration`
   block instead (VSTest's own documented logger-configuration
   mechanism), a diagnostic probe proved `Initialize`'s `parameters`
   dictionary only ever contained VSTest's own built-in entries
   (`TestRunDirectory`, `TargetFramework`) — `RunSettings`
   `Logger`/`Configuration` values are evidently not generically
   forwarded into `ITestLoggerWithParameters` for third-party loggers.
3. **An inline `RoslynCodeTaskFactory` MSBuild task calling
   `Environment.SetEnvironmentVariable` directly**, `BeforeTargets="VSTest"`
   — the one that actually worked, confirmed by a real submission against
   a running TestPulse instance with `TestPulseUrl`/`TestPulseProject`
   set purely as csproj properties and only `TESTPULSE_TOKEN` set
   directly. Since this inline task runs in-process, before `VSTestTask`
   spawns the driver subprocess, the environment variable it sets is
   simply inherited by that child process the same way any child process
   inherits its parent's environment — no VSTest-specific bridging
   mechanism needed at all. `TestPulseLogger` itself needs no code for
   this: by the time its `Initialize` runs, the variable is already a
   real part of its process's environment, indistinguishable from having
   been exported by the user directly.

```xml
<!-- consumer's .csproj -->
<PropertyGroup>
  <TestPulseUrl>http://localhost:8080</TestPulseUrl>
  <TestPulseProject>LOGIN</TestPulseProject>
  <TestPulseFailOnUnmatched>false</TestPulseFailOnUnmatched>
</PropertyGroup>
```
```sh
dotnet test /p:TestPulseUrl=https://ci.example
```
Because MSBuild itself resolves the command-line-override-vs-csproj-property
precedence *before* the inline task runs, `TestPulseLogger` only needs to
read one final value per setting, not implement a multi-tier resolver
itself:

| Setting | MSBuild property (csproj default or `/p:` override) | Environment variable read by the logger |
|---|---|---|
| API base URL | `<TestPulseUrl>` / `/p:TestPulseUrl=...` | `TESTPULSE_URL` |
| Project key | `<TestPulseProject>` / `/p:TestPulseProject=...` | `TESTPULSE_PROJECT` |
| Fail on unmatched | `<TestPulseFailOnUnmatched>` / `/p:TestPulseFailOnUnmatched=...` | `TESTPULSE_FAIL_ON_UNMATCHED` |
| Dry run | `<TestPulseDryRun>` / `/p:TestPulseDryRun=...` | `TESTPULSE_DRY_RUN` |
| API token | *(none)* | `TESTPULSE_TOKEN` |

The token deliberately has **no MSBuild-property path at all**, unlike
the other four settings — embedding a secret into `$(VSTestLogger)` or a
generated file risks it appearing in verbose build output, so
`TESTPULSE_TOKEN` must always be a directly-set environment variable
(the recommended path for a secret, same as every prior plugin). The
inline task's own `Environment.SetEnvironmentVariable` call is guarded on
the target variable not already being set, so a `TESTPULSE_URL` etc. a
user already set directly in their shell/CI environment passes through
untouched. The resolved token is never logged, at any verbosity level —
carried over explicitly from every prior plugin's discipline.

### Testing approach (TDD)
xUnit-based unit tests for the reflection/XML-rewrite logic and the
attachment allowlist check (HTTP mocked for submission) — the isolated-
fixture-testing pattern used by every prior plugin. A smaller number of
real end-to-end tests that actually invoke `dotnet test` against fixture
test projects: the custom-VSTest-logger-fires-on-failure repro (see
above, done first, replacing the disproven `AfterTargets="VSTest"`
approach), a real cross-method attachment misattribution rejection test
against a real compiled assembly, a real async-continuation test proving
`TestContext.Current` correctly survives a thread hop for this plugin's
own usage of it, and a real cross-collection-parallelization test (two
different test classes, not two tests in the same class — xUnit's
default parallelization unit is the collection, and a single class is one
collection by default) proving concurrent `Attach` calls don't corrupt
each other's stored attachments.

### CI / publishing
- GitHub Actions: `dotnet build` + `dotnet test` on every PR.
- Release: NuGet.org via **Trusted Publishing (OIDC)** — confirmed via
  research this is owner-scoped, not package-scoped (a policy names a
  GitHub repo + workflow file and applies to any package published by
  that NuGet.org account), so unlike npm's OIDC, there is no
  "the package must already exist before trust can be configured"
  bootstrap problem. Requires `permissions: { id-token: write }` and the
  `nuget/login` action to exchange the OIDC token for a short-lived
  publish credential at push time — no long-lived secret stored in the
  repo at all once configured. NuGet API keys are additionally capped at
  30 days as of 2026-08-17 (already in effect), making a classic
  long-lived key a worse choice than it was for the earlier plugins even
  as a fallback.
- Release workflow gated the same way every release workflow this
  session has been: `on: push (main) / workflow_dispatch` only, `if:
  github.repository == 'Barayo/testpulse-dotnet'`, OIDC permissions
  granted only to that job, never a `pull_request`-triggered workflow.
- README: install (`dotnet add package TestPulse.MSBuild`), the
  `[TestPulseCase]` attribute reference, `TestPulseAttachments.Attach()`
  and its allowlist behavior (including the async-continuation caveat),
  config-precedence table, exit-code table, dry-run. CONTRIBUTING:
  unit + real `dotnet test`-driven end-to-end test setup.

## Risks / Trade-offs

- **Library package split**: `TestPulse.MSBuild`'s own `PackageReference`
  is `xunit.v3.extensibility.core` (not the full `xunit.v3` package) —
  confirmed necessary because `xunit.v3` 4.0.0 enforces `OutputType=Exe`
  on any project referencing it (a build-time check, "test projects must
  be executable"), which is correct for actual test projects but wrong
  for a library merely passing `TestContext`/attribute types through to
  consumers. The `xunit.v3.extensibility.core` package (the same package
  the `xunit.v3` error message itself points non-test-project referencers
  toward) contains exactly the extensibility surface needed
  (`TestContext`, attribute base types) without that constraint.
- **Requires `xunit.v3` specifically, not `xunit` v2** — a real version
  floor, the trade-off for depending on `TestContext.Current` rather than
  hand-rolling the same mechanism. Accepted deliberately (see the
  Attachments decision): removes an entire category of risk (whether a
  hand-rolled `AsyncLocal` genuinely survives every xUnit scheduling
  path) that this design would otherwise be carrying as its own, in
  exchange for a version floor — the same trade-off Go's `t.Attr`
  dependency (Go 1.25+) already established as acceptable for this
  project's plugins. Even with xUnit's own vetted mechanism, the real
  async-continuation and cross-collection-concurrency end-to-end tests
  (tasks.md 4.7, 4.8) remain first-class tasks, not skipped as
  "obviously fine because xUnit built it" — this plugin's own usage of
  `TestContext.Current` (populating the allowlist, writing to disk) still
  needs its own verification.
- **NuGet Trusted Publishing is comparatively new** (the 30-day API-key
  cap and the OIDC flow both post-date this session's earlier
  npm/PyPI/Maven-Central publishing work) — mitigated by grounding the
  design in a real article confirming owner-level (not package-level)
  trust scoping, the specific detail that made npm's OIDC painful, rather
  than assuming NuGet's flow works the same way.
- **`$(VSTestLogger)` cannot combine two independently-named loggers into
  one run** — the specific platform limitation that forced the pivot away
  from depending on `JunitXml.TestLogger` at all (see Reflection-based
  property injection above). Recorded here as the second real,
  implementation-time-only discovery this design carries (alongside the
  `AfterTargets="VSTest"` failure-survival problem below): a mechanism
  that looks composable from the MSBuild property docs alone (two logger
  names in a semicolon list) silently isn't, for either mechanism this
  design considered, and both were only caught by trying the real thing
  against a real multi-logger run rather than trusting the documented
  property shape.
- **The `AfterTargets="VSTest"` approach was seriously considered and
  built into an early draft of this design before being disproven by a
  real repro during implementation** — recorded here (not just quietly
  deleted) as the direct evidence that "a real-world package uses a
  similar-sounding mechanism" (`coverlet.msbuild`'s `AfterTargets`
  documentation) is not sufficient grounds to trust a mechanism for a
  failure-survival guarantee; only an isolated repro against the actual
  failure scenario is. The corrected custom-VSTest-logger mechanism was
  verified the same way, not simply substituted on faith.
- **Coupling to the JUnit XML schema TestPulse's own import endpoint
  expects**, which has no formal versioned contract — same risk already
  accepted for every other JUnit-XML-producing plugin, mitigated the same
  way: targeting the long-stable subset (`<testcase classname name>`,
  `<properties><property name value>`). Building the report directly
  (rather than post-processing a third-party tool's output) means this is
  now the only external schema dependency this plugin carries.

## Open Questions

None outstanding.
