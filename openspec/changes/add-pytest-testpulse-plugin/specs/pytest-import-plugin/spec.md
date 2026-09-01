## ADDED Requirements

### Requirement: Case linkage via marker
The plugin SHALL provide a `@pytest.mark.testpulse(case_key, platform=None,
version=None, tags=None)` marker. For each test carrying this marker, the
plugin SHALL write `testpulse_case_key`, and whichever of
`testpulse_platform`/`testpulse_version`/`testpulse_tags` were supplied, as
JUnit XML `<property>` entries via pytest's `record_property()`, matching
the property names the `execution-import` capability's importer already
reads.

#### Scenario: A marked test's case key is recorded as a property
- **WHEN** a test is decorated `@pytest.mark.testpulse("LOGIN-42")` and the
  suite runs with `--junitxml=report.xml`
- **THEN** `report.xml` contains a `<property name="testpulse_case_key"
  value="LOGIN-42"/>` under that test's `<testcase>`

#### Scenario: Optional metadata is recorded only when supplied
- **WHEN** a test is decorated
  `@pytest.mark.testpulse("LOGIN-42", platform="linux", tags=["smoke"])`
  (no `version`)
- **THEN** `report.xml` contains `testpulse_platform` and `testpulse_tags`
  properties for that test, and no `testpulse_version` property

#### Scenario: An unmarked test carries no TestPulse properties
- **WHEN** a test has no `@pytest.mark.testpulse` marker
- **THEN** its `<testcase>` entry in `report.xml` carries no
  `testpulse_case_key` property

### Requirement: Plugin requires pytest's own JUnit XML output
The plugin SHALL read the report from the path pytest's own `--junitxml`
writes, rather than generating JUnit XML itself. Once collection finishes,
if any collected test carries the `testpulse` marker or
`--testpulse-dry-run` was passed, the plugin SHALL fail fast — before any
test runs — if `--junitxml` was not also supplied, naming it as the
missing requirement. If the report file is missing or unreadable at
`pytest_sessionfinish` despite `--junitxml` having been supplied (e.g. an
interrupted run), the plugin SHALL treat this the same as a submission
error (see exit-code requirement below): it always fails the session, with
a message distinguishing a missing report from an API rejection.

#### Scenario: Missing --junitxml fails fast
- **WHEN** a suite using `@pytest.mark.testpulse` runs without
  `--junitxml`
- **THEN** pytest exits with a configuration error before any test runs,
  naming `--junitxml` as the missing requirement

#### Scenario: A suite with no marker and no dry-run needs no config
- **WHEN** a suite runs with `--junitxml` but no test uses
  `@pytest.mark.testpulse` and `--testpulse-dry-run` was not passed
- **THEN** the plugin performs no fail-fast check and no submission —
  none of `url`/`token`/`project` need to be configured

#### Scenario: Report file missing at session end fails the session
- **WHEN** `--junitxml=report.xml` was supplied and at least one test
  used the `testpulse` marker, but `report.xml` does not exist or is
  unreadable when the session finishes (e.g. the run was interrupted
  before pytest's own junitxml writer completed)
- **THEN** the pytest session exits with a failing status, and the
  printed error names the missing report file, not an API response

### Requirement: Configuration resolves CLI flag, then env var, then ini-option
For each of API base URL, API token, project key, and the
fail-on-unmatched toggle, the plugin SHALL resolve its value by checking,
in order: the corresponding CLI flag, then the corresponding environment
variable, then the corresponding pytest ini-option, using the first one
present.

| Setting | CLI flag | Env var | ini-option |
|---|---|---|---|
| API base URL | `--testpulse-url` | `TESTPULSE_URL` | `testpulse_url` |
| API token | `--testpulse-token` | `TESTPULSE_TOKEN` | `testpulse_token` |
| Project key | `--testpulse-project` | `TESTPULSE_PROJECT` | `testpulse_project` |
| Fail on unmatched | `--testpulse-fail-on-unmatched` / `--testpulse-no-fail-on-unmatched` | `TESTPULSE_FAIL_ON_UNMATCHED` | `testpulse_fail_on_unmatched` |

The fail-on-unmatched env var and ini-option SHALL be parsed
case-insensitively: `"1"`, `"true"`, or `"yes"` resolve to true; any other
value, including unset or empty, resolves to false. At the CLI tier,
`--testpulse-fail-on-unmatched` resolves to true and
`--testpulse-no-fail-on-unmatched` resolves to false; either one, if
passed, SHALL take precedence over the env var and ini-option regardless
of what they're set to.

Once collection finishes, if any collected test carries the `testpulse`
marker or `--testpulse-dry-run` was passed, the plugin SHALL fail fast —
before any test runs — if `url`, `token`, or `project` do not resolve from
any of their three config sources, naming which setting is missing.

#### Scenario: CLI flag overrides a conflicting env var
- **WHEN** `TESTPULSE_URL=https://a.example` is set in the environment and
  the suite runs with `--testpulse-url=https://b.example`
- **THEN** the plugin submits to `https://b.example`

#### Scenario: Env var overrides a conflicting ini-option
- **WHEN** `pytest.ini` sets `testpulse_url = https://a.example` and
  `TESTPULSE_URL=https://b.example` is set in the environment, with no CLI
  flag passed
- **THEN** the plugin submits to `https://b.example`

#### Scenario: ini-option is used when no flag or env var is present
- **WHEN** `pytest.ini` sets `testpulse_project = LOGIN` and neither
  `--testpulse-project` nor `TESTPULSE_PROJECT` is set
- **THEN** the plugin submits to project `LOGIN`

#### Scenario: --testpulse-no-fail-on-unmatched overrides an ini-set true
- **WHEN** `pytest.ini` sets `testpulse_fail_on_unmatched = true` and the
  suite runs with `--testpulse-no-fail-on-unmatched`
- **THEN** a `207` response leaves the session's exit status unaffected,
  as if fail-on-unmatched were off

#### Scenario: Fail-on-unmatched env var accepts common truthy strings
- **WHEN** `TESTPULSE_FAIL_ON_UNMATCHED=Yes` is set, with no CLI flag
- **THEN** a `207` response causes the session to exit with a failing
  status

#### Scenario: Missing required config fails fast, same as missing --junitxml
- **WHEN** a suite using `@pytest.mark.testpulse` runs with `--junitxml`
  but no source (flag, env var, or ini-option) supplies `token`
- **THEN** pytest exits with a configuration error before any test runs,
  naming the missing `token` setting and its three config sources

### Requirement: Submission outcome maps to pytest exit behavior
At `pytest_sessionfinish`, the plugin SHALL submit the JUnit XML report to
`POST /api/v1/projects/{projectKey}/imports` (per the `execution-import`
capability) and SHALL interpret the response as follows: a `201` response
SHALL leave the session's exit status unaffected and SHALL print a summary
of matched count and created run to stderr; a `207` response SHALL, by
default, leave the session's exit status unaffected while printing the
unmatched case keys and a pointer to the fail-on-unmatched setting to
stderr, and SHALL instead set the session to a failing exit status when
fail-on-unmatched is enabled; any other outcome (network failure,
authentication error, or a `4xx`/`5xx` response) SHALL unconditionally set
the session to a failing exit status, regardless of the fail-on-unmatched
setting.

#### Scenario: All tests matched
- **WHEN** every `<testcase>` in the submitted report matches an existing
  case and the API responds `201`
- **THEN** the pytest session's exit status reflects only the tests' own
  pass/fail results, and stderr shows the matched count and created run

#### Scenario: Some tests unmatched, default configuration
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and fail-on-unmatched is not enabled
- **THEN** the pytest session's exit status reflects only the tests' own
  pass/fail results, and stderr lists each unmatched case key alongside a
  message naming `--testpulse-fail-on-unmatched` as the way to make this a
  hard failure

#### Scenario: Some tests unmatched, fail-on-unmatched enabled
- **WHEN** the API responds `207` with one or more unmatched case keys,
  and fail-on-unmatched is enabled (by any of its three config sources)
- **THEN** the pytest session exits with a failing status, even if every
  individual test passed

#### Scenario: Submission error always fails the session
- **WHEN** the submission request fails outright (network error, `401`,
  `400`, or `5xx`), regardless of the fail-on-unmatched setting
- **THEN** the pytest session exits with a failing status

### Requirement: Dry-run previews matches without submitting
When invoked with `--testpulse-dry-run`, the plugin SHALL NOT call the
import endpoint. Instead it SHALL fetch existing case keys for the target
project via `GET /api/v1/projects/{projectKey}/cases` (paginating through
all pages), compute which annotated case keys would match or go
unmatched, and print that projection to stdout. Dry-run SHALL NOT create a
run and SHALL NOT affect the session's exit status regardless of the
projected outcome. If the cases fetch itself fails outright (network
error, authentication error, or a `4xx`/`5xx` response, including a
paginated fetch that fails partway through), the plugin SHALL fail the
session — a dry-run that could not compute its own preview SHALL NOT
report success by omission.

#### Scenario: Dry-run reports a projected match
- **WHEN** the suite runs with `--testpulse-dry-run` and every annotated
  case key exists in the target project
- **THEN** no request is made to the imports endpoint, and stdout reports
  that every annotated test would match, with no effect on the session's
  exit status

#### Scenario: Dry-run reports projected unmatched keys
- **WHEN** the suite runs with `--testpulse-dry-run` and one or more
  annotated case keys do not exist in the target project
- **THEN** no request is made to the imports endpoint, stdout lists which
  case keys would be unmatched, and the session's exit status is
  unaffected regardless of the fail-on-unmatched setting

#### Scenario: Dry-run's cases fetch fails
- **WHEN** the suite runs with `--testpulse-dry-run` and the `GET
  /api/v1/projects/{projectKey}/cases` request fails (network error, an
  expired token, or a `5xx` response), including on a page after the
  first
- **THEN** no projection is printed as if it succeeded, and the session
  exits with a failing status

### Requirement: Attachments are keyed to a test's own case
The plugin SHALL provide a `testpulse_attach(path_or_bytes, filename=None,
content_type=None)` fixture. A file registered through this fixture SHALL
be included in the import submission's attachments, keyed by the case key
from that same test's `@pytest.mark.testpulse` marker, per the
`run-result-attachments` capability's attachment shape. Calling this
fixture from a test with no `testpulse` marker SHALL NOT be submitted as
an attachment; the plugin SHALL instead emit a warning naming the test.

#### Scenario: An attachment rides with its test's matched case
- **WHEN** a test decorated `@pytest.mark.testpulse("LOGIN-42")` calls
  `testpulse_attach("failure.png")`
- **THEN** the import submission's `attachments` array includes an entry
  with `caseKey: "LOGIN-42"` for that file

#### Scenario: Attachment on an unmarked test is dropped with a warning
- **WHEN** a test with no `@pytest.mark.testpulse` marker calls
  `testpulse_attach("failure.png")`
- **THEN** the file is not included in any import submission, and a
  warning naming that test is printed

### Requirement: A 207's dropped attachments are named, not just implied
When the import response is `207` and one or more of the unmatched case
keys had an attachment included in the same submission (per the
attachment fixture above), the plugin SHALL name those dropped
attachments in its stderr output alongside the unmatched case keys,
distinguishing "case unmatched" from "case unmatched, and its attachment
was not saved."

#### Scenario: An unmatched test's attachment is called out by name
- **WHEN** a test decorated `@pytest.mark.testpulse("LOGIN-42")` calls
  `testpulse_attach("failure.png")`, and the API responds `207` with
  `LOGIN-42` listed as unmatched
- **THEN** the stderr summary lists `LOGIN-42` as unmatched and separately
  notes that its attachment was not saved
