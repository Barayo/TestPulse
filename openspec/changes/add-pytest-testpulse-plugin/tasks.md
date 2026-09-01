## 1. Repo scaffolding

- [x] 1.1 Create the public repo `Barayo/pytest-testpulse` (MIT license, `pyproject.toml` with a `pytest11` entry point, `src/pytest_testpulse/` package layout)
- [x] 1.2 Add `pytester_example_dir`/`pytest_plugins = ["pytester"]` test scaffolding and a `responses`/`httpretty` dev dependency for HTTP mocking
- [x] 1.3 Add GitHub Actions workflow: build+test matrix (Python 3.9–3.13 × two recent pytest majors) on every PR

## 2. Marker registration and property injection (test-first)

- [x] 2.1 Write a failing `pytester`-based test asserting `@pytest.mark.testpulse("LOGIN-42")` on a test produces a `testpulse_case_key` property in the `--junitxml` output
- [x] 2.2 Implement `pytest_configure` marker registration and the autouse fixture calling `record_property()` for `case_key` to pass that test
- [x] 2.3 Write failing tests for optional `platform`/`version`/`tags` being written only when supplied, and for an unmarked test carrying no TestPulse properties; implement until green
- [x] 2.4 Write a failing test asserting a suite using the marker without `--junitxml` fails fast during collection with a clear error; implement the `pytest_configure` check until green
- [x] 2.5 Write a failing test asserting a suite with `--junitxml` but no marked test and no `--testpulse-dry-run` requires no config and performs no submission; write a failing test asserting the report file being missing/unreadable at `pytest_sessionfinish` (despite `--junitxml` being passed) fails the session with a message naming the missing file, not an API error; implement both checks until green

## 3. Config resolution (test-first)

- [x] 3.1 Write failing tests for each of the four settings (url, token, project, fail-on-unmatched) covering: CLI flag alone, env var alone, ini-option alone, CLI-over-env precedence, env-over-ini precedence
- [x] 3.2 Implement `addoption`/`addini` declarations and a shared resolver function; make all tests from 3.1 pass
- [x] 3.3 Write failing tests for fail-on-unmatched's boolean parsing: `TESTPULSE_FAIL_ON_UNMATCHED` (and the ini-option) accepting case-insensitive `1`/`true`/`yes` as true and anything else as false; implement the parsing until green
- [x] 3.4 Write a failing test asserting `--testpulse-no-fail-on-unmatched` overrides an ini-option/env-var `true` back to false; implement the paired flag and its precedence until green
- [x] 3.5 Write a failing test asserting a marked-test suite with `--junitxml` but no `url`/`token`/`project` from any source fails fast during collection, naming the missing setting; implement the check (extending 2.4/2.5's fail-fast) until green

## 4. Submission and exit-code behavior (test-first)

- [x] 4.1 Write a failing test: mock a `201` response from the import endpoint, assert the session's exit status is untouched and stderr contains the matched-count summary
- [x] 4.2 Write a failing test: mock a `207` response, default config, assert exit status is untouched and stderr lists unmatched case keys plus the `--testpulse-fail-on-unmatched` pointer
- [x] 4.3 Write a failing test: mock a `207` response with `--testpulse-fail-on-unmatched` set, assert the session exits with a failing status
- [x] 4.4 Write a failing test: mock a network error and separately a `401`/`400`/`5xx` response, assert the session always exits with a failing status regardless of fail-on-unmatched
- [x] 4.5 Implement the `pytest_sessionfinish` hook (read the `--junitxml` file, POST to `/api/v1/projects/{projectKey}/imports`, branch on response per the table in design.md) until all of 4.1–4.4 pass

## 5. Dry-run (test-first)

- [ ] 5.1 Write a failing test: with `--testpulse-dry-run`, mock `GET /api/v1/projects/{projectKey}/cases` returning the project's cases as a flat JSON array (per `listCases` in openapi.yaml — this endpoint is not paginated) and assert no request is made to the imports endpoint, stdout reports the projected match, and exit status is unaffected
- [ ] 5.2 Write a failing test: same as 5.1 but with some annotated case keys absent from the fetched cases, assert stdout lists the projected-unmatched keys with exit status still unaffected
- [ ] 5.3 Write a failing test: mock the cases fetch failing outright (network error, and separately a `401`/`5xx`), assert no success-shaped projection is printed and the session exits with a failing status
- [ ] 5.4 Implement the dry-run path (cases fetch, client-side diff, projection output, fetch-failure handling) until 5.1–5.3 pass

## 6. Attachment fixture (test-first)

- [ ] 6.1 Write a failing test: a marked test calls `testpulse_attach("failure.png")`, assert the submitted `attachments` array contains an entry keyed by that test's case key
- [ ] 6.2 Write a failing test: an unmarked test calls `testpulse_attach(...)`, assert no attachment is submitted and a warning naming the test is printed
- [ ] 6.3 Implement the `testpulse_attach` fixture and attachment-collection wiring into the submission payload until 6.1–6.2 pass
- [ ] 6.4 Write a failing test: a marked test with an attachment has its case key come back in a `207` response's unmatched list, assert the stderr summary names that case's attachment as not saved, distinct from the plain unmatched-case listing; implement the cross-reference until green

## 7. Release automation

- [ ] 7.1 Configure `python-semantic-release` and a PyPI trusted-publishing (OIDC) release workflow triggered on merge to `main`
- [ ] 7.2 Write README (install, marker API, config-precedence table, dry-run, exit-code table) and CONTRIBUTING (pytester-based test setup)

## 8. TestPulse monorepo docs update

- [ ] 8.1 Add a "pytest-testpulse plugin" section to `docs/importing-results.md` pointing pytest users at the new package, keeping the existing `conftest.py` snippet documented as the no-install fallback
