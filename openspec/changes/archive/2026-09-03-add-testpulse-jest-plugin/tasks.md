## 1. Repo scaffolding

- [x] 1.1 Create the public repo `Barayo/testpulse-jest` (MIT license, TypeScript, `package.json` with `jest-junit` (v11+) as a `peerDependency`, `tsconfig.json`, build step compiling to `dist/` + `.d.ts`)
- [x] 1.2 Add dev/test dependencies: Jest itself (for testing the plugin's own code), an HTTP mocking library (`msw` or `nock`) for reporter tests, and `execa` (or `child_process`) for spawning nested `jest` processes in end-to-end tests — used Node's built-in `child_process` (no extra dependency, avoids execa's ESM-only packaging friction under ts-jest/CommonJS)
- [x] 1.3 Add GitHub Actions workflow: build+test matrix (a couple of recent Node LTS versions × a couple of recent Jest majors) on every PR

## 2. Case-key tagging without title pollution (test-first)

- [x] 2.1 Write a failing unit test: `testpulse('LOGIN-42')('logs in successfully', fn)` produces a test whose `AssertionResult.title` is exactly `'logs in successfully'` (no marker text appended); implement `testpulse()` as a thin wrapper delegating to the real `test`/`it` with the name unchanged, until green
- [x] 2.2 Write a failing unit test: `testpulse('')` and `testpulse(undefined)` each throw synchronously at call time; implement the fail-fast validation until green
- [x] 2.3 Write a failing unit test: when the wrapped test body runs, a JSON sidecar is written into the scratch dir (default `.testpulse/`) at a filename equal to the SHA-256 hash of `expect.getState().currentTestName`, with the fullName plus `caseKey`/`platform`/`version`/`tags` (only the supplied ones) as JSON content; implement the sidecar-write wrapping (hash-then-write) around the test body until green
- [x] 2.4 Write a failing unit test: a test titled with `../../evil` (or similar path-traversal characters, e.g. via `test.each` generating titles from external data) still writes its sidecar inside the scratch directory, at a hashed filename, with no file created outside it; confirm 2.3's hashing already satisfies this (should already be green — this test exists to prove it, not introduce new production code)
- [x] 2.5 Write a failing unit test: the scratch directory path is overridable via a `scratchDir` option threaded through `testpulse()`'s module-level config; implement the override until green
<!-- 2.6 relocated to 5.4 during implementation: the reporter's onRunStart hook, not testpulse()/testpulseAttach(), is the correct place to clear the scratch directory exactly once per run -- testpulse()/testpulseAttach() run in worker processes, which can't coordinate a single "first call" across each other, so a per-worker guard would race. -->

## 3. Attachments (test-first)

- [x] 3.1 Write a failing unit test: `testpulseAttach(buffer, { filename, contentType: 'image/png' })` called from within a test with a prior `testpulse()` sidecar for the current test name writes the bytes plus a JSON sidecar (test name, filename, content type), at a SHA-256-hashed filename (same hashing as the case-key sidecar), into a separate scratch-dir subfolder; implement `testpulseAttach()` until green
- [x] 3.2 Write a failing unit test: `testpulseAttach(...)` called when no `testpulse()` sidecar exists for the current test name logs a warning and writes no attachment; implement the guard until green
- [x] 3.3 Write a failing unit test: `testpulseAttach(buffer, { contentType: 'application/pdf' })` throws synchronously and writes nothing; implement the content-type allow-list (`image/png`, `image/jpeg`, `image/webp`) until green

## 4. jest-junit property injection hook (test-first)

- [x] 4.1 Write a failing unit test: given a scratch dir containing a case-key sidecar for fullName `"logs in successfully"` (at its hashed filename), calling `junitTestCaseProperties({ title: 'logs in successfully', ancestorTitles: [] })` returns `{ testpulse_case_key: 'LOGIN-42' }`; implement the fullName reconstruction (`ancestorTitles.join(' ') + ' ' + title`, trimmed), re-hashing it the same way `testpulse()` did, and the sidecar lookup by that hash until green
- [x] 4.2 Write a failing unit test: a sidecar with `platform`/`tags` but no `version` produces `testpulse_platform`/`testpulse_tags` and omits `testpulse_version`; implement the omit-when-absent behavior until green
- [x] 4.3 Write a failing unit test: a testcase with no matching sidecar returns `{}`; confirm/implement until green
- [x] 4.4 Write a real end-to-end test: a fixture Jest project with one `testpulse()`-wrapped test, `jest-junit` configured with `testCasePropertiesDirectory`/`testCasePropertiesFile` split from `require.resolve('testpulse-jest/junitTestCaseProperties')` (discovered during implementation: `jest-junit` joins these two options with `path.join()`, which mangles a single absolute path passed as `testCasePropertiesFile` alone — see design.md), spawn a real nested `jest` run and assert the produced `junit.xml` contains `<property name="testpulse_case_key" value="..."/>` under the correct `<testcase>`

## 5. The reporter: reading, joining, and dry run (test-first)

- [x] 5.1 Write a failing unit test: the reporter's `onRunComplete`, given a `junitFile` path that doesn't exist, fails with a message naming `reporters` ordering and missing `jest-junit` configuration as likely causes (not a raw file-system error); implement the existence check until green
- [x] 5.2 Write a failing unit test: given fixture scratch-dir attachment and case-key sidecars, the reporter builds an `attachments` array joining each attachment to its test's case key by fullName; implement the join until green
- [x] 5.3 Write a failing unit test: with `dryRun` enabled (mock a `GET /cases` response), the reporter logs a match preview against the scratch dir's registered case keys, makes no request to the import endpoint, and leaves `process.exitCode` untouched; implement the dry-run branch until green
- [x] 5.4 Write a failing unit test: the reporter's `onRunStart` hook clears (removes and recreates) the scratch directory; implement `onRunStart` until green — this is the exactly-once, main-process clearing point (see design.md), not a per-worker check inside `testpulse()`/`testpulseAttach()`

## 6. Submission and exit-code behavior (test-first)

- [x] 6.1 Write a failing unit test: mock a `201` response from the import endpoint, assert `process.exitCode` stays untouched and a summary is logged
- [x] 6.2 Write a failing unit test: mock a `207` response, default config, assert `process.exitCode` stays untouched and the log lists unmatched case keys plus the `failOnUnmatched` pointer
- [x] 6.3 Write a failing unit test: mock a `207` response with `failOnUnmatched` enabled, assert `process.exitCode` is set to `1`
- [x] 6.4 Write a failing unit test: mock a network error and separately a `401`/`400`/`5xx` response, assert `process.exitCode` is always set to `1` regardless of `failOnUnmatched`
- [x] 6.5 Implement the submission branch (POST to `/api/v1/projects/{projectKey}/imports`, reading the `junitFile` contents as the `report`, branching on response per the table in design.md) until 6.1–6.4 pass
- [x] 6.6 Write a failing unit test: after a successful run, the scratch directory is removed unless `keepScratchDir` is set; implement the cleanup step until green
- [x] 6.7 Write a real end-to-end test: a fixture Jest project with `jest-junit` and the `testpulse-jest` reporter both configured (in the correct order) and a mocked import endpoint, spawn a real nested `jest` run, assert the submitted request body and the resulting `process.exitCode`

## 7. Configuration resolution (test-first)

- [x] 7.1 Write failing unit tests for `url`/`token`/`project`/`failOnUnmatched`/`dryRun`: env-var-alone, reporter-option-alone, env-var-overrides-reporter-option
- [x] 7.2 Implement the shared config-resolution function (checking `process.env.TESTPULSE_*` before the reporter's own options object) until 7.1 passes

## 8. Release automation

- [x] 8.1 Configure npm trusted publishing (OIDC) for `Barayo/testpulse-jest` — register the GitHub Actions publisher on the npm package (one-time setup, real account work, budget time rather than assuming it configures itself) — and wire `semantic-release` on merge to `main` to version/tag/publish from commit messages, with no `NPM_TOKEN` repo secret. `release.yml` (`id-token: write` permission, `semantic-release` + `@semantic-release/git`/`exec`, `workflow_dispatch` manual-recovery fallback) and `.releaserc.json` are done. **Blocked on the user**: npm's trusted-publisher config for a package can only be created once the package exists on the registry at all, so a first `npm publish` from a real, locally-authenticated npm account is required before the Trusted Publisher entry can be added on npmjs.com — same bootstrap shape as Maven Central's namespace verification earlier this session, flagged to the user rather than assumed away.
- [x] 8.2 Write README (install, the `testpulse()`/`testpulseAttach()` API, the required `jest.config.js` wiring — the `testCasePropertiesDirectory`/`testCasePropertiesFile` split from design.md, plus this package's own `reporters` entry, in one copy-pasteable block — the config-precedence table, and the exit-code table) and CONTRIBUTING (the layered unit + end-to-end testing approach)

## 9. TestPulse monorepo docs update

- [x] 9.1 Replace the Jest half of the "Gradle, Jest" stub in `docs/importing-results.md` with a "Jest: `testpulse-jest`" section (install, `jest.config.js` wiring, `testpulse()`/`testpulseAttach()` usage, build-outcome table), following the same pattern already used there for the pytest and Maven plugin sections; update `docs/README.md`'s index line if it changes scope

<!-- No Sample-Project-showcase task: this is client-tooling published as its own npm package, with no new API endpoint, UI, or seed-data surface inside TestPulse itself — same as the pytest and Maven plugin changes. -->
