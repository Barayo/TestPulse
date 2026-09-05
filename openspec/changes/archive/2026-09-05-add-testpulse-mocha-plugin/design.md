## Context

`add-execution-import` (#38) shipped `POST /api/v1/projects/{projectKey}/imports`,
matching `<testcase>` entries in a JUnit XML report to existing cases by
a `testpulse_case_key` `<property>`. Issue #58 tracks installable
plugins for the major JUnit-XML-producing ecosystems; this is #166
(Mocha), the fourth JS testing-framework plugin after Jest (#155,
shipped), Jasmine (#165, shipped), pytest (#154), Maven (#156), Gradle
(#157), Go (#169), .NET (#170), and gtest (#171).

All the load-bearing facts below were established via real research
this session (source reading + empirical repros), not assumption or
carried-over precedent from Jest/Jasmine:

1. **`mocha-junit-reporter`'s own README states plainly**: custom
   properties can be added at the `<testsuite>` level only
   (`reporterOptions: { properties: {...} }`); "no mechanism exists for
   adding custom properties to individual `<testcase>` elements." The
   same gap `jasmine-reporters` had.
2. **Mocha has no implicit "current test" global.** Jest has
   `expect.getState().currentTestName`; Jasmine has
   `jasmine.getEnv().setSpecProperty()`. Mocha's own issue tracker
   (mochajs/mocha#794, #3485) confirms: outside a test body, the only
   way to reach the running test is via `this` inside a non-arrow
   `it()`/hook function (`this.test`/`this.currentTest`), or by
   listening to `Runner` events in a custom reporter. No arbitrary code
   elsewhere can look this up.
3. **A reporter cannot influence Mocha's own process exit code.**
   Verified with a real repro: a custom reporter synchronously setting
   `process.exitCode = 1` inside `EVENT_RUN_END` still produced exit
   code `0`. Reading `lib/cli/run-helpers.js` explains why:
   `exitMochaLater`/`exitMocha` register a `process.on('exit', ...)`
   handler (fired when `mocha.run()`'s callback runs, i.e. after the
   reporter's own synchronous event handling) that unconditionally
   overwrites `process.exitCode` with the test-failure-derived count.
4. **Async work in a reporter's event handler does reliably complete**
   before the process exits, by default. Verified with a real repro: an
   `await`ed 500ms delay plus a file write inside `EVENT_RUN_END`
   completed successfully before the process exited with code 0. This
   is because Mocha's default (no `--exit` flag) is `exitMochaLater`,
   which does not force-kill the process — it waits for the event loop
   to drain naturally. (Passing `--exit` forces an immediate
   `process.exit()` once the synchronous portion of 'end' handling
   returns, which could kill an in-flight submission — see Risks.)
5. **`--parallel` mode cannot carry custom test properties across the
   worker→main IPC boundary, structurally, not just as an
   unimplemented feature.** Verified with a real repro (a property set
   on `this.test` in a worker came back `undefined` in the main
   process's reporter) and explained by reading the exact cause:
   `Test.prototype.serialize()` in `lib/test.js` returns a hardcoded
   object literal (`$$currentRetry`, `$$fullTitle`, `title`, `state`,
   `duration`, `err`, ... — an exhaustive, fixed list) for IPC
   transmission. No custom property survives this, regardless of
   registration mechanism. Unlike Jasmine's `--parallel` incompatibility
   (which was a registration-mechanism bug, later fixed), this is a
   structural limitation of Mocha's own serializer with no viable
   workaround from userland.

## Goals / Non-Goals

**Goals:**
- `Case(this, caseKey, opts)` / `Attach(this, caseKey, data, filename,
  contentType)` tag the currently-running Mocha test, requiring an
  explicit context handle since no implicit global exists.
- A `TestPulseReporter` class (registered via `.mocharc.js`/`.yml`'s
  `reporter`/`reporterOptions` fields) builds JUnit XML directly from
  `Runner` events and auto-submits it in `EVENT_RUN_END`, with no
  dependency on `mocha-junit-reporter`.
- A separate `testpulse-mocha check` CLI reads a `.testpulse/result.json`
  marker and is the only thing that can fail the build for a submission
  error or an unmatched case — the reporter itself cannot.
- Attachments, config resolution, and scratch-directory handling match
  `testpulse-jasmine`'s shape exactly, including its two
  post-implementation fixes (attachment-read scoping/content-type
  revalidation, pruning after a successful submission, and a marker
  `reason` field for missing-config diagnostics) applied from the start.
- CI (build+test per PR across a Node LTS × Mocha major matrix),
  automated `semantic-release` + npm Trusted Publishing (OIDC), MIT
  license, `package.json` starting at `0.1.0`.

**Non-Goals:**
- `--parallel` mode support (documented as unsupported in v1, with the
  exact structural reason — see Context #5 — not left unstated).
- Composing with `mocha-junit-reporter` in any form (ruled out — see
  Context #1).
- Any implicit/global tagging mechanism (AsyncLocalStorage-based or
  otherwise) — rejected as unnecessary complexity for a small ecosystem
  library, the same reasoning already applied to Go's explicit-handle
  design.
- BDD-style `describe`/`context` aliasing concerns, TDD-style
  `suite`/`test` interface support beyond what `Runner` events already
  cover uniformly (Mocha's own event interface is UI-agnostic; no
  special-casing needed).

## Decisions

- **Repo/packaging**: new public repo `Barayo/testpulse-mocha`, MIT
  license, TypeScript compiled to JS + `.d.ts`, `mocha` as a peer
  dependency (`>=9.0.0`, matching the oldest Mocha major with a
  stable `Runner.constants` event-name surface and modern `--parallel`
  behavior worth testing against), published to npm via
  `semantic-release` + Trusted Publishing (OIDC) — same shape as
  `testpulse-jest`/`testpulse-jasmine`. `package.json` starts at
  `0.1.0`, not `1.0.0` — Jasmine's first release collided because
  `npm version` refuses to "bump" to an already-identical version, and
  semantic-release's own first release also computes `1.0.0`.
- **`Case(this, caseKey, opts)` / `Attach(this, caseKey, data, filename,
  contentType)`, explicit handle required** (Context #2). `this` inside
  a non-arrow `it('...', function () {...})`/`beforeEach(function ()
  {...})` is a Mocha `Context`; `this.test`/`this.currentTest` exposes
  the running `Test`. `Case()` sets custom properties directly on
  `this.test` (e.g. `this.test.testpulseProperties = {...}`) — safe to
  do since the reporter reads these properties in the SAME process,
  synchronously, via `Runner` events (`--parallel`'s IPC boundary is the
  only place this breaks, which is explicitly unsupported per Non-Goals).
  Requires documenting that test bodies must use a regular `function
  ()`, not an arrow function — an existing, already-common Mocha
  convention (arrow functions never had access to `this.test` for
  Mocha's own APIs like `this.timeout()` either), not a new constraint
  this plugin introduces.
- **JUnit XML built directly by `TestPulseReporter`, no
  `mocha-junit-reporter` dependency** (Context #1). `TestPulseReporter`
  listens to `EVENT_TEST_PASS`/`EVENT_TEST_FAIL`/`EVENT_TEST_PENDING`
  to accumulate results (each carrying whatever `testpulseProperties`
  `Case()`/`Attach()` set on `this.test`), then builds
  `<testsuites><testsuite><testcase classname name time><properties>
  <property name value/></properties></testcase>` directly in
  `EVENT_RUN_END`, matching exactly what
  `apps/api/internal/junitxml/parser.go` already parses — the same
  "build it directly" resolution already proven for Jasmine.
  **Every value written into the XML — test title, classname, failure
  message/stack, and every `Case`/`Attach`-supplied value — is escaped**
  (`escapeXml()`, ported near-verbatim from `testpulse-jasmine`'s
  `xmlBuilder.ts`), the exact protection Maven's design documented
  relying on Surefire's own writer for, which this plugin has to
  provide itself since it *is* the writer — found during gating review
  (Luis) as a real gap in this design's original wording (the language
  said "builds JUnit XML directly" without ever stating an escaping
  requirement, which would let a crafted failure message forge a
  sibling `<property>`/`<testcase>` element and bypass `Attach()`'s own
  case-key verification entirely).
- **Attachment on-disk filenames are a hash of the case key plus a
  fresh per-call identifier, never the raw case key or filename** —
  ported directly from `testpulse-jasmine`'s
  `crypto.createHash('sha256').update(\`${caseKey}:${id}\`)` pattern
  (itself inherited from a fix `testpulse-jest`'s own gating review
  required, since a data-driven test's case key is caller-controlled
  text, not a trusted constant). Tightened explicitly during this
  change's own gating review (Luis) after the original design's wording
  ("derived from the case key plus a fresh identifier") was ambiguous
  about whether the case key itself could land in a path segment.
- **Hybrid reporter-plus-check-CLI architecture** (Context #3, #4).
  `EVENT_RUN_END`'s handler is `async`: builds the report, resolves
  config (env var wins over reporter option, no third tier), submits
  via `POST /api/v1/projects/{projectKey}/imports` (or does a
  `--dry-run`-equivalent `GET /cases` preview), and writes
  `.testpulse/result.json` — reusing `ResultMarker`'s exact shape from
  `testpulse-jasmine` including the optional `reason` field (Jasmine's
  post-implementation fix, applied here from day one: a missing-config
  skip writes `{failed: true, reason: '...'}`, not silence).
  `testpulse-mocha check` reads the marker and is the only thing that
  can fail the build. Documented usage avoids `&&` for the same reason
  Jasmine's README now does:
  ```sh
  mocha; mocha_status=$?
  testpulse-mocha check; check_status=$?
  [ "$mocha_status" -eq 0 ] && [ "$check_status" -eq 0 ]
  ```
- **Attachments, scratch directory, and config resolution match
  `testpulse-jasmine` exactly**, including its two post-implementation
  fixes applied proactively: `readAttachments` reads exactly
  `<root>/.testpulse/attachments` (non-recursive, no basename-matched
  tree walk) and re-validates `contentType` against the allowlist on
  read, not just on write; attachments are pruned after a successful
  (`201`/`207`) submission and left in place after a failed one, for a
  retry. `Attach(this, caseKey, data, filename, contentType)` verifies
  `caseKey` against whatever `Case()` already set on `this.test` (the
  same "verified via readback" pattern Jasmine used, adapted from
  `getSpecProperty()` to a plain property read since Mocha has no
  built-in equivalent).
- **Boolean env vars (`TESTPULSE_FAIL_ON_UNMATCHED`,
  `TESTPULSE_DRY_RUN`) are parsed by a fixed rule: case-insensitive
  `"true"`/`"1"` is true, everything else (including the literal string
  `"false"`) is false** — never a bare JS truthiness check on the raw
  string, which would treat `"false"` as truthy. Found during gating
  review (Luis) as an unpinned decision with real behavioral stakes in
  either direction (a `TESTPULSE_DRY_RUN=false` meant to enable real
  submission getting stuck in dry-run, or the reverse).
- **Submission-error logging is restricted to status/message/URL
  (credentials stripped), never a raw caught error or request/response
  object** — found during gating review (Luis): most JS HTTP clients'
  error objects carry the outgoing request's headers, including
  `Authorization`, so a naive `console.error(err)` on a network/4xx/5xx
  failure would satisfy "never call `console.log(token)`" while still
  leaking it through the back door of whole-object logging. The
  marker's `reason` field is similarly restricted to naming which
  config variable is missing, never echoing another setting's resolved
  value (a resolved `url` could itself carry embedded credentials in an
  unusual configuration).
- **Registration via `.mocharc.js`/`.yml`'s `reporter` +
  `reporterOptions` fields** (not a `--reporter` CLI flag as the primary
  documented path, though both work identically — Mocha resolves
  `reporter` the same way regardless of source). Recommending the config
  file matches Jasmine's approach and keeps CI invocations short:
  ```js
  // .mocharc.js
  module.exports = {
    reporter: 'testpulse-mocha',
    'reporter-option': ['url=...', 'project=...'],
  };
  ```
  `TestPulseReporter` is Mocha's actual exported reporter (module
  default export resolves to the class), consistent with how Mocha
  resolves reporter names to either built-ins or `require()`-able
  modules.
- **`--parallel` unsupported in v1; documented in the README, AND the
  reporter emits a runtime stderr warning when it detects parallel
  mode** (Context #5, per user discussion, corrected during gating
  review). The original design rejected ALL runtime detection because
  inspecting Mocha's internal runner-type (`ParallelBufferedRunner` vs.
  plain `Runner`) isn't a documented public API — that reasoning still
  holds for THAT specific mechanism, but gating review (Luis) pointed
  out a different, genuinely stable one exists: Mocha's own resolved
  `parallel` boolean option, part of the standard config surface passed
  into a reporter's constructor (`new Reporter(runner, options)`),
  requires no internal-class inspection at all. Without this warning,
  the failure mode is a fully silent green build: every `Case()`-tagged
  property is simply absent from the reporter's view, the submitted
  report has zero case keys, the API returns `207` with everything
  unmatched, `fail-on-unmatched` is off by default, so `check` exits
  `0` — nothing distinguishes "no one called `Case()`" from "`Case()`
  was called but didn't survive," and a user could go a long time
  before noticing TestPulse never received their results. The warning
  makes this diagnosable at the moment it happens instead.

## Risks / Trade-offs

- **A user passing `--exit` to Mocha could kill an in-flight submission
  before it completes** — `--exit` forces `process.exit()` once the
  synchronous portion of `EVENT_RUN_END`'s handler returns (i.e., right
  after the first `await`), rather than waiting for the event loop to
  drain the way the default (`exitMochaLater`) does. Mitigation:
  document this explicitly as a real, verified risk (not a hedge) in
  the README — recommend NOT passing `--exit` when using this reporter,
  matching Mocha's own default (leaving `--exit` opt-in) rather than
  requiring extra configuration.
- **`--parallel` mode is a real, common Mocha feature this plugin
  cannot support in v1** — mitigated by the non-goal being explicit and
  explained (Context #5), not silent; a future major version could
  revisit this if Mocha's own serializer ever exposes an extension
  point, but no such point exists today.
- **Coupling to the JUnit XML schema TestPulse's own import endpoint
  expects**, which has no formal versioned contract — same risk already
  accepted for every other JUnit-XML-producing plugin, mitigated the
  same way: targeting the long-stable subset (`<testcase classname
  name>`, `<properties><property name value>`).
- **Requiring non-arrow-function test bodies for `Case`/`Attach`** is a
  real ergonomic constraint, though not a new one Mocha users haven't
  already encountered for `this.timeout()`/`this.retries()`. Mitigated
  by stating it plainly in the README's first example, not burying it.
- **A `207` response's "enable failOnUnmatched" log line printed
  unconditionally, even when `failOnUnmatched` was already enabled** —
  found post-implementation by Paco's real QA pass against a live
  TestPulse instance (a genuinely unmatched case key with
  `TESTPULSE_FAIL_ON_UNMATCHED=true` set still logged "enable
  failOnUnmatched to make this a hard failure," which reads as "your
  setting didn't take effect" even though the exit code was already
  correctly non-zero). Not a gating bug — every exit-code scenario in
  the spec still held — but a real, misleading diagnostic for anyone
  triaging a CI failure. Fixed by gating the message on `failOnUnmatched`
  itself: the already-enabled case now logs "failing the build
  (failOnUnmatched is enabled)" instead. Covered by `reporter.test.ts`'s
  "a 207 response with default config suggests enabling failOnUnmatched"
  and "...with failOnUnmatched already enabled does not suggest
  enabling it".
- **The CI matrix's Node 18/mocha 9 cell failed with "Cannot find module
  mocha/bin/mocha.js"** — caught by CI itself, not local development
  (this machine's locally-installed mocha happened to be a newer
  major that masked the bug). Root cause: mocha 9's own `package.json`
  declares its CLI bin at `./bin/mocha` (no extension); mocha 10+
  renamed it to `./bin/mocha.js`. The e2e test helper
  (`test/e2e/helpers/runMocha.ts`) hardcoded the newer path. Fixed by
  resolving the bin path from the installed `mocha` package's own
  declared `bin` field in its `package.json`, verified directly against
  both mocha 9 and mocha 10 locally (not just trusting the CI matrix to
  eventually confirm it) before pushing. Test-infrastructure-only; no
  production code was affected.
