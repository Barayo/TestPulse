## Why

As a Python developer running pytest in CI, when I want to report results
into TestPulse, I want to install a package instead of hand-maintaining the
`conftest.py` snippet documented in `docs/importing-results.md`.
`add-execution-import` (#38) shipped the `POST
/api/v1/projects/{projectKey}/imports` endpoint and deliberately deferred a
real pytest plugin to follow-on work (see that change's design.md
Non-Goals). Issue #58 tracked building installable plugins for all four
major JUnit-XML ecosystems as one item; it was split into four independent
issues so each could be scoped on its own — this change covers #154
(pytest) only.

## What Changes

- A new installable pytest plugin, `pytest-testpulse`, published as its own
  public GitHub repo (`Barayo/pytest-testpulse`, MIT license) — not part of
  this monorepo. This proposal's specs describe the plugin's observable
  contract; the plugin's own repo carries its implementation.
- The plugin registers `@pytest.mark.testpulse(case_key, platform=None,
  version=None, tags=None)`, using pytest's built-in `record_property()` to
  write the same `testpulse_case_key`/`testpulse_platform`/
  `testpulse_version`/`testpulse_tags` properties the import endpoint
  already reads — the same mechanism as today's `conftest.py` snippet,
  packaged and versioned instead of hand-copied.
- The plugin submits the report to the import endpoint itself
  (`pytest_sessionfinish`), removing the need for a separate curl/CI step.
- A `testpulse_attach()` fixture lets a test attach a screenshot/file, using
  the existing import-attachments contract (`run-result-attachments`).
- A `--testpulse-dry-run` flag previews matches via a read-only cases fetch,
  without ever calling the mutating import endpoint.
- `docs/importing-results.md` gains a section pointing pytest users at the
  plugin, keeping the existing `conftest.py` snippet as the documented
  no-install fallback.
- No Sample-Project-showcase task: this change adds a client-side tool with
  no new capability inside TestPulse itself (no new endpoint, no UI, no
  seed data) — `seed.go` is unaffected.

## Capabilities

### New Capabilities
- `pytest-import-plugin`: the pytest-testpulse plugin's observable
  contract — the `testpulse` marker and `testpulse_attach()` fixture, its
  config resolution (CLI flag > env var > pytest ini-option), how it
  interprets the import endpoint's `201`/`207`/error responses into pytest
  exit-code behavior, and its dry-run preview behavior.

### Modified Capabilities
- None. This change is a new consumer of the existing `execution-import`
  contract; it does not change that endpoint's requirements.

## Impact

- New repo `Barayo/pytest-testpulse` (out of scope for this monorepo's
  CI/build/deploy).
- `docs/importing-results.md`: add a plugin-install section.
- No changes to `packages/shared/openapi.yaml`, Go handlers, migrations, or
  the web UI — this change is entirely client tooling consuming the
  existing import/cases-list endpoints.
