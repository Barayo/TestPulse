## Why

As a developer running Mocha (common in pre-Jest Node backend/library
codebases), when I want to report results into TestPulse, I want a
package that gets `testpulse_case_key` (and optional
`testpulse_platform`/`testpulse_version`/`testpulse_tags`) into a JUnit
XML report, instead of hand-rolling it. This is the sixth of seven
JUnit-XML-producing-ecosystem importer plugins tracked under #58 (after
pytest, Maven/Gradle, Jest, Go, .NET, and gtest), and the fourth JS
testing-framework plugin after Jest and Jasmine.

## What Changes

- New public repo `Barayo/testpulse-mocha` (MIT license, TypeScript
  compiled to JS + `.d.ts`), following the same TDD/CI/semantic-release
  pattern as every prior plugin, with three research-driven corrections
  to the naive "same shape as Jest/Jasmine" assumption:
  - **`Case(this, caseKey, opts)` and `Attach(this, caseKey, data,
    filename, contentType)` take an explicit test-context handle** (the
    Mocha `Context` available as `this` inside a non-arrow `it()`/hook
    function body), matching Go's `Case(t, caseKey, opts)` shape rather
    than Jest's/Jasmine's implicit-global shape — confirmed via real
    research that Mocha has no equivalent to `expect.getState()` or
    `jasmine.getEnv()` accessible from arbitrary code outside `this`.
  - **JUnit XML is built directly by a custom `TestPulseReporter` class**
    (via Mocha's `Runner` event interface: `EVENT_TEST_PASS`/
    `EVENT_TEST_FAIL`/`EVENT_TEST_PENDING`/`EVENT_RUN_END`), with **no
    dependency on `mocha-junit-reporter`** — confirmed via its own
    README that it supports only testsuite-level `properties`, with no
    mechanism at all for per-testcase properties (the same gap that
    ruled out `jasmine-reporters` for the Jasmine plugin).
  - **A separate `testpulse-mocha check` CLI is the only thing that can
    fail the build**, reading a `.testpulse/result.json` marker the
    reporter writes — confirmed via a real, reproduced repro that a
    Mocha reporter cannot influence the process's own exit code (Mocha's
    own `exitMochaLater`/`exitMocha` in `lib/cli/run-helpers.js`
    overwrites `process.exitCode` regardless of what a reporter sets),
    the same hybrid architecture already proven for Jasmine and .NET.
- `--parallel` mode is explicitly documented as unsupported in v1 (not
  silently broken) — confirmed via reading Mocha's own
  `Test.prototype.serialize()` (`lib/test.js`) that worker→main IPC
  transmission uses a hardcoded field list with no room for custom
  properties, a structural limitation with no viable workaround, unlike
  Jasmine's `--parallel` incompatibility which turned out to be fixable.
- Attachments, config resolution, and the `.testpulse/` scratch
  directory match `testpulse-jasmine`'s shape exactly, including the
  prune-after-successful-submission behavior and the marker's optional
  `reason` field for missing-config diagnostics — both were found only
  post-implementation in Jasmine's review, applied here proactively from
  the start.
- `package.json` starts at `0.1.0` (not `1.0.0`), avoiding the
  version-collision mistake found in Jasmine's first release.
- Docs update: a new "Mocha: `testpulse-mocha`" section in
  `docs/importing-results.md`, following the pattern used for every
  prior plugin.

## Capabilities

### New Capabilities
- `mocha-import-plugin`: the `testpulse-mocha` package's observable
  contract — `Case`/`Attach`'s API and identification mechanism, the
  reporter's JUnit XML generation and auto-submission behavior, the
  `check` CLI's exit-code/config/dry-run behavior, and the documented
  `--parallel` limitation.

### Modified Capabilities
(none)

## Impact

- New standalone repo `Barayo/testpulse-mocha`; no changes to this
  monorepo's API surface, database, or UI.
- Docs: `docs/importing-results.md` (new section), `docs/README.md`
  (index line).
- No Sample-Project-showcase task: this is client-tooling published as
  its own repo, with no new API endpoint, UI, or seed-data surface
  inside TestPulse itself — same as every prior plugin change.
