## 1. Repo scaffolding

- [ ] 1.1 Create the public repo `Barayo/testpulse-annotations` (MIT license, `groupId io.github.barayo`, minimal `pom.xml`, `src/main/java/io/github/barayo/testpulse/TestPulse.java` package layout)
- [ ] 1.2 Implement `@TestPulse` in `testpulse-annotations`: `String caseKey()`, `String platform() default ""`, `String version() default ""`, `String[] tags() default {}`, `@Retention(RetentionPolicy.RUNTIME)`, `@Target(ElementType.METHOD)`
- [ ] 1.3 Create the public repo `Barayo/testpulse-maven-plugin` (MIT license, `groupId io.github.barayo`, `maven-plugin` packaging, `pom.xml` depending on `maven-plugin-api`, `maven-plugin-annotations`, `maven-project`, and `testpulse-annotations`)
- [ ] 1.4 Add dev/test dependencies: JUnit 5, a mock HTTP server library (e.g. `mockwebserver` or WireMock) for `submit`-goal tests, and `maven-invoker-plugin` wiring for end-to-end goal tests against synthetic sample projects under `src/it/`
- [ ] 1.5 Add GitHub Actions workflow: build+test matrix (a couple of recent Maven/JDK LTS combinations) on every PR, for both repos

## 2. Annotation matching and XML property injection (test-first)

- [ ] 2.1 Write a failing unit test: given a compiled test class with one `@TestPulse(caseKey = "LOGIN-42")`-annotated method and a synthetic Surefire-shaped `TEST-*.xml` DOM for that class, assert the property-injection function adds `<property name="testpulse_case_key" value="LOGIN-42"/>` under the matching `<testcase>`
- [ ] 2.2 Implement the reflection lookup (class + method name → `Method`) and XML `<properties>` injection function to pass 2.1, using an XML parser with DOCTYPE processing and external entity resolution disabled (`FEATURE_SECURE_PROCESSING` or equivalent) from the start, not added later
- [ ] 2.3 Write failing unit tests for optional `platform`/`version`/`tags` being written only when non-default, and for an unannotated method's `<testcase>` being left untouched; implement until green
- [ ] 2.4 Write a failing unit test: a `<testcase name="...">` value that doesn't match exactly one compiled method (simulating a parameterized-test suffix) is left unmodified and produces a logged note; implement the exact-match-only guard until green
- [ ] 2.5 Write a failing unit test: two methods sharing a name (an overload), one carrying `@TestPulse`, resolves to more than one `Method` and is left unmodified with a logged "ambiguous" note; implement the overload check (extending 2.4's guard) until green
- [ ] 2.6 Write a failing unit test: reflecting over a class that throws `NoClassDefFoundError` on load is caught, logs a warning naming the class, and does not prevent annotations in other classes from being injected; implement the per-class try/catch until green
- [ ] 2.7 Write a failing unit test: `annotate` given a project where a `@TestPulse`-annotated method exists but no corresponding `TEST-*.xml` file is present fails with a message naming the expected report path (not a raw exception); implement the check until green
- [ ] 2.8 Write a failing unit test asserting a `TEST-*.xml` containing a `<!DOCTYPE>` with an external entity reference is parsed without the entity being resolved/expanded; confirm 2.2's parser configuration already satisfies this (should already be green from 2.2 if the hardening was done there — this test exists to prove it, not to introduce new production code)
- [ ] 2.9 Write a failing `maven-invoker`-based integration test (`src/it/annotate-basic/`): a real tiny Maven project with one `@TestPulse`-annotated JUnit 5 test, run `mvn test`, assert the real `target/surefire-reports/TEST-*.xml` produced actually contains the injected property; implement the `annotate` Mojo (phase binding to `test`, wiring the project's test classpath via `MavenProject.getTestClasspathElements()`, invoking the injection function from 2.2) until green

## 3. Config resolution (test-first)

- [ ] 3.1 Write failing unit tests for `url`/`project`/`failOnUnmatched`: system-property-alone, pom-configuration-alone, system-property-overrides-pom-configuration
- [ ] 3.2 Write failing unit tests for `token`: env-var-alone, system-property-overrides-env-var, env-var-overrides-pom-configuration
- [ ] 3.3 Implement `@Parameter`-annotated fields and a shared resolver method (checking `System.getenv("TESTPULSE_TOKEN")` for the token specifically) until 3.1–3.2 pass

## 4. Submission and build-outcome behavior (test-first)

- [ ] 4.1 Write a failing unit test: with zero `@TestPulse`-annotated methods found anywhere and none of `url`/`token`/`project` configured, assert `submit` performs no configuration resolution, makes no request, and the build succeeds; implement the skip-when-nothing-annotated check until green
- [ ] 4.2 Write a failing unit test: mock a `201` response from the import endpoint, assert the `submit` goal does not throw/fail and logs the matched-count summary
- [ ] 4.3 Write a failing unit test: mock a `207` response, default config, assert the goal does not fail the build and logs unmatched case keys plus the `failOnUnmatched` pointer
- [ ] 4.4 Write a failing unit test: mock a `207` response with `failOnUnmatched` set, assert the goal throws `MojoFailureException` (failing the build)
- [ ] 4.5 Write a failing unit test: mock a network error and separately a `401`/`400`/`5xx` response, assert the goal always throws `MojoFailureException` regardless of `failOnUnmatched`
- [ ] 4.6 Implement the `submit` Mojo (phase binding to `test`, immediately after `annotate`'s own execution — not `verify`, so a plain `mvn test` submits and a broken config fails fast rather than after every other `verify`-bound plugin has already run; reading the annotated report(s), POSTing to `/api/v1/projects/{projectKey}/imports`, branching on response per the table in design.md) until 4.1–4.5 pass
- [ ] 4.7 Write a failing `maven-invoker`-based integration test (`src/it/submit-basic/`) against a mocked/stubbed import endpoint: run `mvn test` (not `mvn verify`) on a sample project with an annotated test and confirm the full `annotate` → `submit` execution ordering actually runs within the `test` phase; implement any remaining wiring until green
- [ ] 4.8 Write a failing `maven-invoker`-based integration test (`src/it/multi-module/`): a synthetic multi-module reactor project with `@TestPulse`-annotated tests in two different modules, run `mvn test` from the reactor root, assert each module's `annotate`/`submit` reads and writes that module's own `target/surefire-reports/`, not the reactor root's or another module's; fix any per-module `MavenProject` context bugs the test surfaces

## 5. Release automation

- [ ] 5.1 Configure automated versioning/publishing to Maven Central for both `testpulse-annotations` and `testpulse-maven-plugin` (GPG-signed releases via Central's requirements — a Sonatype Central Portal account and `io.github.barayo` namespace registration is real one-time setup work, budget time for it rather than assuming it "just works" the way PyPI trusted publishing did — triggered from CI on merge to `main`, following semantic versioning from commit messages)
- [ ] 5.2 Write README (install/config for both artifacts, the `@TestPulse` annotation reference, phase-binding example pom snippet, config-precedence table, exit-code table, an explicit warning against putting a real token in `-Dtestpulse.token=...` or a committed pom's `<configuration>` — recommend `TESTPULSE_TOKEN` — since both riskier options remain fully supported and even take precedence) and CONTRIBUTING (unit + `maven-invoker` test setup) for both repos

## 6. TestPulse monorepo docs update

- [ ] 6.1 Add a "Maven: `testpulse-maven-plugin`" section to `docs/importing-results.md`, following the same pattern already used there for the pytest plugin section
