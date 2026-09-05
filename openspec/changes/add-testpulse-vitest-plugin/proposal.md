## Why

As a developer running Vitest (increasingly the default for new
Vite-based JS/TS projects, displacing Jest), when I want to report
results into TestPulse, I want a package that gets `testpulse_case_key`
(and optional `testpulse_platform`/`testpulse_version`/`testpulse_tags`)
into a JUnit XML report, instead of hand-rolling it. This is the last
of the seven JUnit-XML-producing-ecosystem importer plugins tracked
under #58 (after pytest, Maven/Gradle, Jest, Go, .NET, gtest, Jasmine,
and Mocha), and the fifth JS testing-framework plugin.

## What Changes

- New public repo `Barayo/testpulse-vitest` (MIT license, TypeScript
  compiled to JS + `.d.ts`), following the same TDD/CI/semantic-release
  pattern as every prior plugin, built on real, verified findings that
  turned out meaningfully different from — and simpler than — the
  issue's own "close enough to Jest's design" assumption:
  - **Vitest has a genuine, native, built-in test-annotation API**
    (`context.annotate(message, type, attachment?)`, confirmed via
    reading Vitest's own source) that its built-in `junit` reporter
    already writes as `<property name="{type}" value="{message}"/>`,
    and whose full data (including binary attachment payloads) is
    synchronously readable from a custom reporter via
    `testCase.annotations()` — confirmed via a real repro. **No
    scratch-directory side-channel is needed at all**, unlike every
    prior JS plugin (Jest's worker/main-process boundary, Jasmine's
    original `--parallel` incompatibility, Mocha's lack of an implicit
    global) — `Case`/`Attach` are thin wrappers over this native
    mechanism, and attachments use the exact same annotation channel
    rather than a separate scratch directory.
  - **Composing with the built-in `junit` reporter's file output is
    unsafe**, discovered via a real repro: its file write is
    asynchronous and races with other configured reporters' own hooks
    (the file existed but contained only the XML declaration when read
    from a subsequent reporter's `onTestRunEnd`, and was provably
    complete only after an artificial delay). `testpulse-vitest`
    therefore builds JUnit XML directly from `testCase.annotations()`
    and test results, the same "build it directly" resolution already
    proven for Jasmine/Mocha, rather than depending on that race.
  - **A separate `testpulse-vitest check` CLI is the only thing that
    can fail the build**, reading a `.testpulse/result.json` marker —
    the same hybrid architecture already proven for Jasmine and Mocha,
    kept here for consistency with those plugins and because relying
    on `process.exitCode` isn't part of Vitest's documented reporter
    contract. (An earlier repro claimed a reporter's `process.exitCode`
    assignment doesn't survive at all; that repro turned out to be
    invalidated by a shell-scripting bug — piping through `tail` before
    checking `$?` captures `tail`'s exit code, not the real one — and
    was corrected during implementation: the assignment does in fact
    survive on the versions tested. The architectural choice itself
    still stands on its own merits regardless of that correction.)
  - **`Case(context, caseKey, opts)`/`Attach(context, caseKey, data,
    filename, contentType)` take an explicit test-context handle**,
    matching Mocha's `Case(this, ...)` shape, since `annotate()` is
    only available via the test context parameter, not an implicit
    global.
- Attachments, config resolution, and the `.testpulse/` scratch
  directory (used only for the result marker now, not attachment
  storage) match `testpulse-jasmine`/`testpulse-mocha`'s shape,
  including their post-implementation fixes applied from the start:
  prune-after-successful-submission, the marker's `reason` field,
  content-type allowlist validation, credential-safe error logging,
  fixed boolean env-var parsing, and XML escaping on every written
  value.
- `package.json` starts at `0.1.0` (not `1.0.0`), avoiding the
  version-collision mistake found in Jasmine's first release.
- Docs update: a new "Vitest: `testpulse-vitest`" section in
  `docs/importing-results.md`, following the pattern used for every
  prior plugin.

## Capabilities

### New Capabilities
- `vitest-import-plugin`: the `testpulse-vitest` package's observable
  contract — `Case`/`Attach`'s API and identification mechanism (built
  on Vitest's own native `annotate()`), the reporter's direct JUnit XML
  generation and auto-submission behavior, and the `check` CLI's
  exit-code/config/dry-run behavior.

### Modified Capabilities
(none)

## Impact

- New standalone repo `Barayo/testpulse-vitest`; no changes to this
  monorepo's API surface, database, or UI.
- Docs: `docs/importing-results.md` (new section), `docs/README.md`
  (index line).
- No Sample-Project-showcase task: this is client-tooling published as
  its own repo, with no new API endpoint, UI, or seed-data surface
  inside TestPulse itself — same as every prior plugin change.
