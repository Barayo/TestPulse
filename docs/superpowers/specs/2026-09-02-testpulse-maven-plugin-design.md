# testpulse-maven-plugin — design

## Context

`add-execution-import` (#38) shipped `POST
/api/v1/projects/{projectKey}/imports`, matching `<testcase>` entries in a
JUnit XML report to existing cases by a `testpulse_case_key` `<property>`.
Issue #58 tracked installable plugins for all four major JUnit-XML-producing
ecosystems; it was split into #154 (pytest, shipped as `pytest-testpulse`
v1.0.1), #155 (npm/Jest), #156 (Maven), #157 (Gradle). This document scopes
**#156 only** — the Maven plugin.

Unlike pytest, Maven's Surefire test runner has **no mechanism at all** for
writing custom per-`<testcase>` properties into its JUnit XML report.
Research during this design pass confirmed this is a long-standing, still-
open gap in Surefire itself: JUnit 5's `TestReporter.publishEntry()`
entries are never written to Surefire's XML output (tracked upstream since
JUnit 5.0.2, ~2017, unresolved as of 2026), and no existing library fills
this gap. Whatever this plugin does, it has to be built from scratch, and
it cannot happen *during* the test run the way pytest's `record_property()`
does — Surefire's XML writer is a fixed, unextendable internal component.
Property injection has to happen as a **separate step after Surefire
finishes**.

## Goals / Non-Goals

**Goals:**
- A Maven user can tag a test method with a case key and have that key
  land in Surefire's `TEST-*.xml` output as a `testpulse_case_key`
  property, the same property name the import API already reads.
- Works for both JUnit 4 and JUnit 5 test suites, with no per-framework
  runtime integration to build or maintain.
- The plugin also submits the annotated report to the import endpoint,
  matching `pytest-testpulse`'s behavior and its already-validated
  201/207/error exit-code policy.

**Non-Goals (v1):**
- Per-invocation case keys for parameterized tests (`@ParameterizedTest`,
  JUnit 4 `@RunWith(Parameterized.class)`) — every invocation of an
  annotated method shares one case key, the same simplification
  `pytest-testpulse` makes for parametrized pytest tests.
- Attachments (`testpulse_attach`'s Maven equivalent) — Maven's
  multi-module, multi-report structure makes "which file belongs to which
  result" a genuinely different problem than pytest's single-process case;
  deferred to its own follow-up design rather than rushed here.
- TestNG (a different, less common Maven test framework) — JUnit 4/5 only.
- Dry-run preview — worth adding for parity once the core mechanism is
  proven; not blocking v1.

## Decisions

**Mechanism: reflection-only post-processor, not a JUnit runtime
extension.** A custom `@TestPulse(caseKey, platform = "", version = "",
tags = {})` annotation (`RetentionPolicy.RUNTIME`) goes on test methods.
A Maven plugin goal, bound to run immediately after `surefire:test`, loads
the project's compiled test classes via reflection, matches each
`TEST-*.xml`'s `<testcase classname="..." name="...">` to the
corresponding `Method` by class + method name, and rewrites the XML file
in place with a `<properties>` block carrying `testpulse_case_key` (and
whichever of `testpulse_platform`/`testpulse_version`/`testpulse_tags`
were supplied) — the same property names `pytest-testpulse` and the raw
`conftest.py` snippet already write, so the import API needs no changes.

This was the one decision genuinely debated during design. The
alternative — a JUnit 5 `Extension` capturing annotation data live during
the run into a side-channel file, merged into the XML afterward — was
rejected because achieving JUnit 4 support under that model requires
building a *second*, entirely different runtime integration (JUnit 4's
`TestRule`/`RunListener` APIs are incompatible with JUnit 5's extension
model), on top of the same post-processing merge step either way. The
reflection-only approach never hooks into either framework's execution
model at all — it just reads compiled classes and rewrites XML after the
fact — so JUnit 4 and JUnit 5 support come from the same code path with no
version-specific logic to write or keep working across JUnit upgrades.

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
  - **`annotate`**, bound to the `test` phase (after `surefire:test`
    itself, via execution ordering): does the reflection + XML rewrite
    described above.
  - **`submit`**, bound to the `verify` phase (after `annotate`): reads
    the annotated report(s) and `POST`s to
    `/api/v1/projects/{projectKey}/imports`, applying the same
    201/207/error handling as `pytest-testpulse`:
    | Response | Behavior |
    |---|---|
    | `201` all matched | build succeeds; summary logged |
    | `207` some unmatched | build succeeds by default (warning logged, names unmatched keys, points at the escalation flag below); fails the build if `failOnUnmatched` is set |
    | network/auth/4xx/5xx error | always fails the build, unconditionally |

**Config**, mirroring `pytest-testpulse`'s CLI-flag/env-var/ini-option
precedence in Maven's own idiom: each setting is a `@Parameter(property =
"testpulse.<name>", ...)`, which Maven itself already resolves from a
system property (`-Dtestpulse.url=...`) or a `<configuration>` block in
the pom, in that order. `failOnUnmatched` follows the same pattern
(`-Dtestpulse.failOnUnmatched=true` / `<configuration><failOnUnmatched>`).
The token specifically also checks the `TESTPULSE_TOKEN` environment
variable explicitly in the Mojo (Maven has no built-in env-var-to-property
mapping), so CI secrets never need to be written into a `-D` flag or a
committed pom — same secret-handling guidance as the pytest plugin's
README.

**Matching `<testcase>` to `Method`**: for v1, only test names that map
cleanly to exactly one compiled method (the common, non-parameterized
case) are annotated; anything Surefire decorates (parameterized-test
invocation suffixes like `[1]`, dynamic/nested JUnit 5 tests) is left
alone with a build-log note, not silently mismatched or guessed at — this
is the direct consequence of the parameterized-tests non-goal above, not
a separate decision.

## Risks / Trade-offs

- **Reflection-based class loading in a Mojo has real classpath
  complexity** — the plugin needs the project's own test dependencies
  (JUnit itself, any test-scoped libraries the annotated classes import)
  resolvable when it loads those classes to inspect their annotations.
  Mitigated by running the `annotate` goal with the project's test
  classpath explicitly added (Maven's `MavenProject.getTestClasspathElements()`),
  the standard way Maven plugins that need to touch compiled test code do
  this (e.g. surefire itself, coverage tools).
- **Coupling to Surefire's XML schema, which has no formal versioned
  contract** — the same risk `pytest-testpulse` accepted for pytest's own
  (also-informal but far more stable) junitxml format. Mitigated by
  targeting the documented, long-stable subset of the schema (`<testcase
  classname name>`, `<properties><property name value>`) rather than
  anything Surefire-version-specific.
- **No attachments in v1** means a Maven team wanting screenshot evidence
  has no path yet — accepted as a deliberate, scoped-out follow-up rather
  than under-designing it here.

## Open Questions

None outstanding.
