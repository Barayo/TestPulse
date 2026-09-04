## Context

`add-execution-import` (#38) shipped `POST
/api/v1/projects/{projectKey}/imports`, matching `<testcase>` entries in a
JUnit XML report to existing cases by a `testpulse_case_key` `<property>`.
Issue #58 tracked installable plugins for the major JUnit-XML-producing
ecosystems; it was split into #154 (pytest, shipped), #155 (Jest,
shipped), #156 (Maven, shipped), #157 (Gradle, shipped), #169 (Go,
shipped), #170 (.NET, shipped), #171 (gtest, shipped), #165 (Jasmine,
this change).

The issue's own guess was that `jasmine-reporters`' `JUnitXmlReporter`
(the de facto JUnit-XML tool in Jasmine's ecosystem) might support the
same pattern `jest-junit`'s `testCasePropertiesFile` gave `testpulse-jest`
— this needed real verification, not assumption. Reading
`jasmine-reporters`' actual source
(`src/junit_reporter.js`, `specAsXml()`) confirms it does **not**: each
`<testcase>` is built with only `classname`/`name`/`time`, plus
conditional `<skipped>`/`<failure>`/`<system-out>` children — no
`<properties>` block exists anywhere in its output, and no option or
hook exists for injecting one. This closes off the Jest-style
"compose with an existing property-injection hook" path.

A second, better path opened instead. Jasmine has a real, first-party,
documented API for exactly this use case:
[`jasmine.getEnv().setSpecProperty(key, value)`](https://jasmine.github.io/api/edge/Env.html)
(`@since 3.6.0`, confirmed by reading Jasmine core's own source,
`src/core/Env.js`) — its own JSDoc states it "Sets a user-defined
property that will be provided to reporters as part of the properties
field of SpecResult." A paired `getSpecProperty(key)` reads it back
during the same spec's execution. This is architecturally closer to
gtest's `RecordProperty()` or pytest's `record_property()` than to
Jest's design — no scratch-directory side-channel is needed for tagging
at all, since Jasmine already has a native mechanism, and the paired
getter gives `Attach()`'s allowlist check a free, built-in
implementation with no custom in-memory tracking required.

A third real finding, discovered while researching how a custom reporter
could fail the build: Jasmine's CLI runner (`jasmine-npm`,
`lib/jasmine.js`) always calls `this.exit(RunnerBase.exitCodeForStatus(overallResult.overallStatus))`
where `this.exit` is `process.exit` and `overallStatus` is derived purely
from spec pass/fail — confirmed directly in source. `process.exit(explicitCode)`
always overrides `process.exitCode`, so a reporter has no sanctioned way
to make the build fail for a submission error or an unmatched case, the
same problem shape (a runner hook that runs reliably but can't affect
the final exit code) the .NET plugin hit with `VSTestTask`, solved there
by pairing an in-process hook with a narrow, separate exit-code check.

## Goals / Non-Goals

**Goals:**
- A native, zero-scratch-directory tagging mechanism for case-key
  metadata (`setSpecProperty()`), unlike Jest's design, which needed a
  disk-based side-channel to cross Jest's worker/main-process boundary —
  Jasmine has no such boundary by default (specs and reporters run in
  the same process unless `--parallel` is used; see Risks).
- Screenshot/file attachments in v1, matching the more recent
  Jest/Gradle/Go/.NET/gtest plugins rather than Maven's earlier
  deferral.
- Auto-wired annotate+submit (a custom reporter, not a CLI-only design),
  matching Jest's convenience — but paired with a narrow, separate exit-
  code-enforcing `check` command, the same hybrid architecture the .NET
  plugin's VSTest-logger-plus-AfterTargets-check pairing already proved
  out for the identical "in-process hook can't affect exit code" problem.
- A dry-run preview, matching the parity already established by every
  prior plugin except the original Maven scope.

**Non-Goals (v1):**
- Mocha, Vitest — tracked separately (#166, #167).
- A dependency on `jasmine-reporters` for anything — confirmed to have no
  property-injection support, so this plugin builds its own JUnit XML
  directly instead of depending on/post-processing a third-party writer.
- Per-invocation case keys for Jasmine's parameterized-test patterns
  (there is no first-class `test.each`-equivalent in vanilla Jasmine, so
  this isn't a live concern the way it was for Jest/.NET, but is noted
  here as explicitly out of scope should a common pattern emerge).

## Decisions

### Repo & packaging
New public repo `Barayo/testpulse-jasmine`, MIT license, TypeScript
source compiled to JS + `.d.ts` for publishing — the same shape as
`testpulse-jest`. `jasmine-core`/`jasmine` are peer dependencies, not
bundled.

### Tagging via Jasmine's own setSpecProperty
```js
const { testpulse } = require('testpulse-jasmine');

it('login succeeds', function () {
    testpulse.Case('LOGIN-42', { platform: 'linux', tags: ['smoke'] });
    // ...
});
```
`Case(caseKey, opts?)` calls
`jasmine.getEnv().setSpecProperty('testpulse_case_key', caseKey)`, and
additionally `setSpecProperty('testpulse_platform', ...)`/
`testpulse_version`/`testpulse_tags` only for whichever of `opts.platform`/
`opts.version`/`opts.tags` were supplied — matching the property names
the `execution-import` capability's importer already reads. `Case`
called outside an active spec throws — `setSpecProperty` itself already
throws `"'setSpecProperty' was used when there was no current spec"` in
that case (confirmed via source), so `Case` lets that error surface
rather than swallowing or duplicating it.

### Attachments: verified via Jasmine's own getSpecProperty readback
```js
it('login fails with bad password', function () {
    testpulse.Case('LOGIN-43');
    const screenshot = takeScreenshot();
    testpulse.Attach('LOGIN-43', screenshot, 'failure.png', 'image/png');
});
```
`Attach(caseKey, data, filename, contentType)` calls
`jasmine.getEnv().getSpecProperty('testpulse_case_key')` and compares it
to the supplied `caseKey`, rejecting (throwing) a mismatch — this is a
genuine, built-in Jasmine capability (unlike every other plugin in this
family, which had to build its own allowlist-tracking mechanism from
scratch: Gradle's `StackWalker`-based inference, Go's per-test map,
.NET's `TestContext.Current`-keyed map, gtest's `current_test_info()`-keyed
map). `getSpecProperty` outside an active spec throws the same
Jasmine-native error `Case` relies on, giving `Attach`'s "no active spec"
case the identical, real error surface. Content type is validated
(`image/png`/`image/jpeg`/`image/webp` only) before the case-key check,
matching every prior plugin's ordering. Storage: a `.testpulse/` scratch
directory (specs and the reporter that eventually submits attachments
run in the same process by default, but the scratch-dir approach is used
regardless, for the same reason every other plugin uses one: the
attachment's binary bytes don't belong inside a JUnit XML `<property
value="...">` string, and need to be handed to the submit step as a
sibling `attachments` array on the request body). On-disk filenames are
derived from a hash of the case key plus a fresh identifier per call,
never from the caller-supplied `filename` directly — no path-traversal
surface, matching every other plugin.

### The reporter: builds JUnit XML directly, no jasmine-reporters dependency
Registered via the **declarative `reporters` array**, in a JavaScript
config file (`spec/support/jasmine.js`, not `.json` — Jasmine's own docs
state this option only works from a JS config, "because reporters are
objects with methods"), not a `helpers` file calling
`jasmine.getEnv().addReporter(...)` imperatively. This corrects the
original plan (an earlier draft of this design specified the `helpers`
approach) after a real, empirical discovery during implementation: a
`helpers`-file `addReporter()` call throws outright under
`jasmine --parallel=N` ("Reporters cannot be added via Env in parallel
mode"), a hard, fatal error, not a data-survival risk — see Risks below
for the full story, including how the corrected mechanism was found to
genuinely support `--parallel` mode too, once a reporter opts in.
```js
// spec/support/jasmine.js
const { TestPulseReporter } = require('testpulse-jasmine');

module.exports = {
  spec_dir: 'spec',
  spec_files: ['**/*[sS]pec.js'],
  reporters: [new TestPulseReporter({ url: 'http://localhost:8080', project: 'LOGIN' })],
};
```
The reporter class sets `this.reporterCapabilities = { parallel: true }`
in its constructor — confirmed via a real repro that this is the actual,
documented opt-in mechanism (`reporterCapabilities: {parallel: true}`)
Jasmine's `ParallelRunner` requires before it will accept a
`reporters`-array reporter at all, and that doing so makes
`setSpecProperty`'s value genuinely survive into the reporter's
`specDone` calls under real `--parallel=2` execution, not just in
sequential mode — this single declaration is what makes `--parallel`
mode fully supported rather than a documented limitation (see Risks).

The reporter accumulates each spec's result (from `specDone`, including
its `properties` field) as the run progresses, then in `jasmineDone`:
1. Builds JUnit XML directly (`<testsuites><testsuite><testcase
   classname name time><properties><property name value/></properties></testcase>`),
   injecting `testpulse_case_key`/`testpulse_platform`/`testpulse_version`/
   `testpulse_tags` from each spec's own `result.properties` — no
   `jasmine-reporters` dependency, no post-processing, no risk of a
   third-party library's output shape changing underneath this plugin.
2. Resolves config (see below).
3. If `dryRun`: fetches `GET /api/v1/projects/{project}/cases`
   (read-only) and logs a match preview — never touches the import
   endpoint, never writes a failing result marker.
4. Otherwise, reads the `.testpulse/` scratch directory's attachment
   sidecars, groups them by case key, and `POST`s `{ format: "junit-xml",
   report, attachments }`, applying the same policy validated identically
   across every prior plugin:

   | Response | Behavior |
   |---|---|
   | `201` all matched | logs a summary |
   | `207` some unmatched | logs a warning (names unmatched keys, points at `failOnUnmatched`) |
   | network/auth/4xx/5xx error | logs the error |

5. Writes `.testpulse/result.json` (`{ failed: boolean }`) reflecting
   whether the outcome should fail the build (submission error, or
   `207`-with-`failOnUnmatched`) — the same narrow result-marker pattern
   the .NET plugin's `TestPulseLogger` already established for the
   identical "this hook can't affect the process exit code itself"
   constraint.

### The check CLI: the only thing that can actually fail the build
```sh
jasmine && testpulse-jasmine check
```
`testpulse-jasmine check` reads `.testpulse/result.json`; if it's absent
(the reporter never ran — misconfiguration) it exits non-zero with a
message naming the likely cause (the `reporters` entry missing from the
JS config file, or the config file not actually being loaded); if
`failed: true`, exits
non-zero; otherwise exits `0`. This mirrors the .NET plugin's
`TestPulseLogger` (does the real work, can't affect exit code) plus its
narrow `AfterTargets` check (reads a marker, can affect exit code) split
— proven there against a real repro showing the in-process hook's
inability to influence the runner's own exit-code logic, and now
independently confirmed to be the same real constraint in Jasmine's
runner via source inspection rather than assumed to transfer.

### Config: environment variable over reporter options
Since the reporter is configured via the `reporters`-array
`new TestPulseReporter(options)` construction, not a CLI this package
owns for the annotate/submit step, there's no CLI-flag tier for that
half — but the env-var-wins-for-secrets principle from every prior
plugin still applies:

| Setting | Env var | Reporter option |
|---|---|---|
| API base URL | `TESTPULSE_URL` | `url` |
| API token | `TESTPULSE_TOKEN` | `token` |
| Project key | `TESTPULSE_PROJECT` | `project` |
| Fail on unmatched | `TESTPULSE_FAIL_ON_UNMATCHED` | `failOnUnmatched` |
| Dry run | `TESTPULSE_DRY_RUN` | `dryRun` |

Same env var names already used by every prior plugin and the raw curl
snippet in `docs/importing-results.md`.

### Testing approach (TDD)
- **`Case()`/`Attach()`**: unit tests against a real `jasmine.getEnv()`
  instance (Jasmine's own testing pattern for testing Jasmine-dependent
  code — no need to fake `setSpecProperty`/`getSpecProperty`, since
  they're real, stable, documented APIs), asserting the recorded
  properties and the allowlist rejection.
- **The reporter's XML builder**: unit tests constructing a synthetic
  `JasmineDoneInfo`/spec results array with known `properties` fields,
  asserting the generated XML shape.
- **The reporter's submit/dry-run logic**: unit tests with HTTP mocked,
  covering the same response table every prior plugin's tests cover.
- **`check`**: unit tests against fixture `.testpulse/result.json`
  contents (present-and-failed, present-and-passed, absent).
- **A small number of true end-to-end tests**: spawn a real nested
  `jasmine` child process against a fixture project (a JS config file's
  `reporters` array → `setSpecProperty` → the reporter → the submitted
  payload → the result marker → `check`'s exit code), the same role
  `maven-invoker-plugin`/the Jest child-process tests played for their
  respective plugins — verifying the pieces actually integrate, not
  re-testing every branch already covered above. This includes a real
  repro confirming `setSpecProperty`'s value genuinely survives into
  `specDone`'s `result.properties` under both plain sequential execution
  and real `--parallel=2` execution (with `reporterCapabilities: {
  parallel: true }` declared) — not just trusting the JSDoc, the same
  "verify the real mechanism during implementation too" discipline that
  caught real, non-obvious gaps in the .NET and gtest plugins despite
  each looking correct from documentation/source alone, and that caught
  the `helpers`-file registration mistake in this design's own first
  draft.

### CI / publishing
- GitHub Actions: build+test matrix (a couple of recent Node LTS
  versions × a couple of recent Jasmine majors) on every PR.
- Release: `semantic-release` on merge to `main`, publishing to npm via
  Trusted Publishing (OIDC) — same as `testpulse-jest`.
- README: install, the `Case`/`Attach` API, the required `reporters`
  array entry in a JS config file (not JSON) and `jasmine &&
  testpulse-jasmine check` CI invocation, config-precedence table,
  exit-code table, dry-run, and a note that `--parallel` mode is
  supported. CONTRIBUTING: the layered testing approach above.

## Risks / Trade-offs

- **The original plan to register the reporter via a `helpers` file
  calling `jasmine.getEnv().addReporter()` was disproven during
  implementation, not merely refined** — a real isolated repro under
  `jasmine --parallel=2` produced a fatal, unrecoverable error:
  "Reporters cannot be added via Env in parallel mode." This is not a
  data-survival risk the way it was for Jest's worker/main boundary; it
  is a hard incompatibility with the registration mechanism itself. The
  corrected mechanism — the declarative `reporters` array in a
  JavaScript config file, with the reporter declaring
  `reporterCapabilities: { parallel: true }` in its constructor — was
  found via Jasmine's own error message pointing at the exact opt-in
  shape required, then verified with a second real repro: under this
  mechanism, `setSpecProperty`'s value genuinely does survive into the
  reporter's `specDone` calls under real `--parallel=2` execution
  (confirmed by running two real specs, each setting a distinct
  property, and observing both properties correctly attributed in the
  reporter's output), and the identical mechanism also works unchanged
  in plain sequential mode. This means `--parallel` mode ends up fully
  **supported**, not a documented v1 limitation as originally
  anticipated — a case where "verify, don't assume" corrected the design
  in a more favorable direction than the original plan expected, not
  just a defensive one.
- **The reporter cannot affect Jasmine's own exit code, confirmed via
  source, not assumed** — mitigated by the same hybrid
  reporter-plus-narrow-check-command architecture already proven for the
  .NET plugin's identical constraint (see Decisions above). The one case
  this combination cannot separately signal is "tests failed AND
  submission also failed for an unrelated reason" — in that case
  Jasmine's own exit code is already non-zero from the test failure
  itself (the correct outcome), and the reporter's own console output
  already reported the submission failure detail regardless of whether
  `check` ran.
- **No `jasmine-reporters` dependency, unlike the issue's own initial
  guess** — recorded here as the direct evidence that a "de facto
  standard" third-party tool in an ecosystem is not sufficient grounds to
  assume it has a needed capability; only reading its actual source
  settled this, the same discipline already applied to gtest's
  `RecordProperty()` docs-vs-reality discrepancy.
- **Coupling to the JUnit XML schema TestPulse's own import endpoint
  expects**, which has no formal versioned contract — same risk already
  accepted for every other JUnit-XML-producing plugin, mitigated the
  same way: targeting the long-stable subset (`<testcase classname
  name>`, `<properties><property name value>`). Building the report
  directly (rather than depending on a third-party tool's output) means
  this is the only external schema dependency this plugin carries.
- **`readAttachments` recursively matched any directory named
  `attachments` anywhere under the search root, and never re-validated a
  sidecar's `contentType` against the allowlist on read** — found
  post-implementation by Luis's security review, reproduced with a real
  PoC (an unrelated `attachments/` directory elsewhere in the project
  tree, containing a sidecar with `contentType: "text/plain"`, was
  genuinely picked up and would have ridden into a real submission). The
  content-type allowlist `Attach()` enforces on write is a real security
  boundary, not just a write-time nicety — it has to hold on the
  read/submit path too, or it doesn't hold at all. Fixed by scoping
  `readAttachments` to read exactly `<root>/.testpulse/attachments`
  non-recursively (matching where `writeAttachment` actually writes, and
  never creating subdirectories there in the first place) and
  re-validating each sidecar's `contentType` against
  `SUPPORTED_CONTENT_TYPES` on read, discarding (with a stderr warning)
  anything that doesn't pass. Covered by
  `attachmentStore.test.ts`'s "ignores an attachments-named directory
  that is not .testpulse/attachments" and "discards a sidecar whose
  contentType is not in the supported allowlist".
- **Same-case-key stale attachments were never pruned after a successful
  submission** — a narrower variant of the cross-run/cross-case-key
  contamination risk already designed against (see Decisions), but not
  itself covered: on a persistent (non-ephemeral) workspace, an
  attachment written under a given case key on one run would still be
  picked up and resubmitted alongside a fresh attachment under the same
  case key on a later run, since `readAttachments` has no way to
  distinguish "written this run" from "written last week." Found
  post-implementation by Luis. Fixed by pruning
  `.testpulse/attachments` after a successful (`201`/`207`) submission
  only — never on a failed submission, so a retry still has the
  attachments to resubmit. Covered by `reporter.test.ts`'s
  "prunes .testpulse/attachments after a successful (201/207)
  submission" and "leaves .testpulse/attachments in place after a
  failed submission, for a retry".
- **`check`'s "no marker found" message misdiagnosed the cause when
  required config (`TESTPULSE_URL`/`TOKEN`/`PROJECT`) was missing** —
  found post-implementation by Paco's real QA pass against a live
  TestPulse instance: with a reporter genuinely registered but no env
  vars set, the reporter correctly logged the real cause and skipped
  submission, but wrote no marker at all, so `check` reported its
  generic "the `reporters` array entry is missing... or the config file
  was not actually loaded" message — actively wrong, since the reporter
  had run. Fixed by giving `ResultMarker` an optional `reason` field,
  writing `{ failed: true, reason: '...' }` in the missing-config branch
  instead of returning silently, and having `check` print the marker's
  own `reason` when present. Covered by `reporter.test.ts`'s "writes a
  failed marker with a specific reason when required config is missing"
  and `check.test.ts`'s reason-reporting tests.
- **The README's own documented `jasmine && testpulse-jasmine check`
  invocation silently drops `check`'s diagnostics whenever a spec also
  fails** — found post-implementation by Paco, reproduced with a spec
  that both fails an expectation and hits a genuine submission error
  (bad token): `jasmine`'s own non-zero exit short-circuits `&&`, so
  `check` never runs and its specific diagnostic never prints, even
  though the combined exit code happens to still be non-zero from the
  spec failure alone. Not a gating bug (the build still correctly
  fails) but a real observability gap — a developer debugging a red run
  with both a failing spec and a broken import (a plausible real
  combination, e.g. a bad CI secret revealing pre-existing failures)
  never sees the import failure at all. Fixed by correcting the
  README's documented invocation to run `check` unconditionally and
  combine both exit codes explicitly, with an explicit warning against
  the `&&` form.
