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
Registered via a `helpers` file entry (Jasmine's real mechanism for
custom reporter registration — confirmed via research that Jasmine's
config has no declarative `reporters` array the way Jest does; a
`helpers` array of files run once before all specs is the sanctioned
place to call `jasmine.getEnv().addReporter(...)`):
```json
{
  "spec_dir": "spec",
  "helpers": ["node_modules/testpulse-jasmine/dist/helper.js"]
}
```
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
message naming the likely cause (the `helpers` entry missing, or
`jasmine.json` pointing at the wrong file); if `failed: true`, exits
non-zero; otherwise exits `0`. This mirrors the .NET plugin's
`TestPulseLogger` (does the real work, can't affect exit code) plus its
narrow `AfterTargets` check (reads a marker, can affect exit code) split
— proven there against a real repro showing the in-process hook's
inability to influence the runner's own exit-code logic, and now
independently confirmed to be the same real constraint in Jasmine's
runner via source inspection rather than assumed to transfer.

### Config: environment variable over reporter options
Since the reporter is configured via the `helpers`-loaded
`addReporter(new TestPulseReporter(options))` call, not a CLI this
package owns for the annotate/submit step, there's no CLI-flag tier for
that half — but the env-var-wins-for-secrets principle from every prior
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
  `jasmine` child process against a fixture project (helpers file →
  `setSpecProperty` → the reporter → the submitted payload → the result
  marker → `check`'s exit code), the same role
  `maven-invoker-plugin`/the Jest child-process tests played for their
  respective plugins — verifying the pieces actually integrate, not
  re-testing every branch already covered above. This must include a
  real repro confirming `setSpecProperty`'s value genuinely survives into
  `specDone`'s `result.properties` (not just trusting the JSDoc), the
  same "verify the real mechanism during implementation too" discipline
  that caught real, non-obvious gaps in the .NET and gtest plugins
  despite each looking correct from documentation/source alone.

### CI / publishing
- GitHub Actions: build+test matrix (a couple of recent Node LTS
  versions × a couple of recent Jasmine majors) on every PR.
- Release: `semantic-release` on merge to `main`, publishing to npm via
  Trusted Publishing (OIDC) — same as `testpulse-jest`.
- README: install, the `Case`/`Attach` API, the required `helpers` entry
  and `jasmine && testpulse-jasmine check` CI invocation, config-
  precedence table, exit-code table, dry-run. CONTRIBUTING: the layered
  testing approach above.

## Risks / Trade-offs

- **`jasmine --parallel=N` runs specs across separate worker processes**
  (confirmed via research: Jasmine 5.0+ added this, opt-in, and its own
  `ParallelReportDispatcher` docstring explicitly warns "Do not use
  ParallelReportDispatcher in the same process that Jasmine specs run
  in" — meaning results ARE aggregated centrally across a process
  boundary in that mode, the same architectural shape as Jest's
  worker/main split) — `setSpecProperty`'s own JSDoc states its value is
  "provided to reporters as part of the properties field of SpecResult,"
  which is a strong signal it's designed to survive serialization across
  that boundary (the feature would be far less useful otherwise), but
  this must be verified with a real `--parallel=2` end-to-end repro
  during implementation, not merely trusted from the docstring's wording
  — the same "verify, don't assume" discipline that caught two separate,
  non-obvious failures in the .NET plugin despite each looking correct
  from research alone. If it does NOT survive, `--parallel` mode becomes
  a documented v1 limitation (default, sequential mode is unaffected
  either way, and is Jasmine's out-of-the-box default).
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
