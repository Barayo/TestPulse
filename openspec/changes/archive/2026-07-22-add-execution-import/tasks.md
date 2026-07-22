## 1. Contract first

- [x] 1.1 Add `testName` (optional) to the run-item-add schema; add `startTime`/`endTime`/`platform`/`version`/`tags` (all optional) to `NewResult`/`Result`
- [x] 1.2 Add `POST /api/v1/projects/{projectKey}/imports` to the OpenAPI contract: request `{ format, name?, report }`, responses `201`/`207`/`400` per design.md's table
- [x] 1.3 `make generate`, confirm no drift

## 2. Domain + store (TDD)

- [x] 2.1 Write failing store/domain tests: `RunItem.TestName` persists when adding an item; `Result`'s new metadata fields persist through `RecordResult` and appear in `ListResults`
- [x] 2.2 Add the fields to `domain.RunItem`/`domain.Result`/`domain.NewResult`, thread through store queries and the migration (amend existing migration file per pre-1.0 policy)
- [x] 2.3 Confirm green

## 3. JUnit XML parser (TDD)

- [x] 3.1 Write failing tests for a parser package: extracts each `<testcase>`'s case key (`testpulse_case_key` property), `testpulse_platform`/`testpulse_version`/`testpulse_tags` properties, and its own `name`/`classname`; maps outcome (none/`<failure>`/`<error>`/`<skipped>`) to a `Verdict`; derives start/end time from `<testsuite timestamp>` + `<testcase time>` when present, omits them otherwise; extracts the `<testsuite>` name; rejects malformed XML
- [x] 3.2 Implement using `encoding/xml` (stdlib, no new dependency)
- [x] 3.3 Confirm green

## 4. Import service + endpoint (TDD)

- [x] 4.1 Write failing service-layer tests: matches parsed tests against cases by `key` within the project; creates a run + items (with `testName`) + results (with whatever execution metadata the report supplied) only for matches; unmatched tests produce no case-library changes; whole operation is atomic (a mid-pipeline failure leaves nothing created)
- [x] 4.2 Write failing handler tests: `201` when fully matched, `207` with the documented body shape when partially/fully unmatched, `400` for malformed report or unknown project
- [x] 4.3 Implement the service method and HTTP handler
- [x] 4.4 Confirm green; run `make coverage-api`

## 5. Docs

- [x] 5.1 New docs page: how to import results, the `POST .../imports` contract, the match-only/no-auto-create behavior and why, and what execution metadata gets captured
- [x] 5.2 `conftest.py` snippet for pytest: custom marker → `record_property()` calls for case key + platform/version/tags + `--junitxml` usage instructions
- [x] 5.3 Update `docs/api.md`'s endpoint table

## 6. Verification

- [x] 6.1 `make lint`, `make test`, `make coverage-api` all green
- [x] 6.2 Manual end-to-end check against the compose stack: real pytest run with the `conftest.py` snippet, `--junitxml` output, import it, confirm results land on the right cases (with testName/platform/version visible) and unmatched ones are reported without side effects

## 7. Spec sync

- [x] 7.1 Confirm `openspec validate add-execution-import` passes
