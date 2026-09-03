## Why

As a Java/Kotlin developer running Gradle's `test` task in CI, when I want
to report results into TestPulse, I want a way to attach a case key to a
test that ends up in the generated JUnit XML `<properties>`, since Gradle
has no `record_property()`-equivalent out of the box. `add-execution-import`
(#38) shipped the import API; #58 tracked real plugins for every major
JUnit-XML ecosystem, split into #154 (pytest, shipped), #155 (npm/Jest,
shipped), #156 (Maven, shipped), #157 (Gradle, this change). Gradle's own
`Test` task, like Surefire, has no hook for writing custom per-testcase
properties into its XML report — confirmed via a still-open Gradle issue
(gradle/gradle#36762) requesting exactly this.

## What Changes

- New public repo `Barayo/testpulse-gradle-plugin` (MIT license), published
  to the Gradle Plugin Portal as `io.github.barayo.testpulse`.
- Reuses the already-published `testpulse-annotations` (`@TestPulse`) as a
  `testImplementation` dependency — no second annotation package.
- Two Gradle tasks, auto-wired via `finalizedBy` so a plain `./gradlew
  test` runs the whole pipeline: `testpulseAnnotate` (reflection-based XML
  property injection, same mechanism as `testpulse-maven-plugin`'s
  `annotate` goal) and `testpulseSubmit` (submits to
  `POST /api/v1/projects/{projectKey}/imports`, same 201/207/error policy
  already shipped three times, plus a `dryRun` preview).
- `TestPulseAttachments.attach(caseKey, bytes, filename, contentType)` —
  screenshot/file attachments in v1 (deferred by the Maven plugin, included
  here), with a class-level case-key allowlist (via `StackWalker`) so a
  test can't attach evidence under a case key belonging to a different
  class, and invocation-unique (not case-key-unique) scratch-dir
  filenames so parameterized tests calling `attach()` multiple times under
  the same case key don't silently overwrite each other or race under
  parallel test forks.
- `docs/importing-results.md` gains a "Gradle: `testpulse-gradle-plugin`"
  section, replacing the current bare "Gradle" stub.

## Capabilities

### New Capabilities
- `gradle-import-plugin`: the `testpulse-gradle-plugin` artifact's
  observable contract — the reused `@TestPulse` annotation's role in this
  ecosystem, the `testpulseAnnotate`/`testpulseSubmit` task behavior, the
  attachment API's class-level allowlist behavior, config resolution, and
  exit-code/dry-run policy.

### Modified Capabilities
(none — this adds a new capability only; the import API itself, shipped by
`add-execution-import`, is unchanged)

## Impact

- New standalone repo/package, not this monorepo's code. No new API
  endpoints, no UI change, no seed data change (client-tooling change,
  Sample-Project-showcase task doesn't apply — see `tasks.md`).
- `docs/importing-results.md` and `docs/README.md` (index line, if scope
  changes) updated in this monorepo.
- Depends on the existing `POST /api/v1/projects/{projectKey}/imports`
  contract (`add-execution-import`, #38) and the existing
  `testpulse-annotations` Maven Central artifact — no changes to either
  required.
