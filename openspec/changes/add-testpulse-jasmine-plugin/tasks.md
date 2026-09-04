## 1. Repo scaffolding and the critical setSpecProperty repro

- [x] 1.1 Create the public repo `Barayo/testpulse-jasmine` (MIT license, TypeScript project compiled to JS + `.d.ts`, `jasmine`/`jasmine-core` as peer + dev dependencies)
- [x] 1.2 **Before any other implementation work**: build a minimal isolated repro proving `setSpecProperty`'s value genuinely survives into `specDone`'s `result.properties`. Confirmed with a real `jasmine` run: `setSpecProperty('probe_key', 'probe_value')` produced exactly `result.properties = {"probe_key":"probe_value"}` in a custom reporter's `specDone` — matches the JSDoc exactly. Also discovered the real config detail that a `helpers` array's glob paths resolve relative to `spec_dir`, not the project root (an initial repro attempt silently resolved to an empty file list because of this)
- [x] 1.3 **Superseded and improved**: the original plan (a `helpers` file calling `jasmine.getEnv().addReporter()`) was disproven by a real repro under `jasmine --parallel=2`, which threw a fatal "Reporters cannot be added via Env in parallel mode" error — not a data-survival risk, a hard incompatibility with the registration mechanism itself. The corrected mechanism (a declarative `reporters` array in a JS config file, with the reporter declaring `reporterCapabilities: { parallel: true }`) was found and verified with a second real repro: `setSpecProperty`'s value genuinely survives into the reporter's `specDone` calls under real `--parallel=2` execution using this mechanism, in addition to plain sequential mode — meaning `--parallel` mode ends up fully supported, not a documented limitation as originally planned. design.md's Decisions and Risks sections were rewritten to reflect the corrected mechanism throughout.
- [ ] 1.4 Add GitHub Actions workflow: build + test on every PR, across a couple of recent Node LTS versions × a couple of recent Jasmine majors

## 2. Case tagging via setSpecProperty (test-first)

- [ ] 2.1 Write a failing unit test (against a real `jasmine.getEnv()` instance, not a fake): `testpulse.Case('LOGIN-42')` called from within a running spec results in `getSpecProperty('testpulse_case_key')` returning `'LOGIN-42'`
- [ ] 2.2 Implement `testpulse.Case(caseKey, opts?)` calling `jasmine.getEnv().setSpecProperty('testpulse_case_key', caseKey)` until 2.1 passes
- [ ] 2.3 Write failing unit tests for `opts.platform`/`opts.version`/`opts.tags`: each present sets its corresponding property, options not passed set none; implement until green
- [ ] 2.4 Write a failing unit test: `testpulse.Case` called with no active spec (e.g. at module load time, outside any `it()`) lets Jasmine's own `setSpecProperty` error surface rather than throwing something else or swallowing it
- [ ] 2.5 Write a failing real end-to-end test: a fixture spec file calling `testpulse.Case('LOGIN-42')`, run through a real `jasmine` invocation with the plugin's reporter registered via a fixture JS config file's `reporters` array, assert the real generated report actually contains `<properties><property name="testpulse_case_key" value="LOGIN-42"/>` — formalizes 1.2/1.3's proven repros as a permanent regression test, not just that `Case` calls `setSpecProperty` correctly in isolation
- [ ] 2.6 Write a failing real end-to-end test: a fixture spec that never calls `testpulse.Case`, run the same way, assert its `<testcase>` carries no `testpulse_case_key` property

## 3. Attachments: getSpecProperty readback and invocation-unique storage (test-first)

- [ ] 3.1 Write a failing unit test: `Case('LOGIN-42')` followed by `Attach('LOGIN-42', bytes, 'failure.png', 'image/png')` in the same spec succeeds and writes a sidecar (data file + metadata) into the `.testpulse/` scratch directory; implement `Attach`'s lookup against `getSpecProperty('testpulse_case_key')` until green
- [ ] 3.2 Write a failing unit test: `Attach('OTHER-1', ...)` for a case key the current spec's own `Case` call didn't declare throws, and writes nothing; implement the rejection until green
- [ ] 3.3 Write a failing unit test: content-type validation (`image/png`/`image/jpeg`/`image/webp` only) runs and rejects before the case-key check would otherwise accept a call; implement the ordering until green
- [ ] 3.4 Write a failing unit test: `Attach` called with no active spec lets Jasmine's own `getSpecProperty` error surface, not a different or swallowed error
- [ ] 3.5 Write a failing unit test: two `Attach` calls under the same case key within one spec both produce distinct sidecar files, neither overwriting the other; implement invocation-unique filenames (hash of the case key plus a freshly-generated identifier) until green
- [ ] 3.6 Write a failing real end-to-end test: a fixture spec file with a spec that calls `Attach` under a case key belonging to a *different* spec, run via a real `jasmine` invocation, assert the call throws — proving the check works against real Jasmine execution and `getSpecProperty`, not just an isolated in-process assertion
- [ ] 3.7 Write a failing real end-to-end test: a fixture spec that calls `Case`/`Attach` multiple times under the same case key within itself, run via a real `jasmine` invocation, assert all attachments are present in the scratch directory afterward

## 4. The reporter: JUnit XML generation and auto-submission (test-first)

- [ ] 4.1 Write a failing unit test: given a synthetic array of spec results (each with a `properties` field), the reporter's XML builder produces `<testsuites><testsuite><testcase classname name time><properties><property name value/></properties></testcase>` matching the shape `apps/api/internal/junitxml/parser.go` expects; implement the builder until green
- [ ] 4.2 Write a failing unit test: a spec result with no `testpulse_case_key` property produces a `<testcase>` with no `<properties>` block
- [ ] 4.3 Write a failing unit test: a spec result with `status: 'failed'` produces a `<failure>` child element with the failure message; a `status: 'pending'`/`'excluded'` result produces a `<skipped/>` child
- [ ] 4.4 Write a failing unit test: mock a `201` response, assert the reporter writes `.testpulse/result.json` with `{"failed": false}` and logs the matched-count summary
- [ ] 4.5 Write a failing unit test: mock a `207` response, default config, assert `{"failed": false}` is written and unmatched case keys plus the fail-on-unmatched pointer are logged
- [ ] 4.6 Write a failing unit test: mock a `207` response with fail-on-unmatched enabled, assert `{"failed": true}` is written
- [ ] 4.7 Write a failing unit test: mock a network error and separately a `5xx` response, assert `{"failed": true}` is written regardless of fail-on-unmatched
- [ ] 4.8 Write a failing unit test: with dry-run enabled (mock a `GET /cases` response), assert a match preview is logged, no request is made to the import endpoint, and `{"failed": false}` is written unless the preview fetch itself fails
- [ ] 4.9 Implement the reporter's `jasmineDone` handler (config resolution, XML build, dry-run or submit, attachment grouping from the scratch directory, result-marker write) until 4.1–4.8 pass
- [ ] 4.10 Write a failing real end-to-end test: a genuinely failing fixture spec tagged with `testpulse.Case`, run via a real `jasmine` invocation against a stub HTTP server, assert Jasmine itself reports the spec failure AND the reporter's `jasmineDone` handler still ran and still submitted the (failed) result — the real proof that this hook is reliable regardless of pass/fail, the same discipline the .NET plugin's equivalent proof required

## 5. The check CLI (test-first)

- [ ] 5.1 Write a failing unit test: `.testpulse/result.json` containing `{"failed": true}` makes `check` exit non-zero
- [ ] 5.2 Write a failing unit test: `.testpulse/result.json` containing `{"failed": false}` makes `check` exit `0`
- [ ] 5.3 Write a failing unit test: a missing `.testpulse/result.json` makes `check` exit non-zero with a message naming a likely misconfiguration cause, not a raw file-not-found error
- [ ] 5.4 Implement `testpulse-jasmine check` until 5.1–5.3 pass
- [ ] 5.5 Write a failing real end-to-end test: `jasmine && testpulse-jasmine check` run as real chained shell commands against a fixture project with a genuinely unmatched, fail-on-unmatched-enabled case, against a stub HTTP server, assert the combined chain exits non-zero — proving the full real pipeline (spec → reporter → marker → check) integrates, not just each piece in isolation

## 6. Release automation

- [ ] 6.1 Configure GitHub Actions release workflow: `semantic-release` (Angular commit convention) publishing to npm via Trusted Publishing (OIDC), gated `on: push (main) / workflow_dispatch` only, `if: github.repository == 'Barayo/testpulse-jasmine'`
- [ ] 6.2 Write README (install, the `Case`/`Attach` API, the required `reporters` array entry with a copy-pasteable `spec/support/jasmine.js` snippet — note it must be a `.js` config, not `.json` — the `jasmine && testpulse-jasmine check` CI invocation, config-precedence table, exit-code table, dry-run, an explicit recommendation to use `TESTPULSE_TOKEN` over the `token` reporter option in CI, a note that `.testpulse/` should be gitignored since it can hold screenshot bytes, and a documented note that `--parallel` mode is supported per task 1.3's real findings) and CONTRIBUTING (unit + real end-to-end test setup)

## 7. TestPulse monorepo docs update

- [ ] 7.1 Add a "Jasmine: `testpulse-jasmine`" section to `docs/importing-results.md` (install, `Case`/`Attach` usage, the required `reporters` array entry in a JS config file, the `jasmine && testpulse-jasmine check` CI invocation, build-outcome table), following the same pattern already used there for the pytest/Maven/Jest/Gradle/Go/.NET/gtest plugin sections; update `docs/README.md`'s index line

<!-- No Sample-Project-showcase task: this is client-tooling published as its own repo, with no new API endpoint, UI, or seed-data surface inside TestPulse itself -- same as every prior plugin change. -->
