## Why

As a developer running Jasmine (e.g. in a legacy Angular codebase), when
I want to report results into TestPulse, I want a package that gets
`testpulse_case_key` (and optional
`testpulse_platform`/`testpulse_version`/`testpulse_tags`) into a JUnit
XML report, instead of hand-rolling it.

`add-execution-import` (#38) shipped a JUnit-XML-based import endpoint;
issue #58 tracked installable plugins for the major JUnit-XML-producing
ecosystems, split into #154 (pytest, shipped), #155 (Jest, shipped),
#156 (Maven, shipped), #157 (Gradle, shipped), #169 (Go, shipped), #170
(.NET, shipped), #171 (gtest, shipped), #165 (Jasmine, this change).
Jasmine has a real, first-party, documented mechanism for this —
`jasmine.getEnv().setSpecProperty(key, value)` (since v3.6.0), designed
specifically to attach custom properties to a running spec that get
exposed to reporters — confirmed by reading Jasmine's own source
(`Env.js`); the issue's own guess (`jasmine-reporters`' `JUnitXmlReporter`)
has no property-injection support at all, also confirmed by reading its
source.

## What Changes

- New public repo `Barayo/testpulse-jasmine` (MIT license), TypeScript
  compiled to JS + `.d.ts`, published to npm via Trusted Publishing
  (OIDC).
- `testpulse.Case(caseKey, opts?)` tags the currently-running spec via
  `jasmine.getEnv().setSpecProperty()`.
- `testpulse.Attach(caseKey, data, filename, contentType)` for
  screenshot/file attachments, verified via
  `jasmine.getEnv().getSpecProperty()` (native readback, no custom
  allowlist map needed) against the case key the running spec itself
  declared.
- A custom Jasmine reporter (registered via a `helpers` file entry —
  Jasmine's real mechanism for this) that builds JUnit XML directly from
  `specDone`'s `result.properties` (no dependency on `jasmine-reporters`)
  and auto-submits in `jasmineDone`, writing a `.testpulse/result.json`
  marker.
- A `testpulse-jasmine check` CLI that reads that marker and exits
  non-zero if needed — Jasmine's own CLI always calls
  `process.exit(explicitCode)` based purely on test pass/fail, confirmed
  via `jasmine-npm`'s source, so a reporter alone cannot fail the build
  for an unmatched-case or submission-error outcome. CI usage:
  `jasmine && testpulse-jasmine check`.
- This monorepo's `docs/importing-results.md` gains a "Jasmine:
  `testpulse-jasmine`" section.

## Capabilities

### New Capabilities
- `jasmine-import-plugin`: The `testpulse-jasmine` plugin's observable
  contract — the `Case`/`Attach` API's role and identification mechanism,
  the auto-wired annotate/submit reporter's behavior, the `check` CLI's
  exit-code role, config resolution, and dry-run behavior.

### Modified Capabilities
(none — this is a new, standalone capability; `execution-import`'s own
contract is unchanged)

## Impact

- New standalone public repo (`Barayo/testpulse-jasmine`), not part of
  this monorepo's build or deploy surface.
- `docs/importing-results.md` and `docs/README.md` (index line) in this
  monorepo.
- No changes to `packages/shared/openapi.yaml`, no new API endpoints, no
  UI, no seed data — client-tooling only, consuming the existing
  `execution-import` contract as-is.
