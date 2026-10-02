## MODIFIED Requirements

### Requirement: create_test_run tool
The system SHALL provide a `create_test_run` MCP tool that creates a test run, pinning each included case to its latest version at creation time, enforcing the caller's project permissions. The tool MAY accept an optional `idempotencyKey`: if a prior successful call from the same caller supplied the same key, the tool SHALL return that prior result instead of creating a second run. The returned run SHALL identify its project by `projectKey`, not internal project ID, and SHALL NOT include a raw internal run ID.

#### Scenario: Create a run from selected cases
- **WHEN** an agent calls `create_test_run` with a project and a list of case keys
- **THEN** a new run is created with run items pinned to each case's current version

#### Scenario: A retried call with the same idempotency key returns the original run
- **WHEN** an agent calls `create_test_run` with `idempotencyKey: "k1"`, then calls it again with the same `idempotencyKey: "k1"`
- **THEN** the second call returns the same run created by the first call, and no second run is created

#### Scenario: Returned run identifies its project by key, not internal ID
- **WHEN** an agent calls `create_test_run` to create a run
- **THEN** the returned record includes `projectKey` and does not include a raw internal run ID or project ID

### Requirement: get_details tool
The system SHALL provide a `get_details` MCP tool that fetches the full record for a single entity given an explicit `entityType` and `key`, routing to the appropriate lookup for that type. For every entity type it can return, the record SHALL identify related entities by key, not internal ID, matching the output shape the corresponding dedicated tool (`upsert_test_case`, `upsert_test_suite`, `upsert_step_group`, `create_test_run`) returns for that same entity type.

#### Scenario: Fetch an existing case by key
- **WHEN** an agent calls `get_details` with `entityType: "case"` and a valid case key
- **THEN** the full case record is returned

#### Scenario: Fetched run identifies its project by key, not internal ID
- **WHEN** an agent calls `get_details` with `entityType: "run"` and a valid run key
- **THEN** the returned record includes `projectKey` and does not include a raw internal run ID or project ID, the same shape `create_test_run` returns
