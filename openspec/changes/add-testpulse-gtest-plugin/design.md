## Context

`add-execution-import` (#38) shipped `POST
/api/v1/projects/{projectKey}/imports`, matching `<testcase>` entries in a
JUnit XML report to existing cases by a `testpulse_case_key` `<property>`.
Issue #58 tracked installable plugins for the major JUnit-XML-producing
ecosystems; it was split into #154 (pytest, shipped), #155 (Jest,
shipped), #156 (Maven, shipped), #157 (Gradle, shipped), #169 (Go,
shipped), #170 (.NET, shipped), #171 (gtest, this change).

The issue itself flagged a real open question: does gtest's
`::testing::Test::RecordProperty(key, value)` — combined with its native
`--gtest_output=xml` flag — actually write `<properties>` in the shape
`execution-import`'s importer expects? This needed real verification, not
assumption, and the verification surfaced a genuine discrepancy worth
recording. gtest's own [`advanced.md`
documentation](https://github.com/google/googletest/blob/main/docs/advanced.md)
shows an example claiming `RecordProperty()` writes custom key/value pairs
as **attributes directly on the `<testcase>` element** (e.g. `<testcase
name="..." MaximumWidgets="12" />`) — this example is stale and does not
match gtest's actual current behavior. A filed upstream issue
([google/googletest#2989](https://github.com/google/googletest/issues/2989))
confirms the documentation itself is wrong: real `RecordProperty()` calls
produce genuine `<properties><property name="..." value="..."/></properties>`
**child elements** nested under `<testcase>`, confirmed directly against
gtest's own real unittest fixture source
(`googletest/test/gtest_xml_output_unittest.py`), which shows the actual
expected output as:
```xml
<testcase name="RecordProperty" ... classname="NoFixtureTest">
  <properties>
    <property name="key" value="1"/>
  </properties>
</testcase>
```
This is exactly the shape `apps/api/internal/junitxml/parser.go` already
parses (`<properties><property name="testpulse_case_key"
value="..."/></properties>`, read as XML child elements, not arbitrary
`<testcase>` attributes — the Go struct tags have no field for the
latter). So gtest's actual mechanism is even simpler than initially
speculated: no reflection-based post-processor, no third-party
XML-writing tool dependency (unlike Go's reliance on `gotestsum`) — just
a thin call-through to gtest's own already-correct, native property
writer. This must still be verified with a real, isolated end-to-end
repro during implementation (tasks.md), not merely trusted from this
research pass — the same "verify the real mechanism, not just the docs"
discipline that caught two separate, non-obvious failures in the .NET
plugin's design (`AfterTargets="VSTest"` not surviving test failure, and
`VSTestEnvironment` not reaching the driver process) despite both looking
correct from documentation alone.

## Goals / Non-Goals

**Goals:**
- A native, zero-reflection tagging mechanism (`RecordProperty()` under
  the hood), taking advantage of the fact that it is a `static` member
  function — no test handle needs to be passed in at all, unlike every
  prior plugin's tagging API (Go's `t.Attr` needs `*testing.T`; .NET's
  attribute-based approach needs reflection; xUnit's `TestContext.Current`
  needs ambient lookup).
- Reuse gtest's own existing, already-correct JUnit XML writer rather
  than building or depending on a second one.
- Screenshot/file attachments in v1, matching the more recent
  Jest/Gradle/Go/.NET plugins rather than Maven's earlier deferral.
- A `--dry-run` preview, matching the parity already established by
  `testpulse-jest`/`testpulse-gradle-plugin`/`testpulse-go`/`testpulse-dotnet`.
- CLI-only submission (no build-tool auto-wiring), matching Go's
  precedent for ecosystems with no universal build-hook system.

**Non-Goals (v1):**
- Catch2 — gtest only, matching the issue's own framing ("Google Test was
  chosen over Catch2... as the higher-coverage single choice for C/C++")
  and the established "one framework per plugin" precedent (JUnit 4/5-only
  for the Java plugins, xUnit-only for .NET).
- `vcpkg`/Conan registry publishing — CMake `FetchContent` only. Real
  research (not assumption) confirmed no single de facto C++
  package-manager standard exists the way npm/PyPI/Maven Central/NuGet
  do for their ecosystems; `FetchContent` is the natural fit for a small
  header-only library, requires zero extra tooling install, and is also
  Google's own recommended way to consume gtest itself.
- CMake `install()`/`find_package()` support beyond `FetchContent`
  consumption — a namespaced `testpulse::testpulse` target works fine via
  `FetchContent_Declare` alone; a full system-wide-installable package
  story is unneeded ceremony for v1.
- A `TestEventListener`-based auto-submit mechanism — seriously
  considered (gtest's event listener API could, in principle, trigger
  submission right after the XML file is written) and rejected: it would
  require every consumer to modify their own `main()` to register a
  listener, and relying on gtest's internal listener-execution ordering
  (that the built-in XML-writing listener runs before a custom one) isn't
  part of gtest's stable public contract. The simpler, more reliable
  CLI-only approach was chosen instead, the same reasoning Go's design
  already established for ecosystems with no universal build hook.
- `BENCHMARK` integration — regular `TEST`/`TEST_F` only, matching every
  other plugin's "one test type" scoping.

## Decisions

### Repo & packaging
New public repo `Barayo/testpulse-gtest`, MIT license, a header-only C++
library (`testpulse/testpulse.hpp`) distributed via CMake `FetchContent`,
plus a separate `testpulse-gtest` submit CLI shipped as prebuilt binaries
(Linux/macOS/Windows) attached to tagged GitHub releases — the same
two-piece shape as `testpulse-go` (tagging API + CLI), since C++ has no
build-tool auto-wiring hook the way MSBuild/Gradle/Maven have. Version
floor: **C++17 / CMake 3.16 minimum**, matching gtest 1.18.x's own current
floor exactly (confirmed via research), so this plugin never needs to
support a wider compatibility range than gtest itself does.

**`FetchContent_Declare`'s `GIT_TAG` MUST always be pinned to a specific
released tag, never a branch name.** Unlike every prior plugin in this
family, which distributes through a registry with immutable,
content-addressed version resolution (PyPI/npm/Maven Central/Gradle
Plugin Portal/Go modules/NuGet), `FetchContent_Declare(...  GIT_TAG
main)` is a legitimate, commonly-copy-pasted CMake pattern that silently
resolves to whatever the default branch currently points to at build
time — a real supply-chain regression class (the same shape GitHub
Actions' own unpinned-Action-ref guidance warns against), not a
theoretical concern, since a consumer who copies an unpinned example is
trusting whatever lands on `main` between their builds with zero
version pinning or verification. This is a stated commitment, not left
implicit in a README-writing task: the README's own example snippet
MUST demonstrate the pinned form (`GIT_TAG v1.2.0`, not `GIT_TAG main`),
and the plugin's own CI/test-suite `FetchContent`-fetch of gtest itself
MUST likewise pin to a specific gtest release tag, not track gtest's own
default branch — caught during this design's own gating review before
implementation began, the same "verify/state explicitly, don't leave to
chance" discipline already applied throughout this plugin family.

### Tagging via a plain free function — no test handle needed
```cpp
#include <testpulse/testpulse.hpp>

TEST(LoginTest, Succeeds) {
    testpulse::Case("LOGIN-42", testpulse::WithPlatform("linux"), testpulse::WithTags({"smoke"}));
    // ...
}
```
`testpulse::Case(caseKey, opts...)` mirrors `testpulse-go`'s `Case(t,
caseKey, opts...)` API shape but **without an explicit test handle** —
confirmed via research that `::testing::Test::RecordProperty` is a
`static` member function, callable from anywhere with no `this`/receiver
needed (unlike Go's `t.Attr`, which requires the `*testing.T`). `Case()`
calls `RecordProperty("testpulse_case_key", caseKey)`, and the optional
`testpulse_platform`/`testpulse_version`/`testpulse_tags` variants only
for whichever `opts` were supplied — matching the property names the
`execution-import` capability's importer already reads.

`Case()` **also** internally records the declared case key against the
currently-running test's identity — via
`::testing::UnitTest::GetInstance()->current_test_info()`, which exposes
`test_suite_name()`/`name()` and returns `nullptr` outside an active test
— into a small internal allowlist map. This bookkeeping is necessary
because `RecordProperty()` itself has no return value or registry to
query back from; `Attach()` (below) needs *some* record of "which case
keys did this specific test declare" to enforce its own allowlist check,
the same protection every other plugin's attachment mechanism provides.

### Attachments: identified via `current_test_info()`
```cpp
TEST(LoginTest, FailsWithBadPassword) {
    testpulse::Case("LOGIN-43");
    auto screenshot = TakeScreenshot();
    testpulse::Attach("LOGIN-43", screenshot, "failure.png", "image/png");
}
```
`Attach(caseKey, data, filename, contentType)` identifies the running test
via `current_test_info()` — a `nullptr` (no active test — e.g. called from
outside any `TEST`/`TEST_F` body, such as global setup) throws a distinct,
clearly-worded error, never a null-pointer dereference, the same
protection xUnit's `TestContext.Current` null-check and Gradle/Go's
allowlist checks provide. `Attach` rejects (throws) a call whose `caseKey`
isn't among the current test's own `Case()`-declared case keys. Only
`image/png`, `image/jpeg`, and `image/webp` content types are accepted,
same allow-list as every other plugin, validated before the allowlist
check.

Storage: a `.testpulse/` scratch directory on disk — the test binary and
the later `testpulse-gtest submit` CLI invocation are separate processes,
the same reasoning `testpulse-go`'s attachment storage already
establishes. On-disk filenames are derived from a hash (case key plus a
fresh identifier generated per call), never from the caller-supplied
`filename` directly — no path-traversal surface, matching every other
plugin's attachment storage.

**Concurrency scoping, reasoned explicitly rather than silently
skipped:** gtest runs single-threaded per test binary by default — unlike
xUnit (which parallelizes test collections) or Gradle (which can run
tests in parallel forked JVMs), a single `gtest` binary invocation has no
built-in concurrent test execution to race against. The internal
allowlist map is still mutex-guarded defensively (a user could
theoretically spawn their own threads inside a test body and call
`Attach` from one), but this design does **not** require the elaborate
barrier-based genuine-concurrency end-to-end test that Gradle's and Go's
attachment mechanisms needed — there is no default-parallel execution
path for such a test to actually exercise. If a future version adds
support for gtest's sharding (`GTEST_TOTAL_SHARDS`, which runs in
*separate processes*, not the same threat model as intra-process
concurrency) or an explicit threaded-test scenario, that would need its
own revisit.

### Submission, config, and exit-code behavior — matching `testpulse-go`'s CLI exactly
Unlike every prior plugin's language, C++ has no standard-library HTTP
client or JSON library, so the CLI (not the header-only tagging library,
which needs neither) genuinely requires two real dependencies, decided
during implementation: **`nlohmann/json`** (single-header, MIT-licensed,
`FetchContent`-fetched and pinned to a released tag like gtest itself)
for building the request body and parsing responses, and **`libcurl`**
(a system dependency resolved via `find_package(CURL REQUIRED)`, present
by default on Linux and macOS and installed explicitly in CI on Windows)
for HTTP — prebuilt release binaries bundle it, so an end user installing
a release needs nothing extra. This does not reopen the "no vcpkg/Conan"
decision above: that was about how *this plugin itself* is distributed,
not about whether its own CLI may depend on anything at all (gtest is
already a real, accepted dependency for the tagging library's own test
suite). Reading the JUnit XML report for `--dry-run`'s case-key
extraction uses a small, dependency-free scanner targeting the same
narrow, long-stable `<property name="testpulse_case_key" value="...">`
shape (not a general XML parser) — the same "target the long-stable
subset" reasoning already applied throughout this design.
```sh
testpulse-gtest submit --file report.xml --url https://testpulse.example --project LOGIN --token "$TESTPULSE_TOKEN"
```
Config resolution: CLI flag, then environment variable — no third,
build-file-backed tier (C++ has no `pom.xml`/`build.gradle`/`.csproj`
equivalent to hang config off of, the same reasoning that ruled out a
build-file config tier for Go).

| Setting | Flag | Env var |
|---|---|---|
| API base URL | `--url` | `TESTPULSE_URL` |
| API token | `--token` | `TESTPULSE_TOKEN` |
| Project key | `--project` | `TESTPULSE_PROJECT` |
| Fail on unmatched | `--fail-on-unmatched` | `TESTPULSE_FAIL_ON_UNMATCHED` |
| Attachments search root | `--dir` (default `.`) | — |
| Preview without submitting | `--dry-run` | — |

Submission outcome maps to exit code identically to every prior plugin:

| Response | Behavior |
|---|---|
| `201` all matched | exit `0`; summary printed |
| `207` some unmatched | exit `0` by default (unmatched keys printed, points at `--fail-on-unmatched`); exit non-zero if `--fail-on-unmatched` is set |
| network/auth/4xx/5xx error | always exits non-zero, unconditionally |

`--dry-run` fetches existing case keys via a read-only `GET
/api/v1/projects/{project}/cases` and previews which tagged tests would
match, without submitting anything — always exits `0` if the preview
fetch itself succeeds, regardless of the preview's match/no-match content,
matching every prior plugin's dry-run semantics.

### Testing approach (TDD)
A real gtest test suite (dogfooding — this plugin's own tests are written
using gtest itself) for `Case`/`Attach`'s allowlist logic, with HTTP
mocked for submission — the isolated-fixture-testing pattern used by
every prior plugin. A smaller number of real end-to-end tests: build a
fixture binary linking the header via `FetchContent`, run it with
`--gtest_output=xml`, and **explicitly verify via an isolated repro that
the actual generated XML contains `<properties><property
name="testpulse_case_key" .../></properties>` nested under `<testcase>`**
— not merely trusting this design's own research finding from gtest's
fixture source, the same "verify the real mechanism during
implementation too" discipline that caught real, non-obvious failures in
the .NET plugin despite each looking correct from documentation/research
alone. Plus a real `testpulse-gtest submit` invocation against a stub
HTTP server, proving the full pipeline (build → XML → submit) end to end.

### CI / publishing
- GitHub Actions: `cmake --build` + `ctest` on **both Linux and macOS**
  per PR — real cross-platform compile verification, a genuine concern
  for this ecosystem that JS/JVM/.NET/Go's runtime-portable build outputs
  don't share (a header-only C++ library can compile cleanly on one
  platform and fail on another due to compiler/standard-library
  differences).
- Release: prebuilt `testpulse-gtest` CLI binaries (Linux/macOS/Windows)
  attached to a tagged GitHub release via semantic-release + GitHub
  Releases — **no package-registry publish step at all**, since
  `FetchContent` pulls the header library directly from the tagged repo
  source and the CLI ships purely as release binary assets, matching
  `testpulse-go`'s "no registry, tagged source + release artifacts"
  pattern (no NuGet/PyPI/npm/Maven-Central-equivalent needed for this
  ecosystem).
- Release workflow gated the same way every release workflow in this
  session has been: `on: push (main) / workflow_dispatch` only, `if:
  github.repository == 'Barayo/testpulse-gtest'`, secrets injected only
  into that job, never a `pull_request`-triggered workflow.

## Risks / Trade-offs

- **gtest's own documentation is wrong about `RecordProperty()`'s XML
  output shape** — mitigated by not trusting it: this design instead
  verified the real behavior against gtest's own unittest fixture source
  and a corroborating upstream issue, and tasks.md requires an isolated,
  real end-to-end repro during implementation before relying on it
  further. If gtest's actual behavior ever changes in a future release
  (unlikely, since the fixture-verified shape long predates this design
  and the docs bug has stood since 2020), the isolated repro test would
  catch the regression immediately.
- **`FetchContent`'s `GIT_TAG` accepting a mutable branch name is a real
  supply-chain footgun for consumers who copy an unpinned example** — see
  the Repo & packaging decision above; mitigated by making tag-pinning an
  explicit, stated requirement on the README's own example snippet and
  the plugin's own CI, not something left to whoever writes the README
  to remember unprompted. Caught during this design's own pre-implementation
  gating review, not discovered later.
- **No `vcpkg`/Conan distribution** — a real, deliberate v1 scoping
  decision grounded in research showing no single de facto C++
  package-manager standard exists, not an oversight. A user already using
  one of those ecosystems can still consume this via `FetchContent`
  (CMake's own mechanism composes fine alongside either), just without a
  registry-native install step. Revisit if real user demand for a
  specific registry emerges.
- **The `TestEventListener` auto-submit approach was seriously considered
  and rejected before implementation**, not silently omitted — recorded
  here as a deliberate architecture choice (see Non-Goals), consistent
  with this project's established practice of documenting rejected
  approaches, not just the final answer chosen.
- **Coupling to gtest's own JUnit XML schema**, which has no formal
  versioned contract — same risk already accepted for every other
  JUnit-XML-producing plugin, mitigated the same way: targeting the
  long-stable subset (`<testcase classname name>`,
  `<properties><property name value>`), verified against gtest's own
  real fixture source rather than assumed.
