# Importing results

A CI pipeline can report real test results into TestPulse automatically,
without any manual UI interaction, by posting a JUnit XML report — the
format produced by pytest, Maven Surefire, Gradle, and Jest (via
`jest-junit`).

## The contract

```
POST /api/v1/projects/{projectKey}/imports
{ "format": "junit-xml", "name": "optional run name", "report": "<the XML>" }
```

Each `<testcase>` in the report is matched to an existing TestPulse case by
its **key** (see [Keys](test-management.md#keys)) — not its name, not a
separate identifier, the same short key (`LOGIN-42`) that already addresses
the case everywhere else. The import creates one run, with one item and one
result per matched test.

**Match-only — nothing is auto-created.** A `<testcase>` whose key doesn't
match any case in the project is never turned into a new case; it's simply
reported back as unmatched. This means the import call is never blocked by
an unrecognized test, but the case library is never silently modified by CI
either:

| Outcome | Status | Body |
|---|---|---|
| Every `<testcase>` matched | `201 Created` | The created `Run` |
| Some or all unmatched | `207 Multi-Status` | `{ run, message, matched, unmatched: [{ caseKey, verdict }] }` |
| Malformed report / unknown project | `400` / `404` | `{ "error": "..." }` |

A `207` is still a success from the point of view of any tool that checks
`response.ok` — the run was created with whatever did match. `unmatched`
lists every case key that didn't, so nothing is silently dropped.

A `<testcase>` with **no** case key at all (never tagged) is simply out of
scope for the import — it's excluded entirely, not counted in `matched` or
listed in `unmatched`, since a real suite is expected to be a mix of tagged
and untagged tests, especially mid-rollout. Two `<testcase>` entries
sharing the **same** case key, on the other hand, is rejected as a `400`
naming the duplicated key(s) — an import either succeeds with one result
per matched case, or fails cleanly with no run created; it never creates
two items for the same case in one run.

The run's name defaults to the report's own `<testsuite name="...">` if
present, otherwise a generated `Imported run — <timestamp>`. This fallback
is meant for a genuinely single-suite report — a caller that merges
results from several suites into one report (as a CI job running multiple
spec files typically does) should pass its own `name` explicitly, since
the fallback only ever reflects the report's *first* `<testsuite>`.

**Imported runs are created closed, not open.** Unlike a run created via
`POST /runs` and worked over time, every item in an imported run already
carries a final verdict the moment it's created — there's no "in progress"
state to represent. An actor with `manageProject` permission can still
reopen it via the existing reopen action if further work is needed.

## Execution metadata

Beyond pass/fail, an imported result can carry:

- **`testName`** (on the run item) — the literal name the runner reported
  (e.g. a pytest node id), kept alongside the matched case's own title
  rather than replacing it.
- **`startTime`/`endTime`** (on the result) — derived from the report's own
  `<testsuite timestamp>` and each `<testcase time>` (duration). Only
  populated when the report includes a suite timestamp; never guessed.
- **`platform`, `version`, `tags`** (on the result) — read from the same
  `<properties>` mechanism as the case key.

These same fields are available on a manually-recorded result too (the
existing "record a verdict" UI action) — an import isn't a special path,
it's the same result shape produced automatically.

## Screenshot attachments

An import request can carry screenshots alongside the report, keyed by the
case key of the test each one belongs to — the report's XML itself is
never parsed for embedded images (no shared convention exists across JUnit
tooling for that). Add an `attachments` array to the same request body:

```json
{
  "format": "junit-xml",
  "report": "<the XML>",
  "attachments": [
    { "caseKey": "LOGIN-42", "filename": "failure.png", "contentType": "image/png", "data": "<base64>" }
  ]
}
```

Each attachment is created in the same transaction as the import — a CI
pipeline never needs a second request to attach evidence, and never ends up
with a result that exists without the screenshot it was submitted with. An
attachment whose `caseKey` doesn't match a test that was actually matched to
a case is dropped along with the rest of that unmatched test's data, the
same "no partial artifacts for unmatched tests" rule the rest of the import
follows. See [Test management](test-management.md#screenshot-attachments)
for how attachments render once imported.

## Verdict mapping

| JUnit XML | TestPulse verdict |
|---|---|
| no failure/error/skipped child | `pass` |
| `<failure>` | `failed` |
| `<error>` | `blocked` |
| `<skipped>` | `skipped` |

## Unit test inventory: zero-setup ingestion

Everything above matches each `<testcase>` to an existing, curated test
case by its key — it never auto-creates anything. If you just want to see
which of your *unit* tests pass or fail over time — thousands of
auto-discovered, thin, high-churn entries, not something you'd hand-author
a case for — use the separate unit test inventory endpoint instead. It
accepts whatever JUnit XML your test runner already produces natively, no
`testpulse_case_key` property, no plugin, nothing to install:

```
POST /api/v1/projects/{projectKey}/unit-test-results/import
{ "report": "<the XML>" }
```

Every `<testcase>` in the report becomes (or updates) a unit test
identified by its own `classname`/`name` attributes — there's no
match-or-skip branch, and no run is created. The response is
`{ "imported": <count>, "created": <count>, "updated": <count> }`.

```bash
pytest --junitxml=report.xml   # no --testpulse-* flags, no plugin
curl -s -X POST http://localhost:8080/api/v1/projects/LOGIN/unit-test-results/import \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TESTPULSE_TOKEN" \
  -d "$(jq -n --rawfile report report.xml '{report: $report}')"
```

**Retrying is safe.** CI systems retry failed uploads, and a naive retry
would otherwise insert a duplicate result. Pass a stable
`idempotencyKey` and a retry with the same key returns the original
response instead of re-ingesting:

```json
{ "report": "<the XML>", "idempotencyKey": "run-482913" }
```

**No continuity across renames.** A unit test's identity is its
`(classname, name)` pair, read as-is from the report. Rename or move the
test and it becomes a new, independent entry with no history carried
over — this is a deliberate simplification for an auto-discovered,
high-churn surface, unlike a curated case's stable key.

**History is bounded, not unlimited.** Only the most recent results per
test are retained (a server-side limit, not configurable per project in
this release) — pruned automatically as new results arrive, so the table
doesn't grow without bound regardless of how often CI reports.

Read the data back with:

```
GET /api/v1/projects/{projectKey}/unit-test-results?verdict=failed
GET /api/v1/projects/{projectKey}/unit-test-results/{classname}::{name}/history
```

The first lists every test's current status (optionally filtered to one
verdict); the second returns one test's bounded history, newest first.
Both require only the `read` permission, same as any other project data.
An agent connected over MCP has the same read access via the
`list_unit_test_results` tool — see [MCP server](mcp-server.md). There is
no web UI for this data in this release; it's an API/agent-facing
capability for now.

## pytest: `pytest-testpulse` plugin

The recommended way to report pytest results is the installable
[`pytest-testpulse`](https://github.com/Barayo/pytest-testpulse) plugin —
it wraps the same marker/`record_property()` mechanism documented below,
and also submits the report itself, so no separate `curl` step is needed:

```bash
pip install pytest-testpulse
```

```python
@pytest.mark.testpulse("LOGIN-42", platform="linux", tags=["smoke"])
def test_login_succeeds():
    ...
```

```bash
pytest --junitxml=report.xml \
  --testpulse-url=http://localhost:8080 \
  --testpulse-project=LOGIN
# or via TESTPULSE_URL / TESTPULSE_TOKEN / TESTPULSE_PROJECT env vars
```

By default, some tests having no matching case (`207`) is a warning, not a
build failure — matching this API's own contract that an unmatched test
never fails the import. Pass `--testpulse-fail-on-unmatched` once a suite
is fully annotated to make that a hard failure instead. A
`--testpulse-dry-run` flag previews matches via a read-only cases fetch,
without submitting anything. See the plugin's own README for the full
config-precedence and exit-code reference.

## pytest: `conftest.py` (no-install fallback)

Without installing anything, pytest's built-in `record_property()` +
`--junitxml` combination is enough to carry a case key through — this is
also the mechanism the plugin above wraps. Add a marker and a fixture:

```python
# conftest.py
import pytest

def pytest_configure(config):
    config.addinivalue_line(
        "markers", "testpulse(case_key, platform=None, version=None, tags=None): "
                    "link this test to a TestPulse case for result import"
    )

@pytest.fixture(autouse=True)
def _testpulse_case_link(request, record_property):
    marker = request.node.get_closest_marker("testpulse")
    if marker is None:
        return
    case_key = marker.args[0] if marker.args else marker.kwargs.get("case_key")
    if case_key:
        record_property("testpulse_case_key", case_key)
    if marker.kwargs.get("platform"):
        record_property("testpulse_platform", marker.kwargs["platform"])
    if marker.kwargs.get("version"):
        record_property("testpulse_version", marker.kwargs["version"])
    if marker.kwargs.get("tags"):
        record_property("testpulse_tags", ",".join(marker.kwargs["tags"]))
```

Tag a test and run with `--junitxml`:

```python
@pytest.mark.testpulse("LOGIN-42", platform="linux", tags=["smoke"])
def test_login_succeeds():
    ...
```

```bash
pytest --junitxml=report.xml
curl -s -X POST http://localhost:8080/api/v1/projects/LOGIN/imports \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TESTPULSE_TOKEN" \
  -d "$(jq -n --rawfile report report.xml '{format: "junit-xml", report: $report}')"
```

Prefer the `pytest-testpulse` plugin above for anything beyond a quick,
no-install test — this snippet is best suited to environments that can't
add a dependency.

## Maven: `testpulse-maven-plugin`

Surefire (Maven's test runner) has no equivalent to pytest's
`record_property()` — no built-in way to write custom per-test properties
into its JUnit XML report at all. The
[`testpulse-maven-plugin`](https://github.com/Barayo/testpulse-maven-plugin)
plugin works around this with a reflection-based post-processor: after
Surefire runs, it loads your compiled test classes, matches each
`<testcase>` to its
[`@TestPulse`](https://github.com/Barayo/testpulse-annotations)-annotated
method, and rewrites the report — then submits it, the same way
`pytest-testpulse` does.

```xml
<dependency>
  <groupId>io.github.barayo</groupId>
  <artifactId>testpulse-annotations</artifactId>
  <version>0.1.0</version>
  <scope>test</scope>
</dependency>
```

```xml
<build>
  <plugins>
    <plugin>
      <groupId>io.github.barayo</groupId>
      <artifactId>testpulse-maven-plugin</artifactId>
      <version>0.1.0</version>
      <configuration>
        <url>http://localhost:8080</url>
        <projectKey>LOGIN</projectKey>
      </configuration>
      <executions>
        <execution>
          <goals>
            <goal>annotate</goal>
            <goal>submit</goal>
          </goals>
        </execution>
      </executions>
    </plugin>
  </plugins>
</build>
```

```java
@TestPulse(caseKey = "LOGIN-42", platform = "linux", tags = {"smoke"})
@Test
void testLoginSucceeds() {
    ...
}
```

Both goals are bound to the `test` phase, right after Surefire itself, so
a plain `mvn test` both annotates the report and submits it — no separate
`curl` step needed. Works for both JUnit 4 and JUnit 5 (the mechanism
never hooks into either framework's execution model). By default, some
tests having no matching case (`207`) is a warning, not a build failure —
set `<failOnUnmatched>true</failOnUnmatched>` once a suite is fully
annotated to make that a hard failure instead. See the plugin's own
README for the full config-precedence reference, and its known v1
limitations (parameterized tests and overloaded methods aren't annotated;
no attachments yet; JUnit only, no TestNG).

## Jest: `testpulse-jest`

Jest has no equivalent to pytest's `record_property()` — no built-in way
for a running test to attach custom metadata to its own result. The
[`testpulse-jest`](https://github.com/Barayo/testpulse-jest) package
works around this by tagging tests through a small wrapper, injecting the
case key into [`jest-junit`](https://github.com/jest-community/jest-junit)'s
own JUnit XML output via its property hook, then submitting that report —
the same "reuse the runner's own writer" approach `pytest-testpulse` and
`testpulse-maven-plugin` take for their own ecosystems.

```bash
npm install --save-dev testpulse-jest jest-junit
```

```js
// jest.config.js
const path = require('path');
const propsPath = require.resolve('testpulse-jest/junitTestCaseProperties');

module.exports = {
  reporters: [
    'default',
    ['jest-junit', {
      outputName: 'junit.xml',
      // jest-junit's default suiteNameTemplate ("{title}") resolves to the
      // literal string "undefined" for a flat test() with no enclosing
      // describe() -- {filepath} always names the run meaningfully.
      suiteNameTemplate: '{filepath}',
      testCasePropertiesDirectory: path.dirname(propsPath),
      testCasePropertiesFile: path.basename(propsPath),
    }],
    ['testpulse-jest', { url: 'http://localhost:8080', project: 'LOGIN' }],
  ],
};
```

```js
const { testpulse } = require('testpulse-jest');

testpulse('LOGIN-42', { platform: 'linux', tags: ['smoke'] })(
  'logs in successfully',
  async () => {
    // ...
  }
);
```

The `jest-junit` config needs a `path.dirname()`/`path.basename()` split,
not a single combined path — `jest-junit` joins its two
`testCaseProperties*` options with `path.join()`, which doesn't
special-case an already-absolute path the way `path.resolve()` does. The
`testpulse-jest` reporter must be listed **after** `jest-junit` in the
`reporters` array, since it reads the file `jest-junit` just wrote.

By default, some tests having no matching case (`207`) is a warning, not a
build failure — set `failOnUnmatched: true` (or `TESTPULSE_FAIL_ON_UNMATCHED=1`)
once a suite is fully annotated to make that a hard failure instead:

| API response | Behavior |
|---|---|
| `201` all matched | build succeeds; summary logged |
| `207` some unmatched | build succeeds by default; fails when `failOnUnmatched` is set |
| network/auth/4xx/5xx error | always fails the build, unconditionally |

See the package's own README for the full config reference, the
`testpulseAttach()` screenshot-attachment API, and `dryRun`.

## Gradle: `testpulse-gradle-plugin`

Gradle's own `Test` task, like Surefire, has no built-in way to write
custom `<properties>` into its JUnit XML report — a still-open Gradle
issue ([gradle/gradle#36762](https://github.com/gradle/gradle/issues/36762))
requests exactly this. The
[`testpulse-gradle-plugin`](https://github.com/Barayo/testpulse-gradle-plugin)
plugin works around it the same way `testpulse-maven-plugin` does for
Surefire — reflection-based post-processing — and reuses the same
[`@TestPulse`](https://github.com/Barayo/testpulse-annotations) annotation:
a Java/Kotlin codebase using both Maven and Gradle in different modules
shares the exact same annotated test source.

```kotlin
// build.gradle.kts
plugins {
    id("io.github.barayo.testpulse") version "0.1.0"
}

testpulse {
    url = "http://localhost:8080"
    project = "LOGIN"
}
```

```java
import io.github.barayo.testpulse.TestPulse;
import org.junit.jupiter.api.Test;

public class LoginTest {
    @TestPulse(caseKey = "LOGIN-42", platform = "linux", tags = {"smoke"})
    @Test
    void loginSucceeds() {
        // ...
    }
}
```

The plugin automatically adds `testpulse-annotations` (for `@TestPulse`)
and its own classes (for screenshot attachments, below) as
`testImplementation` dependencies — no separate dependency block needed. A
plain `./gradlew test` both annotates the report and submits it.

Screenshot/file attachments (`TestPulseAttachments.attach(caseKey, bytes,
filename, contentType)`) are supported — unlike `testpulse-maven-plugin`,
which deferred them. The case key is passed explicitly and checked against
the calling class's own `@TestPulse`-declared case keys, so a test can't
attach evidence under a case key that isn't its own.

By default, some tests having no matching case (`207`) is a warning, not a
build failure — set `failOnUnmatched = true` (or `-Ptestpulse.failOnUnmatched=true`)
once a suite is fully annotated to make that a hard failure instead:

| API response | Behavior |
|---|---|
| `201` all matched | build succeeds; summary logged |
| `207` some unmatched | build succeeds by default; fails when `failOnUnmatched` is set |
| network/auth/4xx/5xx error | always fails the build, unconditionally |

See the plugin's own README for the full config-precedence reference, the
`TestPulseAttachments` API, `dryRun`, and its known v1 limitations
(parameterized tests and overloaded methods aren't annotated; JUnit only,
no TestNG).

## Go: `testpulse-go`

**Requires Go 1.25+.** Unlike Maven/Gradle/Jest, Go's `testing` package
has no built-in JUnit XML output at all, and until Go 1.25 (Aug 2025) had
no `record_property()`-equivalent mechanism either.
[`testpulse-go`](https://github.com/Barayo/testpulse-go) is built directly
on Go 1.25's new, stable `t.Attr(key, value string)` method, which
[`gotestsum`](https://github.com/gotestyourself/gotestsum) (>= v1.13.0,
the de facto standard `go test -json`-to-JUnit-XML tool) natively converts
into `<properties>` — this plugin doesn't generate or rewrite any XML
itself, unlike every other plugin on this page.

```go
import (
    "testing"

    testpulse "github.com/Barayo/testpulse-go"
)

func TestLoginSucceeds(t *testing.T) {
    testpulse.Case(t, "LOGIN-42", testpulse.WithPlatform("linux"), testpulse.WithTags("smoke"))
    // ...
}
```

Run the suite through `gotestsum` instead of plain `go test`, then submit
the report with the `testpulse-go` CLI:

```sh
gotestsum --junitfile=report.xml -- ./...
testpulse-go submit --file report.xml --url http://localhost:8080 --project LOGIN --token "$TESTPULSE_TOKEN"
```

Screenshot/file attachments (`testpulse.Attach(t, caseKey, data, filename,
contentType)`) require an explicit `caseKey`, checked against that exact
test's own `Case`-declared case keys — a subtest (`t.Run`) has its own
distinct name and does **not** inherit a parent test's declared case key,
so a subtest that wants to attach must call `Case` again itself.

By default, some tests having no matching case (`207`) is a warning, not a
hard failure — pass `--fail-on-unmatched` once a suite is fully tagged to
make that exit non-zero instead:

| API response | Behavior |
|---|---|
| `201` all matched | exit `0`; summary printed |
| `207` some unmatched | exit `0` by default; exits non-zero when `--fail-on-unmatched` is set |
| network/auth/4xx/5xx error | always exits non-zero, unconditionally |

See the plugin's own README for the full config-precedence reference, the
`--dry-run` flag, and its known v1 limitations (regular `*testing.T` tests
only, no benchmarks or fuzz targets; no Go versions before 1.25).

## .NET: `testpulse-dotnet`

**Requires `xunit.v3`** (not `xunit` v2). `dotnet test` has no built-in
JUnit XML output, and the de facto standard tool for producing one
(`JunitXml.TestLogger`) doesn't support writing `<properties>` into the
report at all.
[`testpulse-dotnet`](https://github.com/Barayo/testpulse-dotnet) (NuGet
package `TestPulse.MSBuild`) works around this by auto-registering its
own custom VSTest logger, which builds a JUnit XML report directly from
the test run rather than depending on a second logger's output.

```csharp
using TestPulse;
using Xunit;

public class LoginTests
{
    [TestPulseCase(caseKey: "LOGIN-42", platform: "linux", tags: new[] { "smoke" })]
    [Fact]
    public void LoginSucceeds()
    {
        // ...
    }
}
```

Run the suite exactly as normal — no extra flags:

```sh
dotnet add package TestPulse.MSBuild
dotnet test /p:TestPulseUrl=http://localhost:8080 /p:TestPulseProject=LOGIN
```

(`TESTPULSE_TOKEN` should be set directly as an environment variable, not
via an MSBuild property — see the plugin's README.) `TestPulseLogger` is
auto-wired via default `<VSTestLogger>`/`<VSTestTestAdapterPath>`
properties the package's own `.props` file sets, and — unlike an
`AfterTargets="VSTest"` MSBuild target, which this plugin deliberately
does not use — reliably runs whether the underlying tests passed or
failed.

Screenshot/file attachments
(`TestPulseAttachments.Attach(caseKey, data, filename, contentType)`) are
gated by xUnit v3's own `TestContext.Current` ambient test identity: an
`Attach` call only succeeds for the case key the currently-executing test
method has itself declared via `[TestPulseCase]`.

| API response | Behavior |
|---|---|
| `201` all matched | build succeeds; summary logged |
| `207` some unmatched | build succeeds by default; fails the build when `TestPulseFailOnUnmatched` is set |
| network/auth/4xx/5xx error | always fails the build, unconditionally |

See the plugin's own README for the full config-precedence reference, the
dry-run flag, and its known v1 limitations (xUnit only, no NUnit/MSTest;
`[Theory]` methods are unsupported for tagging).

## Google Test (gtest): `testpulse-gtest`

**Requires C++17 and CMake 3.16+.** Unlike most languages, Google Test
already has a built-in mechanism for writing custom key/value data into
its own JUnit XML output —
[`RecordProperty()`](https://google.github.io/googletest/advanced.html#logging-additional-information)
— and it produces exactly the `<properties><property name="..."
value="..."/></properties>` shape this contract expects (confirmed
against gtest's own real unittest fixture source; gtest's own
documentation page shows a stale, incorrect example for this).
[`testpulse-gtest`](https://github.com/Barayo/testpulse-gtest) is a
header-only library built directly on `RecordProperty()` — it doesn't
generate or rewrite any XML itself, unlike the JVM/.NET plugins on this
page.

```cmake
include(FetchContent)
FetchContent_Declare(
    testpulse_gtest
    GIT_REPOSITORY https://github.com/Barayo/testpulse-gtest.git
    GIT_TAG v1.0.0  # always pin to a released tag, never `main`
)
FetchContent_MakeAvailable(testpulse_gtest)
target_link_libraries(your_test_target PRIVATE testpulse::testpulse)
```

```cpp
#include <testpulse/testpulse.hpp>

TEST(LoginTest, Succeeds) {
    testpulse::Case("LOGIN-42", testpulse::WithPlatform("linux"), testpulse::WithTags({"smoke"}));
    // ...
}
```

Run the suite requesting XML output, then submit with the
`testpulse-gtest` CLI (prebuilt binaries attached to every release, no
package registry needed):

```sh
your_test_binary --gtest_output=xml:report.xml
testpulse-gtest submit --file report.xml --url http://localhost:8080 --project LOGIN --token "$TESTPULSE_TOKEN"
```

Screenshot/file attachments (`testpulse::Attach(caseKey, data, filename,
contentType)`) are identified via gtest's own `current_test_info()` and
only succeed for a case key the currently-executing test has itself
declared via `Case`.

| API response | Behavior |
|---|---|
| `201` all matched | exit `0`; summary printed |
| `207` some unmatched | exit `0` by default; exits non-zero when `--fail-on-unmatched` is set |
| network/auth/4xx/5xx error | always exits non-zero, unconditionally |

See the plugin's own README for the full config-precedence reference, the
`--dry-run` flag, and its known v1 limitations (Google Test only, no
Catch2; `TEST`/`TEST_F` only, no `BENCHMARK` integration; no
`vcpkg`/Conan distribution, `FetchContent` only).

## Jasmine: `testpulse-jasmine`

**Requires `jasmine`/`jasmine-core` 5.0+.** Jasmine has a real,
first-party API for exactly this —
[`jasmine.getEnv().setSpecProperty(key, value)`](https://jasmine.github.io/api/edge/Env.html)
(since v3.6.0) — so
[`testpulse-jasmine`](https://github.com/Barayo/testpulse-jasmine)
doesn't generate or rewrite any XML using a third-party writer; it
builds JUnit XML directly from each spec's own properties.
(`jasmine-reporters`' `JUnitXmlReporter`, the ecosystem's de facto JUnit
XML tool, has no property-injection support at all.) `--parallel` mode
is fully supported.

```js
// spec/support/jasmine.js -- must be a .js config, not .json, since
// reporters with methods can only be registered from a JS config file
const { TestPulseReporter } = require('testpulse-jasmine');

module.exports = {
  spec_dir: 'spec',
  spec_files: ['**/*[sS]pec.js'],
  reporters: [new TestPulseReporter({ url: 'http://localhost:8080', project: 'LOGIN' })],
};
```

```js
const { Case } = require('testpulse-jasmine');

describe('login', () => {
  it('succeeds', () => {
    Case('LOGIN-42', { platform: 'linux', tags: ['smoke'] });
    // ...
  });
});
```

Run the suite as normal, then check the result — Jasmine's own CLI
determines its exit code purely from spec pass/fail and has no way for a
reporter to influence it, so `testpulse-jasmine check` is the only thing
that can fail the build for a submission error or an unmatched case:

```sh
jasmine; jasmine_status=$?
testpulse-jasmine check; check_status=$?
[ "$jasmine_status" -eq 0 ] && [ "$check_status" -eq 0 ]
```

Don't chain these with `&&` (`jasmine && testpulse-jasmine check`) — a
failing spec short-circuits it, so `check` never runs and its own
diagnostic never prints; see the plugin's own README for the full
explanation.

Screenshot/file attachments (`Attach(caseKey, data, filename,
contentType)`) are verified via Jasmine's own `getSpecProperty()`
readback of what `Case` set for the currently-executing spec — a genuine
built-in capability, no custom allowlist tracking needed.

| API response | Behavior |
|---|---|
| `201` all matched | `check` exits `0`; summary logged |
| `207` some unmatched | `check` exits `0` by default; exits non-zero when `failOnUnmatched` is set |
| network/auth/4xx/5xx error | `check` always exits non-zero, unconditionally |

See the plugin's own README for the full config-precedence reference and
the dry-run option.

## Mocha: `testpulse-mocha`

**Requires `mocha` 9.0+.** Unlike Jest/Jasmine, Mocha has no implicit
"current test" global accessible from arbitrary code — no equivalent to
`expect.getState()` or `jasmine.getEnv()`. The only way to reach the
running test is via `this` inside a non-arrow `it()`/hook function
body, so [`testpulse-mocha`](https://github.com/Barayo/testpulse-mocha)'s
`Case`/`Attach` take that Mocha `Context` as an explicit first argument.
(`mocha-junit-reporter`'s own README states plainly that custom
properties can only be added at the `<testsuite>` level, not per
`<testcase>` — the same gap `jasmine-reporters` had — so this package
also builds JUnit XML directly from `Runner` events rather than
depending on it.) **`--parallel` mode is not supported**: Mocha
transmits `Test` objects from worker processes to the main process via
a hardcoded field list (`Test.prototype.serialize()`) that carries no
custom properties; the reporter detects and warns about this at runtime
rather than failing silently.

```js
// .mocharc.js
module.exports = {
  spec: 'test/**/*.spec.js',
  reporter: 'testpulse-mocha',
  reporterOptions: { url: 'http://localhost:8080', project: 'LOGIN' },
};
```

```js
const { Case } = require('testpulse-mocha');

describe('login', function () {
  it('succeeds', function () {
    // `this` must come from a non-arrow function.
    Case(this, 'LOGIN-42', { platform: 'linux', tags: ['smoke'] });
    // ...
  });
});
```

Run the suite as normal, then check the result — Mocha's own CLI
determines its exit code independent of anything a reporter sets, so
`testpulse-mocha check` is the only thing that can fail the build for a
submission error or an unmatched case:

```sh
mocha; mocha_status=$?
testpulse-mocha check; check_status=$?
[ "$mocha_status" -eq 0 ] && [ "$check_status" -eq 0 ]
```

Don't chain these with `&&` (`mocha && testpulse-mocha check`) — a
failing test short-circuits it, so `check` never runs and its own
diagnostic never prints; see the plugin's own README for the full
explanation, plus a real risk worth knowing: don't pass `--exit` to
`mocha` when using this reporter, since it can kill an in-flight
submission before it completes.

Screenshot/file attachments (`Attach(this, caseKey, data, filename,
contentType)`) are verified against whatever `Case` already recorded on
the current test.

| API response | Behavior |
|---|---|
| `201` all matched | `check` exits `0`; summary logged |
| `207` some unmatched | `check` exits `0` by default; exits non-zero when `failOnUnmatched` is set |
| network/auth/4xx/5xx error | `check` always exits non-zero, unconditionally |

See the plugin's own README for the full config-precedence reference,
the dry-run option, and the `--parallel` limitation's exact cause.

## Vitest: `testpulse-vitest`

**Requires `vitest` 1.0+.** Unlike every other JS plugin in this list,
[`testpulse-vitest`](https://github.com/Barayo/testpulse-vitest) needs
no scratch directory at all — Vitest has a genuine, native, built-in
test-annotation API (`context.annotate(message, type, attachment?)`)
whose data, including binary attachment payloads, is directly readable
by a custom reporter via `TestCase.annotations()`. `Case`/`Attach` are
thin wrappers over that native mechanism; attachments travel entirely
through it too, never touching disk. The reporter still builds JUnit
XML directly rather than depending on the built-in `junit` reporter's
file output, since that file's write was found to race unsafely against
other configured reporters' own hooks.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'testpulse-vitest'],
  },
});
```

```ts
import { test } from 'vitest';
import { Case } from 'testpulse-vitest';

test('login succeeds', async (context) => {
  await Case(context, 'LOGIN-42', { platform: 'linux', tags: ['smoke'] });
  // ...
});
```

Run the suite as normal, then check the result — `testpulse-vitest
check` is the only supported, version-independent way to fail the
build for a submission error or an unmatched case:

```sh
vitest run; vitest_status=$?
testpulse-vitest check; check_status=$?
[ "$vitest_status" -eq 0 ] && [ "$check_status" -eq 0 ]
```

Don't chain these with `&&` for the same reason as the other plugins —
see the plugin's own README's "Exit code" section for a genuinely
nuanced finding: a reporter's `process.exitCode` assignment was found
to actually survive on the Vitest versions tested, but since that isn't
part of Vitest's *documented* reporter contract, `check` is still the
supported mechanism regardless.

Screenshot/file attachments (`Attach(context, caseKey, data, filename,
contentType)`) are verified against whatever `Case` already recorded
for the current test. **Combining `testpulse-vitest` with Vitest's
built-in `html` reporter embeds attachment bytes into that reporter's
own output bundle** — confirmed empirically, not hypothetical; avoid
that combination if attachments may be published as a CI artifact or
preview page.

| API response | Behavior |
|---|---|
| `201` all matched | `check` exits `0`; summary logged |
| `207` some unmatched | `check` exits `0` by default; exits non-zero when `failOnUnmatched` is set |
| network/auth/4xx/5xx error | `check` always exits non-zero, unconditionally |

See the plugin's own README for the full config-precedence reference,
the dry-run option (including its fail-closed behavior on a preview
fetch error), and the `html`-reporter warning's full explanation.
