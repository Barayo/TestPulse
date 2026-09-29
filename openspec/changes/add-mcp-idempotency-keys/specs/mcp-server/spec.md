## MODIFIED Requirements

### Requirement: upsert_test_case tool
The system SHALL provide an `upsert_test_case` MCP tool that creates a new test case or edits an existing one (by key), producing a new immutable version on edit, enforcing the caller's project permissions. A step entry in the tool's `steps` input MAY reference an existing step group by key instead of supplying its own `action`/`expected` content; the tool SHALL resolve such entries server-side against the referenced step group's current content, via the same resolution path used by the REST case-write routes, and SHALL NOT accept pre-resolved step content for a group-reference entry from the caller. The create path (no existing case key supplied) MAY accept an optional `idempotencyKey`: if a prior successful create call from the same caller supplied the same key, the tool SHALL return that prior result instead of creating a second case.

#### Scenario: Create a new case
- **WHEN** an agent calls `upsert_test_case` with no existing case key and valid fields
- **THEN** a new test case is created and its key and version are returned

#### Scenario: Edit rejected without permission
- **WHEN** an agent calls `upsert_test_case` for a project it does not have write access to
- **THEN** the tool call fails with a permission error and no case is modified

#### Scenario: A step entry can reference a shared step group by key
- **WHEN** an agent calls `upsert_test_case` with a step entry referencing an existing step group's key instead of its own action/expected content
- **THEN** the created or edited case version's step content includes that step group's full current step sequence at that position

#### Scenario: A retried create with the same idempotency key returns the original case
- **WHEN** an agent calls `upsert_test_case` to create a case with `idempotencyKey: "k1"`, then calls it again with no existing case key and the same `idempotencyKey: "k1"`
- **THEN** the second call returns the same case created by the first call, and no second case is created

#### Scenario: A failed create is always safe to retry with the same key
- **WHEN** an agent calls `upsert_test_case` with an `idempotencyKey` and invalid fields, and the call fails validation
- **THEN** retrying with the same `idempotencyKey` and corrected fields creates the case normally, unaffected by the earlier failure

### Requirement: bulk_add_cases tool
The system SHALL provide a `bulk_add_cases` MCP tool that creates multiple test cases in one call as a single atomic transaction: if any case in the batch is invalid, no case in the batch is created. The tool MAY accept an optional `idempotencyKey`: if a prior successful call from the same caller supplied the same key, the tool SHALL return that prior result instead of creating a second batch.

#### Scenario: All cases valid
- **WHEN** an agent calls `bulk_add_cases` with a batch of valid cases
- **THEN** all cases are created and their keys are returned

#### Scenario: One case invalid rolls back the whole batch
- **WHEN** an agent calls `bulk_add_cases` with a batch where one case has an invalid field
- **THEN** no case in the batch is created and the error identifies the specific failing case and field

#### Scenario: A retried call with the same idempotency key returns the original batch
- **WHEN** an agent calls `bulk_add_cases` with `idempotencyKey: "k1"`, then calls it again with the same `idempotencyKey: "k1"`
- **THEN** the second call returns the same cases created by the first call, and no second batch is created

### Requirement: create_test_run tool
The system SHALL provide a `create_test_run` MCP tool that creates a test run, pinning each included case to its latest version at creation time, enforcing the caller's project permissions. The tool MAY accept an optional `idempotencyKey`: if a prior successful call from the same caller supplied the same key, the tool SHALL return that prior result instead of creating a second run.

#### Scenario: Create a run from selected cases
- **WHEN** an agent calls `create_test_run` with a project and a list of case keys
- **THEN** a new run is created with run items pinned to each case's current version

#### Scenario: A retried call with the same idempotency key returns the original run
- **WHEN** an agent calls `create_test_run` with `idempotencyKey: "k1"`, then calls it again with the same `idempotencyKey: "k1"`
- **THEN** the second call returns the same run created by the first call, and no second run is created
