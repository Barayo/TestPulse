## Why

As a JS/TS developer running Jest in CI, when I want to report results into
TestPulse, I want an installable package that gets `testpulse_case_key`
(and optional `testpulse_platform`/`testpulse_version`/`testpulse_tags`)
into a JUnit XML report and submits it, instead of hand-rolling a Jest
reporter and a `jest-junit` property hook myself. `add-execution-import`
(#38) shipped the import API; #58 tracked real plugins for every major
JUnit-XML ecosystem, split into #154 (pytest, shipped), #155 (npm/Jest,
this change), #156 (Maven, shipped), #157 (Gradle). Jest has no
`record_property()`-equivalent, so — like Maven's Surefire gap — this
needs its own mechanism, not a direct port of the pytest plugin's.

## What Changes

- New public repo `Barayo/testpulse-jest` (MIT license), published to npm.
- `testpulse(caseKey, opts?)`: wraps `test`/`it`, tagging a test with a
  case key (and optional platform/version/tags) without altering its
  visible title.
- `testpulseAttach(bufferOrPath, opts)`: registers a screenshot/file
  attachment for the currently-running `testpulse()`-wrapped test.
- `testpulse-jest/junitTestCaseProperties`: the module a project's
  `jest-junit` config points `testCasePropertiesFile` at, to inject
  `testpulse_case_key` etc. into `jest-junit`'s own JUnit XML output.
- A Jest reporter (`testpulse-jest`) that reads `jest-junit`'s output plus
  the case-key/attachment side-channel, and submits the report to
  `POST /api/v1/projects/{projectKey}/imports`, applying the same
  201/207/error → success/warn/hard-fail exit-code policy already shipped
  for `pytest-testpulse` and `testpulse-maven-plugin`.
- A `dryRun` reporter option previewing case-key matches via a read-only
  `GET /cases`, without submitting.
- `docs/importing-results.md` gains a "Jest: `testpulse-jest`" section,
  replacing the Jest half of the current "Gradle, Jest" stub.

## Capabilities

### New Capabilities
- `jest-import-plugin`: the `testpulse-jest` npm package's observable
  contract — the `testpulse()`/`testpulseAttach()` API, the
  `junitTestCaseProperties` hook's behavior, the reporter's submission and
  exit-code policy, and config resolution.

### Modified Capabilities
(none — this adds a new capability only; the import API itself, shipped by
`add-execution-import`, is unchanged)

## Impact

- New standalone repo/package, not this monorepo's code. No new API
  endpoints, no UI change, no seed data change (client-tooling change,
  Sample-Project-showcase task doesn't apply — see `tasks.md`).
- `docs/importing-results.md` and `docs/README.md` (index line) updated in
  this monorepo.
- Depends on the existing `POST /api/v1/projects/{projectKey}/imports`
  contract (`add-execution-import`, #38) — no changes to that contract
  required.
