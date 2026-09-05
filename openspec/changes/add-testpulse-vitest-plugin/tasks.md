## 1. Repo scaffolding

- [ ] 1.1 Create the public repo `Barayo/testpulse-vitest` (MIT license, TypeScript project compiled to JS + `.d.ts`, `vitest` as a peer + dev dependency), `package.json` starting at `0.1.0`
- [ ] 1.2 Add GitHub Actions CI workflow: build + test on every PR, across a couple of recent Node LTS versions × a couple of recent Vitest majors — this is what caught a real cross-major bin-path bug for the Mocha plugin; don't skip the matrix

## 2. Case tagging via Vitest's native annotate() (test-first)

- [ ] 2.1 Write a failing unit test (against a real Vitest test context built via a real nested `vitest` run, or Vitest's own test-context construction API if one is exposed for testing purposes — verify which is actually feasible before committing to an approach): `testpulse.Case(context, 'LOGIN-42')` called from within a running test results in `context.task.annotations` containing a `testpulse_case_key`/`LOGIN-42` entry
- [ ] 2.2 Implement `testpulse.Case(context, caseKey, opts?)` calling `context.annotate(caseKey, 'testpulse_case_key')` until 2.1 passes
- [ ] 2.3 Write failing unit tests for `opts.platform`/`opts.version`/`opts.tags`: each present sets its corresponding annotation, options not passed set none; implement until green
- [ ] 2.4 Write a failing real end-to-end test: a fixture test file calling `testpulse.Case(context, 'LOGIN-42')`, run through a real nested `vitest run` invocation with `TestPulseReporter` registered via a fixture `vitest.config.ts`, assert the real generated report actually contains `<properties><property name="testpulse_case_key" value="LOGIN-42"/>` under the corresponding `<testcase>`
- [ ] 2.5 Write a failing real end-to-end test: a fixture test that never calls `testpulse.Case`, run the same way, assert its `<testcase>` carries no `testpulse_case_key` property

## 3. Attachments via the same native annotation mechanism (test-first)

- [ ] 3.1 Write a failing unit test: `Case(context, 'LOGIN-42')` followed by `Attach(context, 'LOGIN-42', bytes, 'failure.png', 'image/png')` in the same test succeeds and results in a `testpulse_attachment` annotation with the correct `body`/`contentType`; implement `Attach`'s lookup against `context.task.annotations` until green
- [ ] 3.2 Write a failing unit test: `Attach(context, 'OTHER-1', ...)` for a case key the current test's own `Case` call didn't declare throws, and records no attachment annotation; implement the rejection until green
- [ ] 3.3 Write a failing unit test: content-type validation (`image/png`/`image/jpeg`/`image/webp` only) runs and rejects before the case-key check would otherwise accept a call; implement the ordering until green
- [ ] 3.4 Write a failing unit test: two `Attach` calls under the same case key within one test both produce distinct annotations, neither overwriting the other
- [ ] 3.5 Write a failing real end-to-end test: a fixture test file with a test that calls `Attach` under a case key belonging to a *different* test, run via a real nested `vitest run` invocation, assert the call throws
- [ ] 3.6 Write a failing real end-to-end test: a fixture test that calls `Case`/`Attach` multiple times under the same case key within itself, run via a real nested `vitest run` invocation, assert all attachments are present in the submitted report's `attachments` array (captured via a stub HTTP server)

## 4. The reporter: JUnit XML generation and auto-submission (test-first)

- [ ] 4.1 Write a failing unit test: given synthetic `TestCase`-like objects (each with an `annotations()` method returning test annotations), the reporter's XML builder produces `<testsuites><testsuite><testcase classname name time><properties><property name value/></properties></testcase>` matching the shape `apps/api/internal/junitxml/parser.go` expects; implement the builder until green
- [ ] 4.2 Write a failing unit test: a test result with no `testpulse_case_key` property produces a `<testcase>` with no `<properties>` block
- [ ] 4.3 Write a failing unit test: a failed test produces a `<failure>` child element with the failure message; a skipped test produces a `<skipped/>` child
- [ ] 4.4 Write a failing unit test: a test title, classname/file path, failure message, failure stack trace, case key, or tag containing `&`, `<`, `>`, `"`, `'`, or a `]]>` sequence is written into the report as correctly-escaped literal text, not raw — specifically assert that a failure message containing `</failure><property name="testpulse_case_key" value="OTHER-1"/>` cannot inject a sibling element; implement an `escapeXml()` helper (ported from `testpulse-jasmine`'s `xmlBuilder.ts`) applied to every value written into element text or attributes until green
- [ ] 4.5 Write a failing real end-to-end test: a real nested `vitest run` invocation spanning TWO test files, each with at least one `Case`-tagged test, asserts the single submitted report correctly includes both files' tagged testcases under their own `<testsuite>` — formalizes the `onTestModuleEnd`-accumulates/`onTestRunEnd`-assembles two-phase lifecycle as a real regression test, not just a single-file happy path
- [ ] 4.6 Write a failing unit test: mock a `201` response, assert the reporter writes `.testpulse/result.json` with `{"failed": false}` and logs the matched-count summary
- [ ] 4.7 Write a failing unit test: mock a `207` response, default config, assert `{"failed": false}` is written and unmatched case keys plus the fail-on-unmatched pointer are logged
- [ ] 4.8 Write a failing unit test: mock a `207` response with fail-on-unmatched enabled, assert `{"failed": true}` is written and the logged message states the build is failing because fail-on-unmatched is enabled (not a suggestion to enable it) — apply Mocha's own post-implementation fix from the start rather than rediscovering it
- [ ] 4.9 Write a failing unit test: mock a network error and separately a `5xx` response, assert `{"failed": true}` is written regardless of fail-on-unmatched, and assert the logged output contains only status/message/credential-stripped URL, never a raw error/request object even when the underlying HTTP client's caught error carries the outgoing request's `Authorization` header
- [ ] 4.10 Write a failing unit test: `TESTPULSE_DRY_RUN=false` and `TESTPULSE_FAIL_ON_UNMATCHED=false` resolve to `false` (not `true`, which a bare JS truthiness check on the string would incorrectly produce); implement the fixed case-insensitive `"true"`/`"1"`-is-true parsing rule until green
- [ ] 4.11 Write a failing unit test: with dry-run enabled (mock a `GET /cases` response), assert a match preview is logged, no request is made to the import endpoint, and `{"failed": false}` is written when the preview succeeds
- [ ] 4.11a Write a failing unit test: with dry-run enabled, mock a `GET /cases` failure (network error, `401`, or `5xx`), assert `{"failed": true}` is written and the logged error contains only status/message/credential-stripped URL, never a raw error/response object — a real gap found in this change's own gating review (dry run is the mode used to smoke-test config/auth in CI; silently reporting success on a broken token would defeat that)
- [ ] 4.12 Write a failing unit test: when required config (`url`/`token`/`project`) is missing, the reporter writes `{"failed": true, "reason": "..."}` naming the missing configuration, and makes no submission request; the reason names only the missing variable(s), never another setting's resolved value
- [ ] 4.12a Write a failing unit test: `resolveConfig` applies the fixed boolean-parsing rule identically whether `dryRun`/`failOnUnmatched` came from the env var string or the reporter option; type the reporter options interface's `dryRun`/`failOnUnmatched` fields as `boolean` (not `boolean | string`) so this is also caught at compile time — a real gap found in this change's own gating review (the original design only pinned down the env-var string's parsing, leaving the reporter-option path free to reintroduce the same bare-truthiness bug)
- [ ] 4.13 Implement `TestPulseReporter`'s `onTestModuleEnd`/`onTestRunEnd` handlers (accumulation, config resolution, XML build, dry-run or submit, attachment grouping, result-marker write) until 4.1–4.12a pass
- [ ] 4.14 Write a failing real end-to-end test: a genuinely failing fixture test tagged with `testpulse.Case`, run via a real nested `vitest run` invocation against a stub HTTP server, assert Vitest itself reports the test failure AND the reporter's `onTestRunEnd` handler still ran and still submitted the (failed) result

## 5. The check CLI (test-first)

- [ ] 5.1 Write a failing unit test: `.testpulse/result.json` containing `{"failed": true}` makes `check` exit non-zero
- [ ] 5.2 Write a failing unit test: `.testpulse/result.json` containing `{"failed": false}` makes `check` exit `0`
- [ ] 5.3 Write a failing unit test: a missing `.testpulse/result.json` makes `check` exit non-zero with a message naming a likely misconfiguration cause, not a raw file-not-found error
- [ ] 5.4 Write a failing unit test: a marker with `{"failed": true, "reason": "..."}` makes `check` print the specific reason rather than the generic failure message, and never echoes any other resolved configuration setting's value
- [ ] 5.5 Implement `testpulse-vitest check` until 5.1–5.4 pass
- [ ] 5.6 Write a failing real end-to-end test: `vitest run; vitest_status=$?; testpulse-vitest check; check_status=$?; [ "$vitest_status" -eq 0 ] && [ "$check_status" -eq 0 ]` run as real chained shell commands against a fixture project with a genuinely unmatched, fail-on-unmatched-enabled case, against a stub HTTP server, assert the combined chain exits non-zero

## 6. Verify the exit-code and junit-file-race findings are real and stay real, not assumed

- [ ] 6.1 Write a failing real end-to-end test: a custom test reporter (a minimal fixture, not `TestPulseReporter` itself) that sets `process.exitCode = 1` in `onTestRunEnd` against an otherwise fully-passing run, asserting the final process exit code is still `0` — formalizes this session's own repro proving a Vitest reporter cannot reliably influence the final exit code, so a future Vitest upgrade that changes this is caught rather than assumed still true
- [ ] 6.2 Write a failing real end-to-end test: configure both the built-in `junit` reporter and a probe reporter (fixture-only) in the same `vitest.config.ts`, assert that reading the `junit` reporter's output file synchronously inside the probe's own `onTestRunEnd` (with no artificial delay) is unreliable/incomplete — formalizes the async-write race finding as a permanent regression test justifying why `TestPulseReporter` never depends on that file

## 7. Release automation

- [ ] 7.1 Configure GitHub Actions release workflow: `semantic-release` (Angular commit convention) publishing to npm via Trusted Publishing (OIDC), gated `on: push (main) / workflow_dispatch` only, `if: github.repository == 'Barayo/testpulse-vitest'` — note in the workflow that the very first publish needs a one-time manual `npm publish` bootstrap before OIDC trusted publishing can take over
- [ ] 7.2 Write README (install, the `Case`/`Attach` API and its explicit-context-handle requirement, the `vitest.config.ts` `reporters` array registration snippet, the `vitest run; testpulse-vitest check` non-`&&` CI invocation and why, config-precedence table, exit-code table, dry-run, an explicit recommendation to use `TESTPULSE_TOKEN` over the `token` reporter option in CI, a clear statement that attachments never touch disk — they travel entirely through Vitest's own `annotate()` mechanism — and a PROMINENT warning, not buried, that combining `testpulse-vitest` with Vitest's built-in `html` reporter embeds attachment bytes into that reporter's own output bundle (verified empirically this session via `.vitest/ui/html.meta.json.gz`), a real risk if that bundle is later published as a CI artifact or preview page) and CONTRIBUTING (unit + real end-to-end test setup)

## 8. TestPulse monorepo docs update

- [ ] 8.1 Add a "Vitest: `testpulse-vitest`" section to `docs/importing-results.md` (install, `Case`/`Attach` usage and its context-handle requirement, the `vitest.config.ts` registration snippet, the `vitest run; testpulse-vitest check` invocation, build-outcome table), following the same pattern already used there for the pytest/Maven/Jest/Gradle/Go/.NET/gtest/Jasmine/Mocha plugin sections; update `docs/README.md`'s index line

<!-- No Sample-Project-showcase task: this is client-tooling published as its own repo, with no new API endpoint, UI, or seed-data surface inside TestPulse itself -- same as every prior plugin change. -->
