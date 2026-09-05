## 1. Repo scaffolding

- [ ] 1.1 Create the public repo `Barayo/testpulse-mocha` (MIT license, TypeScript project compiled to JS + `.d.ts`, `mocha` as a peer + dev dependency `>=9.0.0`), `package.json` starting at `0.1.0`
- [ ] 1.2 Add GitHub Actions CI workflow: build + test on every PR, across a couple of recent Node LTS versions × a couple of recent Mocha majors

## 2. Case tagging via an explicit context handle (test-first)

- [ ] 2.1 Write a failing unit test (against a real Mocha `Runner`/`Suite`/`Test` instance built via Mocha's own programmatic API, not a fake): `testpulse.Case(this, 'LOGIN-42')` called from within a running test sets a `testpulse_case_key` property recorded against `this.test`
- [ ] 2.2 Implement `testpulse.Case(context, caseKey, opts?)` until 2.1 passes
- [ ] 2.3 Write failing unit tests for `opts.platform`/`opts.version`/`opts.tags`: each present sets its corresponding property, options not passed set none; implement until green
- [ ] 2.4 Write a failing real end-to-end test: a fixture test file calling `testpulse.Case(this, 'LOGIN-42')`, run through a real nested `mocha` invocation with `TestPulseReporter` registered via a fixture `.mocharc.js`, assert the real generated report actually contains `<properties><property name="testpulse_case_key" value="LOGIN-42"/>` under the corresponding `<testcase>`
- [ ] 2.5 Write a failing real end-to-end test: a fixture test that never calls `testpulse.Case`, run the same way, assert its `<testcase>` carries no `testpulse_case_key` property

## 3. Attachments: readback against the context handle and invocation-unique storage (test-first)

- [ ] 3.1 Write a failing unit test: `Case(this, 'LOGIN-42')` followed by `Attach(this, 'LOGIN-42', bytes, 'failure.png', 'image/png')` in the same test succeeds and writes a sidecar (data file + metadata) into the `.testpulse/attachments` scratch directory; implement `Attach`'s lookup against whatever `Case` recorded on `context.test` until green
- [ ] 3.2 Write a failing unit test: `Attach(this, 'OTHER-1', ...)` for a case key the current test's own `Case` call didn't declare throws, and writes nothing; implement the rejection until green
- [ ] 3.3 Write a failing unit test: content-type validation (`image/png`/`image/jpeg`/`image/webp` only) runs and rejects before the case-key check would otherwise accept a call; implement the ordering until green
- [ ] 3.4 Write a failing unit test: two `Attach` calls under the same case key within one test both produce distinct sidecar files, neither overwriting the other; implement invocation-unique filenames (hash of the case key plus a freshly-generated identifier) until green
- [ ] 3.5 Write a failing unit test: `readAttachments` reads only `.testpulse/attachments` (not a basename-matched recursive walk of a broader root) and discards a sidecar whose `contentType` fails the allowlist on read, even if it passed on write (defense in depth) — port this directly from `testpulse-jasmine`'s `attachmentStore.ts`/its test file rather than rediscovering it
- [ ] 3.6 Write a failing unit test: after a successful (`201`/`207`) submission, `.testpulse/attachments` is pruned; after a failed submission, it is left in place for a retry — port this directly from `testpulse-jasmine`'s reporter tests
- [ ] 3.7 Write a failing real end-to-end test: a fixture test file with a test that calls `Attach` under a case key belonging to a *different* test, run via a real nested `mocha` invocation, assert the call throws

## 4. The reporter: JUnit XML generation and auto-submission (test-first)

- [ ] 4.1 Write a failing unit test: given synthetic `Runner` events (`EVENT_TEST_PASS`/`EVENT_TEST_FAIL`/`EVENT_TEST_PENDING`) each carrying a `Test`-like object with recorded properties, the reporter's XML builder produces `<testsuites><testsuite><testcase classname name time><properties><property name value/></properties></testcase>` matching the shape `apps/api/internal/junitxml/parser.go` expects; implement the builder until green
- [ ] 4.2 Write a failing unit test: a test result with no `testpulse_case_key` property produces a `<testcase>` with no `<properties>` block
- [ ] 4.3 Write a failing unit test: a failed test produces a `<failure>` child element with the failure message; a pending test produces a `<skipped/>` child
- [ ] 4.4 Write a failing unit test: mock a `201` response, assert the reporter writes `.testpulse/result.json` with `{"failed": false}` and logs the matched-count summary
- [ ] 4.5 Write a failing unit test: mock a `207` response, default config, assert `{"failed": false}` is written and unmatched case keys plus the fail-on-unmatched pointer are logged
- [ ] 4.6 Write a failing unit test: mock a `207` response with fail-on-unmatched enabled, assert `{"failed": true}` is written
- [ ] 4.7 Write a failing unit test: mock a network error and separately a `5xx` response, assert `{"failed": true}` is written regardless of fail-on-unmatched
- [ ] 4.8 Write a failing unit test: with dry-run enabled (mock a `GET /cases` response), assert a match preview is logged, no request is made to the import endpoint, and `{"failed": false}` is written unless the preview fetch itself fails
- [ ] 4.9 Write a failing unit test: when required config (`url`/`token`/`project`) is missing, the reporter writes `{"failed": true, "reason": "..."}` naming the missing configuration, and makes no submission request — port this directly from `testpulse-jasmine`'s post-implementation fix rather than rediscovering the same bug
- [ ] 4.10 Implement `TestPulseReporter`'s `EVENT_RUN_END` handler (config resolution, XML build, dry-run or submit, attachment grouping, result-marker write) until 4.1–4.9 pass
- [ ] 4.11 Write a failing real end-to-end test: a genuinely failing fixture test tagged with `testpulse.Case`, run via a real nested `mocha` invocation against a stub HTTP server, assert Mocha itself reports the test failure AND the reporter's `EVENT_RUN_END` handler still ran and still submitted the (failed) result
- [ ] 4.12 Write a failing real end-to-end test: a real nested `mocha` invocation with no `--exit` flag (the default), asserting the reporter's async submission genuinely completes (a real HTTP request reaches a stub server) before the process exits — formalizes this session's own repro as a permanent regression test, not just a design-time finding

## 5. The check CLI (test-first)

- [ ] 5.1 Write a failing unit test: `.testpulse/result.json` containing `{"failed": true}` makes `check` exit non-zero
- [ ] 5.2 Write a failing unit test: `.testpulse/result.json` containing `{"failed": false}` makes `check` exit `0`
- [ ] 5.3 Write a failing unit test: a missing `.testpulse/result.json` makes `check` exit non-zero with a message naming a likely misconfiguration cause, not a raw file-not-found error
- [ ] 5.4 Write a failing unit test: a marker with `{"failed": true, "reason": "..."}` makes `check` print the specific reason rather than the generic failure message
- [ ] 5.5 Implement `testpulse-mocha check` until 5.1–5.4 pass
- [ ] 5.6 Write a failing real end-to-end test: `mocha; mocha_status=$?; testpulse-mocha check; check_status=$?; [ "$mocha_status" -eq 0 ] && [ "$check_status" -eq 0 ]` run as real chained shell commands against a fixture project with a genuinely unmatched, fail-on-unmatched-enabled case, against a stub HTTP server, assert the combined chain exits non-zero

## 6. Verify the --parallel limitation is real and documented, not assumed

- [ ] 6.1 Write a real end-to-end test under `mocha --parallel` (two fixture spec files, each calling `testpulse.Case` with a distinct case key) that asserts the documented limitation holds as understood: formalize this session's own repro (a property set on `this.test` in a worker does not survive to the reporter in the main process) as a permanent regression test, so a future Mocha upgrade that silently changes this behavior is caught rather than assumed still true

## 7. Release automation

- [ ] 7.1 Configure GitHub Actions release workflow: `semantic-release` (Angular commit convention) publishing to npm via Trusted Publishing (OIDC), gated `on: push (main) / workflow_dispatch` only, `if: github.repository == 'Barayo/testpulse-mocha'` — note in the workflow that the very first publish needs a one-time manual `npm publish` bootstrap before OIDC trusted publishing can take over (a real limitation discovered during testpulse-jasmine's release, not fixable from CI alone)
- [ ] 7.2 Write README (install, the `Case`/`Attach` API and its explicit-context-handle requirement — including the non-arrow-function-body constraint, the `.mocharc.js` `reporter`/`reporter-option` registration snippet, the `mocha; testpulse-mocha check` non-`&&` CI invocation and why, config-precedence table, exit-code table, dry-run, an explicit recommendation to use `TESTPULSE_TOKEN` over the `token` reporter option in CI, a note that `.testpulse/` should be gitignored, the documented `--parallel` limitation and its exact cause, and the `--exit`-flag risk to in-flight submissions) and CONTRIBUTING (unit + real end-to-end test setup)

## 8. TestPulse monorepo docs update

- [ ] 8.1 Add a "Mocha: `testpulse-mocha`" section to `docs/importing-results.md` (install, `Case`/`Attach` usage and its context-handle requirement, the `.mocharc.js` registration snippet, the `mocha; testpulse-mocha check` invocation, build-outcome table, the documented `--parallel` limitation), following the same pattern already used there for the pytest/Maven/Jest/Gradle/Go/.NET/gtest/Jasmine plugin sections; update `docs/README.md`'s index line

<!-- No Sample-Project-showcase task: this is client-tooling published as its own repo, with no new API endpoint, UI, or seed-data surface inside TestPulse itself -- same as every prior plugin change. -->
