## Context

`add-execution-import` (#38) shipped `POST /api/v1/projects/{projectKey}/imports`,
matching `<testcase>` entries in a JUnit XML report to existing cases by
a `testpulse_case_key` `<property>`. Issue #58 tracks installable
plugins for the major JUnit-XML-producing ecosystems; this is #167
(Vitest), the fifth and last JS testing-framework plugin after Jest
(#155), Jasmine (#165), and Mocha (#166), alongside pytest (#154),
Maven (#156), Gradle (#157), Go (#169), .NET (#170), and gtest (#171).

All load-bearing facts below were established via real research this
session (source reading + empirical repros against a real installed
`vitest@5.0.0`), not assumption or blind precedent-carryover from the
sibling JS plugins:

1. **Vitest has a genuine, native, first-party test-annotation API**:
   `context.annotate(message, type?, attachment?)`, available via the
   test context parameter (`test('...', async (context) => {...})`).
   Confirmed by reading `@vitest/runner`'s actual source
   (`createTestContext` in `chunk-artifact.js`): the call round-trips
   through `runner.onTestAnnotate(test, annotation)` and pushes the
   resolved annotation onto `test.annotations`, which is the SAME array
   `context.task.annotations` exposes for synchronous readback within
   the test, and the same array the modern Reporter API's
   `TestCase.annotations()` exposes to a custom reporter.
2. **The built-in `junit` reporter already writes annotations as
   `<property name="{type}" value="{message}"/>`**, confirmed by
   reading its actual XML-writing source in `vitest`'s bundled
   `index.B89dZ0-N.js`:
   ```js
   await this.logger.log(`<property name="${escapeXML(annotation.type)}" value="${escapeXML(annotation.message)}">`);
   ```
   This means `annotate(caseKey, 'testpulse_case_key')` produces exactly
   the property shape `execution-import`'s importer already expects —
   `type` becomes the property name, `message` becomes the value. (The
   `"notice"`/`"warning"`/`"error"` values documented for `type` are a
   convention some OTHER reporters — e.g. the GitHub Actions reporter —
   attach severity meaning to; the JUnit reporter and the underlying
   annotation data model treat `type` as an arbitrary string.)
3. **A custom reporter can read full annotation data — including
   attachment payloads — directly and synchronously**, confirmed via a
   real repro: a test called `annotate('shot.png', 'testpulse_attachment',
   { body: 'base64...', contentType: 'image/png' })`, and a custom
   reporter's `onTestModuleEnd` hook, calling
   `testCase.annotations()`, received the attachment's `body`/
   `contentType` fully intact. **This means no scratch-directory
   side-channel is needed at all** — not for case-key tagging (unlike
   every prior JS plugin) and not for attachments either (unlike
   Jest/Jasmine/Mocha, which each needed one).
4. **Composing with the built-in `junit` reporter's FILE output is
   unsafe — a real, confirmed race, not a hypothetical one.** A repro
   configured `reporters: ['default', 'junit', './myReporter.js']` with
   `outputFile: { junit: './results/junit.xml' }`; the custom reporter's
   `onTestRunEnd` read the file and found only the XML declaration
   (`<?xml version="1.0" ...?>`) with no actual content — the junit
   reporter's own "JUNIT report written to ..." log line appeared
   AFTER the custom reporter had already tried to read it. Adding an
   artificial 50ms delay before the read produced the complete,
   correct file, confirming this is a genuine async write race with no
   ordering guarantee from Vitest's reporter dispatch, not a one-off
   fluke.
5. **CORRECTED (found during implementation, re-verified independently
   afterward): a custom reporter's `process.exitCode` set in
   `onTestRunEnd` DOES survive to the final process exit code**, for a
   run whose own tests all pass. The original repro that produced the
   opposite conclusion was invalidated by a shell-scripting bug, not a
   real Vitest behavior: the repro piped the command through `| tail
   -N` and then checked `$?`, which reflects `tail`'s own exit status,
   not the piped command's — `tail` almost always exits `0`, so the
   repro was silently checking the wrong process's exit code the whole
   time. Re-run without the pipe (`> file 2>&1; echo $?`), a genuinely
   passing test with a probe reporter setting `process.exitCode = 1` in
   `onTestRunEnd` produces exit code `1`, confirmed independently twice
   (once during implementation, once in a follow-up verification pass)
   against real nested `vitest run` processes. Reading Vitest's own
   source explains why: `index.B89dZ0-N.js` only forces
   `process.exitCode = 1` when the run's own `state !== "passed"` — for
   a genuinely passing run, Vitest never touches `process.exitCode` at
   all, so nothing overwrites whatever a reporter already set.
   **This plugin still uses the same hybrid reporter-plus-check-CLI
   architecture as Jasmine/Mocha regardless of this correction** — not
   because a reporter *can't* influence the exit code (it can, on the
   versions tested), but because relying on that isn't part of Vitest's
   *documented* reporter contract, only an observed behavior on the
   specific versions tested, and consistency with every sibling
   plugin's proven, already-shipped pattern is worth more than a
   marginally simpler mechanism resting on undocumented behavior. The
   original justification for this choice was wrong; the choice itself
   still stands on its own, independent merits.

## Goals / Non-Goals

**Goals:**
- `Case(context, caseKey, opts)` / `Attach(context, caseKey, data,
  filename, contentType)` tag the currently-running Vitest test via its
  own native `annotate()` API, requiring an explicit context handle
  since `annotate` is only reachable via the test context parameter
  (no implicit global, matching Mocha's constraint, not Jest's/
  Jasmine's).
- A `TestPulseReporter` class (Vitest's modern Reporter API:
  `onTestModuleEnd`/`onTestRunEnd`) builds JUnit XML directly from
  `testCase.annotations()` and test results, with no dependency on the
  built-in `junit` reporter's (unsafe) file output and no
  scratch-directory side-channel for either case-key metadata or
  attachments.
- A separate `testpulse-vitest check` CLI reads a
  `.testpulse/result.json` marker and is the only thing that can fail
  the build — the reporter itself cannot.
- Attachment content-type allowlist, config resolution
  (env-var-over-option, fixed boolean parsing), credential-safe error
  logging, the marker's `reason` field, and XML escaping on every
  written value all match `testpulse-jasmine`/`testpulse-mocha`'s
  shape, including their post-implementation fixes applied from the
  start rather than rediscovered.
- CI (build+test per PR across a Node LTS × Vitest major matrix,
  verifying the bin-path/API-surface assumptions actually hold across
  majors — Mocha's own CI caught a real cross-major bin-path bug this
  way), automated `semantic-release` + npm Trusted Publishing (OIDC),
  MIT license, `package.json` starting at `0.1.0`.

**Non-Goals:**
- Depending on or requiring the built-in `junit` reporter to be
  configured at all — `testpulse-vitest` is fully self-contained for
  XML generation (see Context #4).
- Any scratch-directory-based attachment storage — Vitest's own
  `annotate()` attachment mechanism replaces it entirely (see Context
  #3). `.testpulse/` is used only for the `result.json` marker.
- Vitest's browser-mode/component-testing surface — this targets
  Vitest's standard Node test-runner mode, the same scope every sibling
  plugin targets for its own ecosystem's standard test-running mode.

## Decisions

- **Repo/packaging**: new public repo `Barayo/testpulse-vitest`, MIT
  license, TypeScript compiled to JS + `.d.ts`, `vitest` as a peer
  dependency (`>=1.0.0` — annotations and the modern Reporter API are
  both stable well before the `5.0.0` version researched this session;
  the CI matrix will confirm the actual floor empirically rather than
  assuming it), published to npm via `semantic-release` + Trusted
  Publishing (OIDC) — same shape as `testpulse-jasmine`/
  `testpulse-mocha`. `package.json` starts at `0.1.0`, not `1.0.0` —
  Jasmine's first release collided because `npm version` refuses to
  "bump" to an already-identical version, and semantic-release's own
  first release also computes `1.0.0`.
- **`Case(context, caseKey, opts)` calls `context.annotate(caseKey,
  'testpulse_case_key')`, and additionally `annotate(opts.platform,
  'testpulse_platform')`/`testpulse_version`/`testpulse_tags` (tags
  joined the same way every other plugin joins them) only for whichever
  options were supplied** (Context #1, #2). No scratch-directory
  bookkeeping — Vitest's own annotation array is the single source of
  truth for what a test declared, matching Jasmine's
  `setSpecProperty`/`getSpecProperty` story more closely than Jest's or
  Mocha's DIY property-stashing.
- **`Attach(context, caseKey, data, filename, contentType)` verifies
  `caseKey` by reading `context.task.annotations` for an existing
  `testpulse_case_key` entry matching it** (the same "verified via
  readback" pattern Jasmine/Mocha use, here backed by a genuinely
  native array rather than a custom property), rejecting a mismatch or
  absence. Content type validated first, same allowlist
  (`image/png`/`image/jpeg`/`image/webp`) as every prior plugin. On
  success, calls `context.annotate(filename, 'testpulse_attachment', {
  body: data, contentType })` — the attachment's bytes travel entirely
  through Vitest's own annotation mechanism, never touching disk or a
  scratch directory.
- **`TestPulseReporter` builds JUnit XML directly, no dependency on the
  built-in `junit` reporter** (Context #2, #4). In `onTestModuleEnd`
  (fired once per test file, after that file's tests complete) it
  accumulates each `testCase`'s `annotations()`, separating
  `testpulse_case_key`/`_platform`/`_version`/`_tags` (folded into the
  `<testcase>`'s `<properties>` block) from `testpulse_attachment`
  entries (pulled into the submission's `attachments` array, keyed by
  whatever `testpulse_case_key` that same test declared). In
  `onTestRunEnd` (fired once, after every module has finished), it
  assembles the final `<testsuites>` document from the accumulated
  per-module data, resolves config, submits (or dry-run previews), and
  writes the result marker — the same overall shape as Jasmine's/
  Mocha's `EVENT_RUN_END`/`jasmineDone` handler, adapted to Vitest's
  two-phase (`onTestModuleEnd` then `onTestRunEnd`) reporter lifecycle.
  Every value written into the XML (test name, classname/file, failure
  message/stack, case key, platform, version, each tag) is escaped via
  the same `escapeXml()` helper ported from `testpulse-jasmine`'s
  `xmlBuilder.ts` — a hand-rolled writer has no escaping guarantee
  unless built in explicitly, the same real gap found and fixed in
  Mocha's own gating review, applied here from the start.
- **Hybrid reporter-plus-check-CLI architecture** (Context #5).
  `onTestRunEnd`'s handler is `async`: builds the report, resolves
  config (env var wins over reporter option, fixed boolean parsing:
  case-insensitive `"true"`/`"1"` is true, everything else including
  the literal string `"false"` is false), submits via `POST
  /api/v1/projects/{projectKey}/imports` (or does a
  `--dry-run`-equivalent `GET /cases` preview), and writes
  `.testpulse/result.json` — reusing `ResultMarker`'s exact shape from
  `testpulse-jasmine`/`testpulse-mocha` including the optional `reason`
  field (a missing-config skip writes `{failed: true, reason: '...'}`,
  naming only the missing variable, never another setting's resolved
  value). `testpulse-vitest check` reads the marker and is the only
  thing that can fail the build. Submission-error logging is restricted
  to status/message/credential-stripped URL, never a raw caught
  error/request object (the same real gap found and fixed in Mocha's
  gating review). Documented usage avoids `&&` for the same reason
  Jasmine's/Mocha's README now does:
  ```sh
  vitest run; vitest_status=$?
  testpulse-vitest check; check_status=$?
  [ "$vitest_status" -eq 0 ] && [ "$check_status" -eq 0 ]
  ```
- **Attachment on-disk storage is eliminated entirely, not just
  hardened** — since attachments travel through `annotate()`'s
  in-memory/RPC-serialized mechanism rather than a scratch directory,
  the entire class of path-traversal risk Jest's/Mocha's attachment
  filename-hashing existed to close (Context: found in both of their
  own gating reviews) doesn't exist here at all — there is no
  caller-controlled filename ever used to construct a filesystem path,
  because there is no filesystem path involved in the first place.
- **Registration via the `reporters`/`outputFile` fields in
  `vitest.config.ts`** (or `.mjs`/`.js`), consistent with how Vitest
  documents custom reporter configuration generally:
  ```ts
  // vitest.config.ts
  import { defineConfig } from 'vitest/config';

  export default defineConfig({
    test: {
      reporters: ['default', 'testpulse-vitest'],
    },
  });
  ```
  No `outputFile` entry needed for `testpulse-vitest` itself (it writes
  no file the user needs to point elsewhere) — a real ergonomic
  advantage over Jest's two-part `jest-junit` + `testpulse-jest` setup.

## Risks / Trade-offs

- **Coupling to Vitest's own annotation data model
  (`{message, type, attachment?}`)**, which is a newer, less
  battle-tested Vitest feature than, say, Jasmine's `setSpecProperty`
  (stable since v3.6.0) — mitigated by the CI matrix testing across
  multiple Vitest majors, and by the fact that the built-in `junit`
  reporter itself depends on the exact same data model, meaning Vitest
  has a strong incentive to keep it stable — this plugin depends on the
  same underlying mechanism Vitest's own built-in reporter uses, not a
  niche or undocumented one.
- **`onTestModuleEnd`/`onTestRunEnd`'s two-phase lifecycle** is a
  different shape than Jasmine's/Mocha's single end-of-run hook —
  mitigated by accumulating per-module data during `onTestModuleEnd`
  and only building/submitting the final report in `onTestRunEnd`,
  verified via a real end-to-end test with multiple test files to
  confirm cross-module aggregation works correctly, not just a
  single-file happy path.
- **Coupling to the JUnit XML schema TestPulse's own import endpoint
  expects**, which has no formal versioned contract — same risk already
  accepted for every other JUnit-XML-producing plugin, mitigated the
  same way: targeting the long-stable subset (`<testcase classname
  name>`, `<properties><property name value>`).
- **Requiring an explicit context handle for `Case`/`Attach`** (no
  implicit global) is a real ergonomic divergence from Jest's/Jasmine's
  plugins, though consistent with Mocha's and Go's — mitigated by
  stating it plainly in the README's first example, matching how Mocha's
  README already handles the same constraint honestly rather than
  hiding it.
- **A dry-run preview-fetch failure was underspecified in the original
  design** — found during gating review (Luis): the marker's failure
  handling was only ever stated for the real-submission path; the
  dry-run path's own wording ("regardless of the preview's result")
  could be read as "even on fetch failure," which would let a broken
  `TESTPULSE_TOKEN`/`TESTPULSE_URL` silently report a green build in
  exactly the mode someone reaches for to smoke-test that config/auth
  is correct. Fixed by requiring the same fail-closed, credential-safe
  logging behavior on this path as the real-submission path.
- **The fixed boolean-parsing rule only covered the environment
  variable's string form, not the reporter option's** — found during
  gating review (Luis): a config author writing `{ dryRun: 'false' }`
  (a string) in `vitest.config.ts` could hit the exact bare-truthiness
  bug the env-var-side fix was designed to prevent, since nothing in
  the original spec said the same rule applied to that source too.
  Fixed by stating the rule applies uniformly regardless of source, and
  by typing the reporter options as `boolean` only (not `boolean |
  string`) so a config author's own type-checker catches this at the
  call site.
- **Combining `testpulse-vitest` with Vitest's built-in `html` reporter
  leaks attachment bytes into that reporter's own output — confirmed
  empirically, not hypothetical.** Found during gating review (Luis),
  then verified with a real repro this session: a `testpulse_attachment`
  annotation's base64 `body` was found intact inside
  `.vitest/ui/html.meta.json.gz`, the metadata bundle behind the `html`
  reporter's own report — the exact file Vitest's own CLI output
  suggests running `npx vite preview` on, a command shape teams
  commonly wire into CI artifact publishing or GitHub Pages previews.
  A screenshot attached via `Attach()` for TestPulse's own private
  import would ride along into that much more widely-visible artifact.
  (Separately confirmed the `json` reporter's output does NOT include
  annotation data at all, so this risk is specific to `html`, not every
  built-in reporter.) `testpulse-vitest` itself has no code-level
  mitigation available — this is a property of the shared mechanism it
  depends on, not a bug in its own logic — so this is addressed as an
  explicit, prominent README warning (not buried), naming `html`
  specifically and explaining why, rather than a vague "be careful"
  note.
- **The html-reporter warning understated exposure, and the peer-dep
  version claim was untested** — two low-risk findings from
  post-implementation review (Luis): the warning said attachment bytes
  were found "intact inside `html.meta.json.gz`," but a real repro
  showed they're also written out as an individually-fetchable
  standalone static file (`html/data/<hash>.png`, raw and unencoded)
  alongside the report's other assets — worse than "buried in a gzip
  blob" implies. Separately, `peerDependencies`/the README both claimed
  `vitest >=1.0.0` support while the CI matrix only ever exercises
  3.x/4.x/5.x. Both fixed to state only what's actually verified.
