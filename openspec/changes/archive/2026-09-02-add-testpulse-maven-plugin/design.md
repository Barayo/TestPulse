## Context

`add-execution-import` (#38) shipped `POST /api/v1/projects/{projectKey}/imports`,
matching `<testcase>` entries in a JUnit XML report to existing cases by a
`testpulse_case_key` `<property>`. Issue #58 tracked installable plugins for
all four major JUnit-XML-producing ecosystems; split into #154 (pytest,
shipped as `pytest-testpulse` v1.0.1), #155 (npm/Jest), #156 (Maven), #157
(Gradle). This change scopes **#156 only**.

Unlike pytest, Maven's Surefire test runner has **no mechanism at all** for
writing custom per-`<testcase>` properties into its JUnit XML report.
Research during the design pass confirmed this is a long-standing, still-
open gap in Surefire itself: JUnit 5's `TestReporter.publishEntry()`
entries are never written to Surefire's XML output (tracked upstream since
JUnit 5.0.2, ~2017, unresolved as of 2026), and no existing library fills
this gap. Property injection has to happen as a separate step *after*
Surefire finishes, not during the test run the way pytest's
`record_property()` works.

A full brainstorming pass (including the upstream research above) was
already worked through and written up at
`docs/superpowers/specs/2026-09-02-testpulse-maven-plugin-design.md`
(commit `142daa9`). This document restates those decisions in OpenSpec form
as the source of truth going forward.

## Goals / Non-Goals

**Goals:**
- A Maven user can tag a test method with a case key and have that key land
  in Surefire's `TEST-*.xml` output as a `testpulse_case_key` property, the
  same property name the import API already reads.
- Works for both JUnit 4 and JUnit 5, with no per-framework runtime
  integration to build or maintain.
- The plugin also submits the annotated report to the import endpoint,
  matching `pytest-testpulse`'s already-validated 201/207/error exit-code
  policy.

**Non-Goals (v1):**
- Per-invocation case keys for parameterized tests (`@ParameterizedTest`,
  JUnit 4 `@RunWith(Parameterized.class)`) — every invocation of an
  annotated method shares one case key, the same simplification
  `pytest-testpulse` makes for parametrized pytest tests.
- Attachments — Maven's multi-module, multi-report structure makes "which
  file belongs to which result" a genuinely different problem than
  pytest's single-process case; deferred to its own follow-up design.
- TestNG — JUnit 4/5 only.
- Dry-run preview — worth adding for parity once the core mechanism is
  proven; not blocking v1.

## Decisions

**Mechanism: reflection-only post-processor, not a JUnit runtime
extension.** A custom `@TestPulse(caseKey, platform = "", version = "",
tags = {})` annotation (`RetentionPolicy.RUNTIME`) goes on test methods. A
Maven plugin goal, bound to run immediately after `surefire:test`, loads
the project's compiled test classes via reflection, matches each
`TEST-*.xml`'s `<testcase classname="..." name="...">` to the
corresponding `Method` by class + method name, and rewrites the XML file
in place with a `<properties>` block carrying `testpulse_case_key` (and
whichever of `testpulse_platform`/`testpulse_version`/`testpulse_tags`
were supplied) — the same property names `pytest-testpulse` and the raw
`conftest.py` snippet already write.

This was the one decision genuinely debated during design. The
alternative — a JUnit 5 `Extension` capturing annotation data live during
the run into a side-channel file, merged into the XML afterward — was
rejected because achieving JUnit 4 support under that model requires
building a *second*, entirely different runtime integration (JUnit 4's
`TestRule`/`RunListener` APIs are incompatible with JUnit 5's extension
model), on top of the same post-processing merge step either way. The
reflection-only approach never hooks into either framework's execution
model at all, so JUnit 4 and JUnit 5 support come from the same code path
with no version-specific logic.

**Two artifacts, not one**, matching how comparable Maven ecosystem
tooling (JaCoCo, Lombok) splits an annotation from its processing plugin:
- `testpulse-annotations` — a tiny, zero-dependency jar containing only
  `@TestPulse`. Added as a normal `<dependency><scope>test</scope>
  </dependency>`, so test code can reference the annotation without
  pulling in Maven plugin machinery (`maven-plugin-api`, `maven-core`,
  etc.) onto the test classpath.
- `testpulse-maven-plugin` — the actual plugin, referenced via
  `<build><plugins>`, depending on `testpulse-annotations` to know the
  annotation's fully-qualified name for its reflection lookup. Two Mojo
  goals:
  - **`annotate`**, bound to the `test` phase (after `surefire:test`):
    does the reflection + XML rewrite described above.
  - **`submit`**, also bound to the `test` phase, immediately after
    `annotate`'s own execution (not `verify`): reads the annotated
    report(s) and `POST`s to `/api/v1/projects/{projectKey}/imports`,
    applying the same 201/207/error handling as `pytest-testpulse`:
    | Response | Behavior |
    |---|---|
    | `201` all matched | build succeeds; summary logged |
    | `207` some unmatched | build succeeds by default (warning logged, names unmatched keys, points at `failOnUnmatched`); fails the build if `failOnUnmatched` is set |
    | network/auth/4xx/5xx error | always fails the build, unconditionally |

  Binding both goals to `test` (not `verify`) was a correction made after
  review: `verify` runs a whole phase later than `annotate`, meaning every
  other `verify`-bound plugin (e.g. Failsafe integration tests) would run
  and potentially take minutes before a missing/misconfigured token is
  even discovered — and a plain `mvn test` (a completely normal local
  workflow, distinct from a full `mvn verify`) would never trigger
  submission at all under the `verify` binding. Binding both to `test`,
  declared as sequential executions of the same phase (Maven runs
  same-phase executions in pom declaration order), makes "every `mvn
  test` submits if there's anything annotated" the consistent behavior —
  the same one-invocation-submits model `pytest-testpulse` already has.

**`submit` skips entirely when nothing is annotated.** If the `annotate`
goal's reflection scan finds zero `@TestPulse`-annotated methods anywhere
in the project's test classes, `submit` SHALL require no configuration
and SHALL NOT attempt a request — mirroring `pytest-import-plugin`'s "a
suite with no marker and no dry-run needs no config" requirement. Without
this, a completely ordinary Maven rollout pattern — adding
`testpulse-maven-plugin` via a parent pom before any test is actually
annotated yet — would break every build with a missing-token failure for
a plugin that has nothing useful to do. This was a review finding, not
part of the original design pass; the pytest sibling already established
the right default and this change should have mirrored it from the start.

**Config**, mirroring `pytest-testpulse`'s precedence in Maven's own
idiom: each setting is a `@Parameter(property = "testpulse.<name>", ...)`,
which Maven itself resolves from a system property
(`-Dtestpulse.url=...`) or a `<configuration>` block in the pom, in that
order. `failOnUnmatched` follows the same pattern. The token additionally
checks the `TESTPULSE_TOKEN` environment variable explicitly in the Mojo
(Maven has no built-in env-var-to-property mapping), so CI secrets never
need to be written into a `-D` flag or a committed pom.

**Maven groupId: `io.github.barayo`, not a custom domain.** Maven Central
requires verified ownership of whatever namespace a `groupId` claims —
either DNS-based verification of a real domain, or the zero-setup
`io.github.<org>` convention Central's own Portal supports for GitHub-hosted
projects. Since there's no indication TestPulse owns a domain suitable for
DNS verification, both new artifacts use `io.github.barayo` (e.g.
`io.github.barayo:testpulse-annotations`,
`io.github.barayo:testpulse-maven-plugin`) — the same zero-friction choice
countless GitHub-only open source Maven projects make, revisitable later
if a dedicated domain is ever acquired (Maven Central `groupId`s aren't
renamed in place, but a new one can be published alongside a
deprecation note on the old one, same as any other ecosystem's rename
story).

**Matching `<testcase>` to `Method`**: for v1, only test names that map
cleanly to exactly one compiled method (the common, non-parameterized
case) are annotated; anything Surefire decorates (parameterized-test
invocation suffixes like `[1]`, dynamic/nested JUnit 5 tests) is left
alone with a build-log note, not silently mismatched or guessed at — the
direct consequence of the parameterized-tests non-goal above. **Overloaded
methods sharing a name resolve to the same ambiguous case** (class + name
matches more than one `Method`) and are skipped with the same kind of
note, not guessed at either. Nested JUnit 5 test classes (Surefire's
`classname` is the JVM binary name, e.g. `Outer$Inner`) need no special
casing — `Class.forName()` already accepts binary names with `$` — but
this is worth stating explicitly rather than leaving implicit, since it
looks like an edge case even though it isn't one.

**A class that fails to load during the reflection scan is skipped, not
fatal.** `Class.forName()` on a compiled test class can throw
(`NoClassDefFoundError`, `ExceptionInInitializerError`) for reasons
unrelated to `@TestPulse` at all — a missing optional runtime dependency,
a static-initializer failure. The `annotate` goal SHALL catch this per
class, log a warning naming the class, and continue scanning the rest —
one broken, unrelated class must not abort annotation (and therefore
submission) for an otherwise-healthy build. This was a review finding:
the original design specified the matching logic but not this failure
mode.

**A missing Surefire report at the point `annotate`/`submit` need it is a
build failure with a named path, not a raw exception.** This differs from
"nothing annotated" (above, which skips cleanly) — it's the case where
reflection *did* find `@TestPulse`-annotated methods, but the
corresponding `target/surefire-reports/TEST-*.xml` doesn't exist (tests
skipped via `-DskipTests`, a test-compile failure that aborted before
Surefire ran, a customized report directory). Mirrors
`pytest-import-plugin`'s equivalent requirement for an interrupted run
leaving no `report.xml`. Also a review finding — the original design
covered clean matching but not this gap.

**XML parsing is hardened against XXE explicitly, not left to the
default parser config.** Java's default `DocumentBuilderFactory` resolves
external entities and DTDs unless told not to — the standard Java XXE
footgun. Surefire's own XML writer escapes test output when it generates
`TEST-*.xml` (a malicious test's `<system-out>` content can't inject raw
markup through Surefire's own writer), which is *why* this input can be
treated as trusted — but that assumption is worth stating and defending
explicitly rather than relying on implicitly, since it's the entire basis
for not treating the report as untrusted input. The `annotate` goal's XML
reader SHALL disable DOCTYPE processing and external entity resolution
regardless (`FEATURE_SECURE_PROCESSING` or equivalent) — a cheap,
essentially-free hardening step that removes the dependency on that
trust assumption holding forever, flagged during security review as
worth doing even though the immediate risk today is low.

## Risks / Trade-offs

- **Reflection-based class loading in a Mojo has real classpath
  complexity** — the plugin needs the project's own test dependencies
  resolvable when it loads compiled test classes to inspect their
  annotations. Mitigated by running the `annotate` goal with the
  project's test classpath explicitly added
  (`MavenProject.getTestClasspathElements()`), the standard way Maven
  plugins that touch compiled test code do this.
- **Coupling to Surefire's XML schema, which has no formal versioned
  contract** — the same risk `pytest-testpulse` accepted for pytest's own
  junitxml format. Mitigated by targeting the documented, long-stable
  subset of the schema (`<testcase classname name>`,
  `<properties><property name value>`).
- **No attachments in v1** means a Maven team wanting screenshot evidence
  has no path yet — accepted as a deliberate, scoped-out follow-up.
- **Multi-module reactor builds are the one execution shape the pytest
  sibling never had to prove correct** — pytest has no equivalent to a
  Maven reactor. `annotate`/`submit` reading/writing the *correct*
  module's `target/surefire-reports/` (via that module's own
  `MavenProject` context, not the reactor root's) needs its own
  integration-test coverage, not just a written claim that
  `getTestClasspathElements()` is module-scoped — see tasks.md.
- **The token's config precedence (system property, then env var, then
  pom) still allows a token in a `-D` flag or a committed pom**, exactly
  like `pytest-testpulse`'s own `--testpulse-token` CLI flag ranks above
  its env var too — not a new pattern this change invents, but flagged
  during security review as worth an explicit README warning (task 5.2)
  against actually using either of those two for a real token, rather
  than presenting all three sources as equally fine.
- **Maven Central publishing is meaningfully more involved than PyPI's
  trusted publishing** (which `pytest-testpulse` used with zero stored
  secrets) — it requires GPG-signed artifacts and a Sonatype Central
  Portal account/namespace registration, not just a repo-to-registry OIDC
  handshake. This is real one-time setup work (comparable to the PyPI
  trusted-publisher registration `pytest-testpulse` needed a human to do
  manually — see that plugin's release history) that whoever implements
  task 5.1 should expect and budget time for, not a "should just work"
  assumption carried over from the pytest release.
