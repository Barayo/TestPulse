## Context

`add-execution-import` (#38) shipped `POST
/api/v1/projects/{projectKey}/imports`, matching `<testcase>` entries in a
JUnit XML report to existing cases by a `testpulse_case_key` `<property>`.
Issue #58 tracked installable plugins for all four major JUnit-XML-producing
ecosystems; it was split into #154 (pytest, shipped as `pytest-testpulse`
v1.0.1), #155 (npm/Jest, this change), #156 (Maven, shipped as
`testpulse-annotations` + `testpulse-maven-plugin` v1.0.0), #157 (Gradle).

Jest has no `record_property()`-equivalent at all — no built-in mechanism
for a running test to attach custom metadata to its own result. The real
constraint: Jest runs test files in worker processes, and a custom
reporter's `onTestResult`/`onRunComplete` hooks run in the **main**
process, receiving only the serialized `AssertionResult` (`ancestorTitles`,
`title`, `fullName`, `status`, `duration`, `failureMessages`,
`failureDetails`, `numPassingAsserts`, `invocations`) that crossed that
process boundary via IPC. Nothing a test sets in memory during its own
execution is visible to a reporter — only real values already on that
fixed object, or real side-effects on disk (which do cross the process
boundary, since disk I/O isn't in-memory JS state).

`jest-junit` (v11+) does expose a genuine property-injection hook —
`testCasePropertiesFile`, a module exporting `(tc) => ({ ...properties })`
that `jest-junit` calls per testcase while building its `<properties>`
block — confirmed via its source (`buildJsonResults.js`) to receive that
same `AssertionResult` object, unmodified. This plugin composes with that
hook (and with `jest-junit`'s own JUnit XML writer generally) rather than
writing its own JUnit XML, the same "reuse the runner's own writer" pattern
`pytest-testpulse` used for pytest's built-in `--junitxml` and
`testpulse-maven-plugin` used for Surefire's report (there, via a
post-processing rewrite, since Surefire has no hook at all).

## Goals / Non-Goals

**Goals:**
- A Jest user can tag a test with a case key (and optional
  platform/version/tags) and have it land in `jest-junit`'s XML output as a
  `testpulse_case_key` property, without polluting the test's own visible
  title in console output, CI logs, or the report itself.
- A test can attach a screenshot/file to its own result, working around
  the worker/main-process boundary that makes an in-memory mechanism
  (like pytest's fixture-based `testpulse_attach`) impossible here.
- The plugin also submits the annotated report to the import endpoint,
  matching the other two plugins' already-validated 201/207/error
  exit-code policy.

**Non-Goals (v1):**
- Vitest, Jasmine, Mocha — tracked separately (#167, #165, #166 — filed
  once the Jest-specific mechanism made clear how much would or wouldn't
  transfer to each).
- Per-invocation case keys for `test.each`/parameterized tests — every
  invocation sharing one `testpulse()` call shares one case key, the same
  simplification the other two plugins make for their own parameterized
  cases.

## Decisions

### Repo & packaging
New public repo `Barayo/testpulse-jest`, MIT license (same reasoning as
the other two plugins: permissive client tooling vs. TestPulse core's
AGPL-3.0). TypeScript source, compiled to JS + `.d.ts` for publishing.
`jest-junit` (v11+, for `testCasePropertiesFile` support) is a peer
dependency, not bundled — the user's own `jest-junit` version stays under
their control.

### The scratch-directory side-channel
Three pieces share one file-based mechanism (default `.testpulse/` under
the Jest root, gitignored, overridable via a `scratchDir` reporter option)
that exists specifically to cross the worker/main-process boundary via real
disk I/O instead of in-memory state:

- **`testpulse(caseKey, opts?)`** wraps `test`/`it`. `caseKey` is validated
  (non-empty string) at test-definition time — fails fast at file-load time
  rather than silently producing an untagged test. It returns a function
  with the same signature as `test`/`it`; when the wrapped test actually
  runs, it writes a JSON sidecar into the scratch dir keyed by
  `expect.getState().currentTestName` (Jest's own fullName —
  `ancestorTitles` joined with `title`, the same value `jest-junit` itself
  would reconstruct), containing `caseKey`/`platform`/`version`/`tags`,
  before invoking the real test body. The test's own title is never
  modified — no marker text, visible or otherwise, is appended to it.
  **`currentTestName` is fully user-controlled** (Jest places no
  restriction on characters in a `describe`/`test` title, and titles built
  from `test.each`/external fixture data are common) — it is never used
  directly as a path component. The sidecar's **filename** is a SHA-256
  hash of the fullName; the fullName itself is stored only as JSON
  *content* inside the file. This rules out path traversal or a
  same-directory-escape via a crafted test title, and keeps `junitTestCaseProperties`'s
  lookup (which reconstructs the same fullName from `tc.ancestorTitles`/
  `tc.title` and re-hashes it) a pure content match rather than a
  filesystem operation on untrusted input.
- **`testpulseAttach(bufferOrPath, opts)`** — callable from inside any
  test body wrapped by `testpulse()`. Writes the attachment's bytes plus a
  JSON sidecar (same `currentTestName` key, filename, content type) into a
  separate scratch-dir subfolder. Calling it inside a test with no
  `testpulse()` wrapper (no case-key sidecar for that `currentTestName`)
  logs a warning and drops the attachment — same "no case key, no
  attachment" rule `pytest-testpulse`'s `testpulse_attach` fixture follows.
  Only `image/png`, `image/jpeg`, `image/webp` are accepted — same
  allow-list `pytest-testpulse` enforces (added there after a real QA bug;
  applied here from the start rather than rediscovered).
- **`testpulse-jest/junitTestCaseProperties`** — the module a user's
  `jest-junit` config points its `testCasePropertiesFile`/
  `testCasePropertiesDirectory` options at. `jest-junit` joins those two
  options with `path.join()`, which does **not** special-case an absolute
  second argument the way `path.resolve()` does — so this must be
  `require.resolve()`'d once and split into `path.dirname()`/
  `path.basename()`, not passed as a single combined path (confirmed by
  reproducing the failure during implementation: a single absolute
  `testCasePropertiesFile` silently resolves to a nonexistent joined path,
  and `jest-junit` treats a missing properties file as "not configured" —
  no error, just no properties written). Reads the scratch dir's case-key
  sidecars synchronously — already flushed to disk by the time
  `jest-junit`'s own `onRunComplete` calls this function, since Jest
  reporters run strictly after all test workers finish — and returns
  `testpulse_case_key`/`testpulse_platform`/`testpulse_version`/
  `testpulse_tags` (omitting any that weren't supplied) for the matching
  `AssertionResult`, matched by reconstructing the same fullName from
  `tc.ancestorTitles`/`tc.title`. A testcase with no sidecar (untagged
  test) returns `{}` — `jest-junit` writes no extra properties for it,
  same "match-only, nothing forced" posture as the import API itself.

### The reporter: composes with jest-junit, doesn't replace it
`testpulse-jest`'s own reporter is registered in Jest's `reporters` array
**after** `jest-junit` — confirmed via Jest's `ReporterDispatcher` source
that `onRunComplete` is awaited per-reporter in array order, not run in
parallel, so this ordering is a real guarantee. At `onRunComplete`, the
reporter:

1. Resolves config (see below).
2. Reads the `jest-junit` output file (path from a `junitFile` reporter
   option, defaulting to `jest-junit`'s own default `./junit.xml`). If the
   file doesn't exist, fails with a message naming the likely cause (wrong
   `reporters` order, or `jest-junit` not configured at all) rather than a
   raw file-not-found error.
3. Reads the scratch dir's attachment sidecars and joins each one to its
   test's case key (from the same scratch dir's case-key sidecars) to
   build the import request's `attachments` array — attachments never
   touch `jest-junit` or the XML at all, since the import API already
   carries them as a sibling array on the request body, not embedded in
   the report.
4. If `dryRun`: fetches `GET /api/v1/projects/{project}/cases` (read-only)
   and logs a match preview against the scratch dir's own case keys —
   never touches the (mutating) import endpoint, never affects exit code.
5. Otherwise, `POST`s `{ format: "junit-xml", report: <file contents>,
   attachments }` and applies the same policy validated for the other two
   plugins:

   | Response | Behavior |
   |---|---|
   | `201` all matched | logs a summary; exit code untouched |
   | `207` some unmatched | logs a warning (names unmatched keys, points at `failOnUnmatched`); exit code untouched unless `failOnUnmatched` is set, which sets `process.exitCode = 1` |
   | network/auth/4xx/5xx error | always sets `process.exitCode = 1`, unconditionally |

6. Removes the scratch directory (unless `keepScratchDir` is set, for
   debugging) so it never accumulates across runs or leaks into a
   subsequent `jest --watch` cycle.

The reporter also clears (or validates-and-recreates) the scratch
directory in its `onRunStart` hook, rather than relying solely on its own
end-of-run cleanup. A crashed or interrupted prior run — most relevant on
self-hosted CI runners that reuse a workspace across jobs, unlike
ephemeral GitHub-hosted runners — could otherwise leave stale sidecars
that a subsequent, unrelated run picks up. `onRunStart` runs exactly once,
in the main process, before any worker starts executing tests — unlike
`testpulse()`/`testpulseAttach()`, which run inside per-test-file worker
processes. Jest runs multiple test files across separate worker processes
in parallel by default, and a worker's in-memory state isn't visible to
other workers, so a "first call in this process clears the directory"
guard inside `testpulse()` itself would race: two workers starting near-
simultaneously could each decide they're first and clear the directory
mid-run, destroying a sibling worker's already-written sidecars.
`onRunStart` sidesteps this entirely by running before any worker-side
code executes at all, and needs no new `jest.config.js` entry, since the
reporter is already required configuration.

Jest's own exit-code logic respects a reporter-mutated `process.exitCode`
set during `onRunComplete` — the standard, documented way a custom reporter
fails a Jest run (used by e.g. `jest-fail-on-console`).

### Config: env var over reporter options
Since Jest reporters are configured via `jest.config.js`, not a CLI this
package owns, there's no CLI-flag tier — but the env-var-wins-for-secrets
principle from the other two plugins still applies:

| Setting | Env var | Reporter option |
|---|---|---|
| API base URL | `TESTPULSE_URL` | `url` |
| API token | `TESTPULSE_TOKEN` | `token` |
| Project key | `TESTPULSE_PROJECT` | `project` |
| Fail on unmatched | `TESTPULSE_FAIL_ON_UNMATCHED` | `failOnUnmatched` |
| Dry run | `TESTPULSE_DRY_RUN` | `dryRun` |

Same env var names already used by the other two plugins and the raw curl
snippet in `docs/importing-results.md`.

Example `jest.config.js`:

```js
const path = require('path');
const propsPath = require.resolve('testpulse-jest/junitTestCaseProperties');

module.exports = {
  reporters: [
    'default',
    ['jest-junit', {
      outputName: 'junit.xml',
      testCasePropertiesDirectory: path.dirname(propsPath),
      testCasePropertiesFile: path.basename(propsPath),
    }],
    ['testpulse-jest', { url: 'http://localhost:8080', project: 'LOGIN' }],
  ],
};
```

### Testing approach (TDD)
No `pytester`-equivalent exists for authoring Jest plugins/reporters, so
testing is layered:

- **`testpulse()` / `testpulseAttach()`**: unit tests calling them directly
  against a temp scratch dir, asserting the sidecar files' shape and the
  fail-fast validation — no real Jest run needed.
- **`junitTestCaseProperties`**: unit tests writing fixture sidecars into a
  temp scratch dir and calling the exported function with synthetic
  `AssertionResult` objects, asserting the returned properties (including
  the untagged-test `{}` case).
- **The reporter**: unit tests constructing a synthetic `AggregatedResult`,
  a fixture `jest-junit` XML file, and fixture scratch-dir contents, with
  HTTP mocked (`msw` or `nock`) for every row of the response-handling
  table plus dry-run.
- **A small number of true end-to-end tests**: spawn a real nested `jest`
  child process against a fixture project (wrapper → scratch dir →
  `jest-junit`'s properties hook → the reporter → the submitted payload),
  playing the same role `maven-invoker-plugin`'s `src/it/` played for the
  Maven plugin — verifying the pieces actually integrate, not re-testing
  every branch already covered above.

### CI / publishing
- GitHub Actions: build+test matrix (a couple of recent Node LTS versions ×
  a couple of recent Jest majors) on every PR.
- Release: `semantic-release` on merge to `main` (same JS release tooling
  as the two Maven-Central repos), publishing to npm via **trusted
  publishing (OIDC, GA since July 2025)** — no long-lived `NPM_TOKEN` repo
  secret, mirroring `pytest-testpulse`'s PyPI trusted-publishing setup
  rather than the Maven repos' long-lived-credential setup.
- README: install, the `testpulse()`/`testpulseAttach()` API, the required
  `jest.config.js` wiring (both `jest-junit`'s `testCasePropertiesFile` and
  this package's own `reporters` entry), the config-precedence table, and
  the exit-code table above. CONTRIBUTING: the layered testing approach
  above.

## Risks / Trade-offs

- **Two-part setup** (`jest-junit`'s `testCasePropertiesFile` config *and*
  this package's own `reporters` entry, in the right order) is more moving
  pieces than `pytest-testpulse`'s single `pip install` or
  `testpulse-maven-plugin`'s single `<plugin>` block → mitigated by the
  README leading with one copy-pasteable `jest.config.js` block covering
  both.
- **Ordering dependency on the `reporters` array** (`testpulse-jest` must
  come after `jest-junit`) is a real footgun if misconfigured → mitigated
  by the reporter checking that the `jest-junit` output file actually
  exists before reading it, and failing with a clear message naming the
  likely cause rather than a confusing file-not-found error.
- **Scratch-directory side-channel is new infrastructure this plugin
  introduces** (the other two plugins have no analog — pytest's
  `record_property()` and Surefire's XML are both single-process-visible)
  → accepted because it's the only way to cross Jest's worker/main-process
  boundary without polluting test titles; kept to one shared mechanism for
  both case-key metadata and attachments rather than two different tricks.
  Flagged during gating security review (Luis) that the sidecar key
  (`currentTestName`) is fully user-controlled text — mitigated by hashing
  it into the filename rather than using it as a path component (see
  Decisions above), so a crafted test title can't traverse or escape the
  scratch directory.
- **`testpulseAttach(bufferOrPath, ...)` accepts a local file path**,
  meaning a test can cause arbitrary local file contents to be
  base64-encoded and uploaded → accepted, same trust boundary
  `pytest-testpulse`'s attachment fixture already accepts: a Jest test
  file is already arbitrary trusted Node.js code with full filesystem/
  network access by construction, so this isn't a new privilege. The
  content-type allow-list plus the import API's own independent
  server-side attachment validation (`run-result-attachments` capability)
  still gate what's actually stored regardless of client claims.
- **Attachments included in v1 here, deferred in `testpulse-maven-plugin`
  v1** — an intentional divergence, not an oversight: Maven's multi-module/
  multi-report structure made "which file belongs to which result" a
  genuinely different (harder) problem, deferred there; Jest's single
  `currentTestName` key made the same problem tractable enough to include
  now, once the scratch-dir mechanism already existed for the case-key
  metadata.

## Open Questions

None outstanding.
