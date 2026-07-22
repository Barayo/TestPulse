# Importing results

A CI pipeline can report real test results into TestPulse automatically,
without any manual UI interaction, by posting a JUnit XML report — the
format produced by pytest, Maven Surefire, Gradle, and Jest (via
`jest-junit`).

## The contract

```
POST /api/v1/projects/{projectKey}/imports
{ "format": "junit-xml", "name": "optional run name", "report": "<the XML>" }
```

Each `<testcase>` in the report is matched to an existing TestPulse case by
its **key** (see [Keys](test-management.md#keys)) — not its name, not a
separate identifier, the same short key (`LOGIN-42`) that already addresses
the case everywhere else. The import creates one run, with one item and one
result per matched test.

**Match-only — nothing is auto-created.** A `<testcase>` whose key doesn't
match any case in the project is never turned into a new case; it's simply
reported back as unmatched. This means the import call is never blocked by
an unrecognized test, but the case library is never silently modified by CI
either:

| Outcome | Status | Body |
|---|---|---|
| Every `<testcase>` matched | `201 Created` | The created `Run` |
| Some or all unmatched | `207 Multi-Status` | `{ run, message, matched, unmatched: [{ caseKey, verdict }] }` |
| Malformed report / unknown project | `400` / `404` | `{ "error": "..." }` |

A `207` is still a success from the point of view of any tool that checks
`response.ok` — the run was created with whatever did match. `unmatched`
lists every case key that didn't, so nothing is silently dropped.

The run's name defaults to the report's own `<testsuite name="...">` if
present, otherwise a generated `Imported run — <timestamp>`.

## Execution metadata

Beyond pass/fail, an imported result can carry:

- **`testName`** (on the run item) — the literal name the runner reported
  (e.g. a pytest node id), kept alongside the matched case's own title
  rather than replacing it.
- **`startTime`/`endTime`** (on the result) — derived from the report's own
  `<testsuite timestamp>` and each `<testcase time>` (duration). Only
  populated when the report includes a suite timestamp; never guessed.
- **`platform`, `version`, `tags`** (on the result) — read from the same
  `<properties>` mechanism as the case key.

These same fields are available on a manually-recorded result too (the
existing "record a verdict" UI action) — an import isn't a special path,
it's the same result shape produced automatically.

## Verdict mapping

| JUnit XML | TestPulse verdict |
|---|---|
| no failure/error/skipped child | `pass` |
| `<failure>` | `failed` |
| `<error>` | `blocked` |
| `<skipped>` | `skipped` |

## pytest: `conftest.py`

pytest has no built-in way to tag a test with an arbitrary case key, but its
`record_property()` + `--junitxml` combination is enough to carry one
through without a custom plugin. Add a marker and a fixture:

```python
# conftest.py
import pytest

def pytest_configure(config):
    config.addinivalue_line(
        "markers", "testpulse(case_key, platform=None, version=None, tags=None): "
                    "link this test to a TestPulse case for result import"
    )

@pytest.fixture(autouse=True)
def _testpulse_case_link(request, record_property):
    marker = request.node.get_closest_marker("testpulse")
    if marker is None:
        return
    case_key = marker.args[0] if marker.args else marker.kwargs.get("case_key")
    if case_key:
        record_property("testpulse_case_key", case_key)
    if marker.kwargs.get("platform"):
        record_property("testpulse_platform", marker.kwargs["platform"])
    if marker.kwargs.get("version"):
        record_property("testpulse_version", marker.kwargs["version"])
    if marker.kwargs.get("tags"):
        record_property("testpulse_tags", ",".join(marker.kwargs["tags"]))
```

Tag a test and run with `--junitxml`:

```python
@pytest.mark.testpulse("LOGIN-42", platform="linux", tags=["smoke"])
def test_login_succeeds():
    ...
```

```bash
pytest --junitxml=report.xml
curl -s -X POST http://localhost:8080/api/v1/projects/LOGIN/imports \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TESTPULSE_TOKEN" \
  -d "$(jq -n --rawfile report report.xml '{format: "junit-xml", report: $report}')"
```

A real pytest plugin (a thin convenience wrapper over the same mechanism) is
follow-on work — this snippet ships everything needed today with no new
package to install.

## Maven, Gradle, Jest

The importer accepts any JUnit XML, but `record_property()` is pytest-
specific — Surefire and Gradle don't have an equivalent for writing custom
`<properties>` out of the box. Wiring up the case key for those runners is
tracked as follow-on work per runner, not solved by this importer alone.
