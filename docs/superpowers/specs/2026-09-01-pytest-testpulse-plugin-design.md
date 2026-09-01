# pytest-testpulse plugin — design

## Context

`add-execution-import` (#38, archived 2026-07-22) shipped
`POST /api/v1/projects/{projectKey}/imports`: a JUnit-XML importer that
matches each `<testcase>` to an existing case by its `key`, carried via a
`testpulse_case_key` `<property>`. For pytest, that change deliberately
shipped V1 as documentation only — a `conftest.py` snippet
(`docs/importing-results.md`) using pytest's built-in `record_property()` +
`--junitxml`, no package to install.

Issue #58 tracked building real, installable plugins for all four major
JUnit-XML-producing ecosystems (pytest, npm/Jest, Maven, Gradle) as one
tracking issue. It was split into four independent issues so each could be
scoped and built on its own: #154 (pytest), #155 (npm/Jest), #156 (Maven),
#157 (Gradle). This document scopes **#154 only** — the pytest plugin,
`pytest-testpulse`.

## Goals / Non-Goals

**Goals:**
- Installing `pytest-testpulse` replaces hand-maintaining the `conftest.py`
  snippet — same underlying mechanism (marker → `record_property()` →
  pytest's own `--junitxml` writer), packaged and versioned.
- The plugin also submits the resulting report to the import endpoint
  itself (`pytest_sessionfinish`), so a CI job needs no separate
  curl/script step.
- Config (API URL, token, project key) resolves the same way regardless of
  how a team wires up CI: CLI flag, env var, or project config file.

**Non-Goals (v1):**
- Generating JUnit XML itself — the plugin still requires `--junitxml`;
  it reads the file pytest's own (heavily-tested, stdlib-adjacent)
  junitxml plugin already wrote, rather than reimplementing that writer.
- A match-rate ratchet ("fail if match rate *drops* between runs") —
  useful for mid-migration teams, flagged by review as a good v2
  candidate, out of scope here.
- npm/Jest, Maven, Gradle — separate issues (#155, #156, #157), separate
  design passes when picked up.

## Decisions

### Repo & packaging
New public repo `Barayo/pytest-testpulse`, MIT license (deliberately more
permissive than TestPulse core's AGPL-3.0 — same pattern the parent issue
established for all four plugins: client SDKs/plugins vs. the server they
talk to). Standard pytest plugin packaging (`pytest11` entry point).

### Marker & fixtures
- `pytest_configure` registers `@pytest.mark.testpulse(case_key,
  platform=None, version=None, tags=None)` and fails fast at startup if
  `--junitxml` wasn't also passed — there's nothing to read at session end
  otherwise.
- An autouse fixture reads the closest `testpulse` marker per test and
  calls `record_property()` for `testpulse_case_key` /
  `testpulse_platform` / `testpulse_version` / `testpulse_tags` — the same
  four properties the API already reads (`docs/importing-results.md`).
  This is a direct, tested port of today's `conftest.py` snippet.
- `testpulse_attach(path_or_bytes, filename=None, content_type=None)`
  fixture: a test calls it explicitly to register a file for its own node.
  At session finish, each recorded attachment resolves to that node's case
  key (from its `testpulse` marker) and rides in the same submission's
  `attachments` array (`docs/importing-results.md`'s attachment shape).
  **Calling it on a test with no `testpulse` marker warns and drops the
  attachment** — there's no case key to attach it to, and silently
  submitting an attachment under a guessed key would be worse than
  dropping it with a visible warning.

### Config: CLI flag > env var > ini-option
Standard pytest config resolution (`parser.addini`, read via
`pyproject.toml`'s `[tool.pytest.ini_options]` or `pytest.ini`), not a
bespoke config file:

| Setting | CLI flag | Env var | ini-option |
|---|---|---|---|
| API base URL | `--testpulse-url` | `TESTPULSE_URL` | `testpulse_url` |
| API token | `--testpulse-token` | `TESTPULSE_TOKEN` | `testpulse_token` |
| Project key | `--testpulse-project` | `TESTPULSE_PROJECT` | `testpulse_project` |
| Fail on unmatched | `--testpulse-fail-on-unmatched` | `TESTPULSE_FAIL_ON_UNMATCHED` | `testpulse_fail_on_unmatched` |

`TESTPULSE_URL`/`TESTPULSE_TOKEN` reuse the exact env var names already
used in `docs/importing-results.md`'s curl example, so a team migrating
from the raw snippet to the plugin doesn't rename its CI secrets.
Docs will note tokens belong in env vars/CI secrets, not committed
ini-options.

`--testpulse-dry-run` (no env/ini equivalent — a local, one-off override,
not a durable CI setting) builds the request it would have submitted, then
projects a match preview via a **read-only** `GET
/api/v1/projects/{projectKey}/cases` (paginated as needed) to fetch
existing case keys and diff them against the annotated ones client-side —
it never calls the (mutating) import endpoint, so no run is ever created.
Still needs `url`/`token`/`project` to authenticate that read. Never
affects exit code.

### Submission outcome → pytest exit code

| API response | Default behavior |
|---|---|
| `201` all matched | success; stderr prints `testpulse: 42/42 matched, run TD-RUN-118 created` |
| `207` some unmatched | **warning, not failure** — `session.exitstatus` untouched; stderr prints match counts, the unmatched `nodeid`/case-key list, and a line pointing at `--testpulse-fail-on-unmatched` as the escalation path. `--testpulse-fail-on-unmatched` flips this to a hard failure. |
| network/auth/4xx/5xx error | **always fails** the session, unconditionally — no suppression flag. A broken submission is never something CI should silently swallow, unlike an incomplete annotation rollout. |

This was the one decision genuinely debated during design (see rationale
below) — resolved by consulting both a Senior-QA-persona review and Pepe
(TestPulse's design persona, applied here to plugin DX rather than visual
UI), who independently reached the same verdict:

- **The API's own contract already treats 207 as success**
  (`execution-import` spec: "SHALL NOT fail the import because some or all
  tests are unmatched"; `openapi.yaml`'s 207 description: "Import
  succeeded but one or more tests had no matching case"). A plugin that
  hard-fails on 207 by default contradicts the layer beneath it.
- **Day one of any real rollout is "most tests unannotated."** Defaulting
  to fail turns the first CI run red over an onboarding chore unrelated to
  whether the tests themselves pass — the fastest way to get a check
  disabled or the plugin uninstalled before it earns trust.
- **The actual risk is a warning nobody reads, not the wrong exit code** —
  solved by making the stderr output loud and self-documenting (it names
  its own escalation flag), not by breaking the build. Symmetric
  success-path output (one line on 201 too) avoids "did anything happen?"
  confusion in the good case as well.

### Testing approach (TDD)
pytest's own `pytester` fixture — the standard mechanism for testing
pytest plugins, spinning up isolated pytest runs against synthetic test
files — drives every scenario: marker registration, property injection,
submission payload construction, each row of the exit-code table above,
dry-run output (including its unmatched-preview), and config precedence.
HTTP mocked (`responses` or `httpretty`); no real network in the suite.
Red-green-refactor, per the project's standing TDD rule: e.g. the test
asserting session exit status stays 0 on a 207 is written before that
branch exists.

### CI / publishing
- GitHub Actions: build+test matrix (Python 3.9–3.13 × a couple of recent
  pytest majors) on every PR.
- Release: `python-semantic-release` on merge to `main`, publishing to
  PyPI via [trusted publishing](https://docs.pypi.org/trusted-publishers/)
  (OIDC — no long-lived PyPI token stored as a repo secret).
- README: install, marker API, the config-precedence table, dry-run, and
  the exit-code table above. CONTRIBUTING: `pytester`-based test setup.

## Risks / Trade-offs

- **Requiring `--junitxml` is one extra flag a user must remember**,
  versus a plugin that silently wires it up itself — accepted deliberately
  (see prior design discussion in the brainstorming session) to keep the
  plugin's only responsibility "wrap the marker mechanism and submit,"
  with zero XML-generation code to maintain or diverge from pytest's own.
- **Warn-by-default on 207 means a team can adopt the plugin and never
  finish annotating** without the CI signal ever forcing the issue. Same
  trade-off the API itself already made; mitigated by the self-documenting
  warning output pointing at `--testpulse-fail-on-unmatched`, and flagged
  by review as a natural fit for a future match-rate-ratchet mode rather
  than solved by flipping the default here.

## Open Questions

None outstanding.
