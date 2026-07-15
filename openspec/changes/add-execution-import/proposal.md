## Why

Every result in TestPulse today gets there through the UI or a hand-rolled
API call — there's no way for a CI pipeline running an external test suite
(pytest, and eventually Maven/Gradle/Go/Jest) to report results
automatically. This is the first of several planned "importer" epics
(see backlog #34 for the deferred, much larger auto-create/bulk-inventory
variant of this idea, deliberately kept separate).

## What Changes

- `TestCase` gains an optional `externalId` field, settable via the
  existing create/update case API — no new endpoint needed for this part.
- A new bulk import endpoint accepts a JUnit XML report, matches each
  `<testcase>` to an existing TestPulse case by the external id carried in
  its `<properties>` block, and creates one run with items/results for
  every match.
- **Match-only, no auto-creation**: an unmatched test is never turned into
  a new case. The import still succeeds — it returns `207 Multi-Status`
  (not an error) with the created run plus a list of what didn't match, so
  a CI job is never blocked by an unmatched test, but nothing silent
  happens to the case library either.
- Documentation + a `conftest.py` snippet for pytest, using pytest's own
  built-in `record_property()` + `--junitxml` to carry the external id
  through — no custom pytest plugin required to ship this. A real plugin
  (thin convenience wrapper over the same mechanism) is separate,
  follow-on work once this lands.

## Capabilities

### New Capabilities

- `execution-import`: bulk JUnit-XML import, external-id matching, the
  partial-success (207) contract.

### Modified Capabilities

- `test-authoring`: the "Test case creation" requirement's schema gains
  the optional `externalId` field, settable at creation or later, the
  same way description/owner already work for projects.
- `test-execution`: run items gain an optional `testName` (the literal
  name an external runner reported); results gain optional execution
  metadata — start time, end time, platform, version, tags — available
  to both imports and the existing manual "record a verdict" action.

## Impact

- `apps/api/internal/domain/domain.go` — `CaseContent`/`TestCase` gains
  `ExternalID string` (optional).
- `packages/shared/openapi.yaml` — case create/update schemas gain
  `externalId`; new `POST /api/v1/projects/{projectId}/imports` endpoint.
- New JUnit-XML parser (Go stdlib `encoding/xml`, no new dependency).
- New service-layer import orchestration: match cases → create run → add
  items → record results, atomically.
- `docs/` — new import/CI-integration doc page, plus the pytest
  `conftest.py` snippet.
- No new auth model — reuses existing API tokens (agents are already
  first-class actors per the architecture).
