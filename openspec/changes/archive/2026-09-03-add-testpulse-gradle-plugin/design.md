## Context

`add-execution-import` (#38) shipped `POST
/api/v1/projects/{projectKey}/imports`, matching `<testcase>` entries in a
JUnit XML report to existing cases by a `testpulse_case_key` `<property>`.
Issue #58 tracked installable plugins for all four major JUnit-XML-producing
ecosystems; it was split into #154 (pytest, shipped as `pytest-testpulse`
v1.0.1), #155 (npm/Jest, shipped as `testpulse-jest`), #156 (Maven, shipped
as `testpulse-annotations` + `testpulse-maven-plugin`), #157 (Gradle, this
change).

Gradle's `Test` task has no native hook for injecting custom `<properties>`
into its JUnit XML output — confirmed via a still-open, unresolved Gradle
issue ([gradle/gradle#36762](https://github.com/gradle/gradle/issues/36762))
requesting exactly this feature. Gradle's `TestListener` API
(`beforeTest`/`afterTest`, receiving `TestDescriptor`/`TestResult`) gives
live callbacks during the run, but there's no way to feed that data back
into Gradle's own XML writer — the report still has to be rewritten after
the fact, the same fundamental gap `testpulse-maven-plugin` found in
Surefire, in an unrelated codebase. This plugin reuses that proven
mechanism (reflection-only post-processor, no JUnit runtime extension,
works uniformly for JUnit 4/5) adapted to Gradle's task API, rather than
re-deriving a new approach.

## Goals / Non-Goals

**Goals:**
- Reuse the already-published `testpulse-annotations` (`@TestPulse`) as a
  normal dependency — a Java/Kotlin codebase using both Maven and Gradle
  in different modules shares the exact same annotated test source.
- A plain `./gradlew test` both annotates the report and submits it, no
  extra task invocation needed, matching the parity `mvn test` already has.
- Screenshot/file attachments in v1 (deferred by `testpulse-maven-plugin`),
  with a client-side trust boundary strong enough that a test cannot
  silently attach evidence to a case it doesn't own.
- A `dryRun` preview, matching `testpulse-jest`'s parity rather than
  repeating `testpulse-maven-plugin`'s still-unaddressed deferral of it.

**Non-Goals (v1):**
- TestNG — JUnit 4/5 only, same as the Maven plugin.
- Per-invocation case keys for parameterized tests in the
  annotation-matching sense — every invocation of an annotated method
  still shares one case key for XML property injection, same
  simplification the other three plugins make. (This is distinct from the
  attachment fix below, which allows multiple *attachments* per shared
  case key — that's about not losing evidence, not about giving
  parameterized invocations distinct case keys.)

## Decisions

### Repo & packaging
New public repo `Barayo/testpulse-gradle-plugin`, MIT license, Gradle
plugin id `io.github.barayo.testpulse`, depending on `testpulse-annotations`
(`io.github.barayo:testpulse-annotations`, test-scoped) for the shared
`@TestPulse` annotation — no second annotation package.

### Two tasks, auto-wired
Mirroring `testpulse-maven-plugin`'s two-goal structure, mapped onto
Gradle's task graph via `finalizedBy` so a plain `./gradlew test` runs
everything automatically:

- **`testpulseAnnotate`**: reflection-based, identical mechanism to
  `testpulse-maven-plugin`'s `annotate` goal — loads compiled test
  classes, matches `@TestPulse`-annotated methods to
  `build/test-results/test/TEST-*.xml` testcases by class+method name,
  rewrites in `<properties>`. Same exact-match-only rule: a `<testcase>`
  Gradle has decorated (a parameterized-test invocation suffix, a
  dynamic/nested test) or whose class+name resolves to more than one
  method (an overload) is left unmodified with a logged note, not guessed
  at. XML parsing uses the same XXE-hardened configuration pattern as
  `SurefireReportAnnotator.newSecureDocumentBuilderFactory()`.
- **`testpulseSubmit`**: reads the annotated report plus the attachment
  scratch directory, `POST`s to `/api/v1/projects/{projectKey}/imports`,
  and applies the same 201/207/error policy validated three times already:

  | Response | Behavior |
  |---|---|
  | `201` all matched | build succeeds; summary logged |
  | `207` some unmatched | build succeeds by default (warning logged, names unmatched keys, points at `failOnUnmatched`); fails the build if `failOnUnmatched` is set |
  | network/auth/4xx/5xx error | always fails the build, unconditionally |

  A `dryRun` option does a read-only `GET /cases` preview instead of
  submitting, never affecting the build outcome — included in v1 here
  (unlike `testpulse-maven-plugin`'s still-unaddressed deferral) to match
  `testpulse-jest`'s parity.

### Attachments: a caller-supplied case key, with two trust/collision fixes
`TestPulseAttachments.attach(caseKey, bytes, filename, contentType)` is
callable from inside a running test body. The test passes its own case key
explicitly, rather than the plugin trying to auto-detect "the currently
running test" — the reflection-only architecture deliberately avoids any
JUnit-version-specific runtime hook (that's the whole reason it works
uniformly for JUnit 4 and 5), and the clean ways to auto-detect "current
test" (JUnit 5's `TestInfo` injection, a `TestWatcher`/extension) would
reintroduce exactly that coupling.

This explicit-argument design was reviewed by Luis (security) before
implementation and required two fixes, both incorporated here:

1. **Class-level case-key allowlist, closing cross-case misattribution.**
   TestPulse's server-side contract (`run-result-attachments` capability)
   only checks that an attachment's case key matches *some* case matched
   in the same import — it has no way to verify the bytes actually came
   from that case's own test execution. A bare `attach(caseKey, ...)` with
   no binding to the calling test would make the client the *only*
   enforcement point, and offer none: a typo'd (or malicious) case key
   would silently attach evidence to the wrong result, indistinguishable
   from genuine evidence. `attach()` uses `StackWalker` (no JUnit-version-
   specific hook needed) to identify the calling class, reflects over that
   class's own methods to collect the set of `@TestPulse`-annotated case
   keys declared on it, and rejects (throws) if the passed `caseKey` isn't
   in that set. This closes the dangerous cross-class/cross-module
   spoofing case while accepting same-class misuse (a test attaching under
   a *sibling* test's case key in the same class) as a smaller residual
   risk, not worth the complexity of per-method detection.
   `testpulseSubmit` re-applies the same class-level check server-request-
   side, using the case keys it already discovered reflectively during
   `testpulseAnnotate`, as defense in depth — this also naturally enforces
   multi-project isolation for attachments, not just the XML report.
2. **Invocation-unique filenames, closing a collision/race.** Unlike
   `testpulse-jest`, which hashes a framework-guaranteed-unique test name,
   this design hashes caller-supplied `caseKey` — which is **not**
   invocation-unique, since `@ParameterizedTest`/data-driven tests
   legitimately call `attach()` multiple times under the same case key.
   Hashing `caseKey` alone would mean silent last-writer-wins overwrite is
   the *routine* case, not a rare edge case — and under Gradle's
   `maxParallelForks > 1`, two forked test JVMs writing the same hashed
   file concurrently is a real interleaving race, not hypothetical.
   Sidecar filenames are `hash(caseKey + a UUID generated fresh inside
   each attach() call)`. `testpulseSubmit` groups/aggregates multiple
   attachments per case key rather than assuming a 1:1 mapping.

Storage is a `build/testpulse/` scratch directory via real disk I/O, not
in-memory state — Gradle's `Test` task forks separate test-executor JVM
process(es) from the Gradle daemon/build process that later runs
`testpulseSubmit`, the same cross-process boundary problem `testpulse-jest`
solved for Jest's worker/main-process split. Only `image/png`,
`image/jpeg`, `image/webp` content types are accepted, validated before any
write — same allow-list as the other three plugins.

### Config: project property, then env var, then extension DSL
Mirroring `testpulse-maven-plugin`'s system-property/env-var/pom-config
precedence, mapped onto Gradle's own idioms:

```groovy
testpulse {
    url = 'http://localhost:8080'
    project = 'LOGIN'
    failOnUnmatched = false
    dryRun = false
}
```

| Setting | Command-line project property | Env var | Extension DSL |
|---|---|---|---|
| API base URL | `-Ptestpulse.url=...` | — | `url` |
| API token | `-Ptestpulse.token=...` | `TESTPULSE_TOKEN` | `token` |
| Project key | `-Ptestpulse.project=...` | — | `project` |
| Fail on unmatched | `-Ptestpulse.failOnUnmatched=...` | — | `failOnUnmatched` |
| Dry run | `-Ptestpulse.dryRun=...` | — | `dryRun` |

The token additionally checks `TESTPULSE_TOKEN` (checked between the
project property and the DSL block: project-property > env-var >
DSL-block), so CI secrets never need to be written into a `-P` flag or a
committed `build.gradle`. The resolved token is never logged, at any
Gradle log level including `--info`/`--debug` — carried over explicitly
from `SubmitMojo`/`ImportSubmitter`'s existing discipline (neither logs
the resolved token today, only run identifiers and counts).

### Multi-project builds
The plugin is applied per-subproject; each subproject's
`testpulseAnnotate`/`testpulseSubmit` reads/writes only that subproject's
own `build/test-results/` and `build/testpulse/`, mirroring the
multi-module handling already validated for Maven — including the
attachment allowlist, which is naturally subproject-scoped since it's
built from that subproject's own reflectively-discovered classes.

### Testing approach (TDD)
Gradle TestKit (`GradleRunner`) driving real, isolated Gradle builds
against fixture projects — the direct Gradle-ecosystem equivalent of
`maven-invoker-plugin`'s integration tests and `testpulse-jest`'s
nested-process e2e tests. Unit tests cover the reflection/XML-rewrite
logic, the attachment allowlist check, and the submission/exit-code
branches in isolation (HTTP mocked); a smaller number of real
TestKit-driven end-to-end tests prove the pieces integrate — including a
real test attempting cross-class attachment misattribution and confirming
it's rejected, and a real `@ParameterizedTest` calling `attach()` multiple
times under the same case key confirming all attachments survive, not
just the last one.

### CI / publishing
- GitHub Actions: build+test matrix (a couple of recent Gradle/JDK LTS
  combinations) on every PR.
- Release: Gradle Plugin Portal via `com.gradle.plugin-publish`,
  `GRADLE_PUBLISH_KEY`/`GRADLE_PUBLISH_SECRET` GitHub secrets (classic
  API-key auth, no OIDC). Unlike npm/PyPI, the Gradle Plugin Portal has no
  "the package must exist before trust can be configured" bootstrap
  problem — the API key pair can be generated once, upfront, and stored as
  secrets from the start, so CI can handle the *first* publish too, no
  manual bootstrap step needed for once among these four plugins.
- Release workflow gating explicitly mirrors
  `testpulse-maven-plugin/.github/workflows/release.yml`'s actual pattern
  — `on: push (main) / workflow_dispatch` only, `if: github.repository ==
  'Barayo/testpulse-gradle-plugin'`, secrets injected only into that job,
  never a `pull_request`-triggered workflow. Stated explicitly here per
  Luis's review, rather than left implicit.
- README: install (`plugins { id 'io.github.barayo.testpulse' version
  '...' }`), the `@TestPulse` annotation reference (pointing at
  `testpulse-annotations`'s own docs), the `TestPulseAttachments.attach()`
  API and its allowlist behavior, config-precedence table, exit-code
  table, dry-run. CONTRIBUTING: TestKit-based test setup.

## Risks / Trade-offs

- **Same-class attachment misuse is still possible** (a test attaching
  under a sibling test's case key within the same class) — accepted as a
  deliberately smaller residual risk than cross-class spoofing, which the
  class-level allowlist does close; per-method detection would need
  exactly the JUnit-version-specific hook the reflection-only architecture
  is built to avoid.
- **Two-fix attachment design (allowlist + invocation-unique filenames)
  is more complexity than any prior plugin's attachment mechanism** (Maven
  deferred attachments entirely; Jest's design didn't need either fix,
  since it derives identity from the framework's own guaranteed-unique
  test name rather than a caller-supplied string) — accepted because
  Gradle's reflection-only architecture rules out the mechanism that made
  Jest's simpler version safe by construction; both fixes were caught in
  gating review before implementation, not discovered after shipping.
- **Reflection-based class loading has the same classpath complexity
  `testpulse-maven-plugin` already accepted** (needs the project's test
  classpath resolvable when loading compiled classes) — same mitigation:
  Gradle's own `Test` task classpath is available to a task in the same
  project, the standard way Gradle plugins that need compiled test code
  access it.
- **Coupling to Gradle's own JUnit XML schema**, which (like Surefire's)
  has no formal versioned contract — same risk already accepted for the
  other two JVM-XML-producing plugins, mitigated the same way: targeting
  the long-stable subset (`<testcase classname name>`,
  `<properties><property name value>`).

## Open Questions

None outstanding.
