# mcp-server

## Purpose

An MCP (Model Context Protocol) server exposing TestPulse's domain
operations — test cases, suites, runs, results, search — as tools for AI
agents, authenticated via the existing scoped API token model. TestPulse's
stated core differentiator: an agent manages tests over MCP instead of
hand-rolling REST calls.

## Requirements

### Requirement: MCP server availability
The system SHALL expose an MCP (Model Context Protocol) server over Streamable HTTP at `/mcp`, hosted in the same binary as the REST API, controlled by the `TESTPULSE_MCP_ENABLED` environment variable (default `true`).

#### Scenario: MCP mount enabled by default
- **WHEN** the API starts without `TESTPULSE_MCP_ENABLED` set
- **THEN** the `/mcp` endpoint accepts MCP protocol connections

#### Scenario: MCP mount disabled by config
- **WHEN** the API starts with `TESTPULSE_MCP_ENABLED=false`
- **THEN** the `/mcp` endpoint is not mounted and returns 404 for any request

### Requirement: MCP authentication
The system SHALL authenticate MCP connections using the same `Authorization: Bearer <token>` scheme and `AuthenticateToken` resolution as the REST API, supporting both project-scoped and unscoped tokens, with no separate auth mode for MCP.

#### Scenario: Valid scoped token authenticates
- **WHEN** an MCP client connects with a valid project-scoped API token
- **THEN** the connection is authenticated as an agent Actor limited to that project's scoped permissions

#### Scenario: Valid unscoped token authenticates across projects
- **WHEN** an MCP client connects with a valid unscoped API token
- **THEN** the connection is authenticated as an agent Actor able to act on any project the token creator can access

#### Scenario: Missing or invalid token rejected
- **WHEN** an MCP client connects without a bearer token or with an invalid/expired token
- **THEN** the connection is rejected the same way an equivalent REST request would be rejected

### Requirement: upsert_test_case tool
The system SHALL provide an `upsert_test_case` MCP tool that creates a new test case or edits an existing one (by key), producing a new immutable version on edit, enforcing the caller's project permissions. A step entry in the tool's `steps` input MAY reference an existing step group by key instead of supplying its own `action`/`expected` content; the tool SHALL resolve such entries server-side against the referenced step group's current content, via the same resolution path used by the REST case-write routes, and SHALL NOT accept pre-resolved step content for a group-reference entry from the caller.

#### Scenario: Create a new case
- **WHEN** an agent calls `upsert_test_case` with no existing case key and valid fields
- **THEN** a new test case is created and its key and version are returned

#### Scenario: Edit rejected without permission
- **WHEN** an agent calls `upsert_test_case` for a project it does not have write access to
- **THEN** the tool call fails with a permission error and no case is modified

#### Scenario: A step entry can reference a shared step group by key
- **WHEN** an agent calls `upsert_test_case` with a step entry referencing an existing step group's key instead of its own action/expected content
- **THEN** the created or edited case version's step content includes that step group's full current step sequence at that position

### Requirement: upsert_step_group tool
The system SHALL provide an `upsert_step_group` MCP tool that creates a new project-scoped step group or edits an existing one (by key), enforcing the caller's `manageProject` permission on the target project.

#### Scenario: Create a new step group
- **WHEN** an agent with `manageProject` permission on a project calls `upsert_step_group` with no existing group key and a name plus one or more steps
- **THEN** a new step group is created under that project and its key is returned

#### Scenario: Edit an existing step group by key
- **WHEN** an agent with `manageProject` permission calls `upsert_step_group` with an existing group's key and updated steps
- **THEN** that step group's content is updated in place, not duplicated

#### Scenario: Rejected without manageProject permission
- **WHEN** an agent without `manageProject` permission on a project calls `upsert_step_group` for that project
- **THEN** the tool call fails with a permission error and no step group is created or modified

### Requirement: upsert_test_suite tool
The system SHALL provide an `upsert_test_suite` MCP tool that creates a new test suite or renames/edits an existing one (by key), enforcing the caller's project permissions.

#### Scenario: Create a new suite
- **WHEN** an agent calls `upsert_test_suite` with no existing suite key and valid fields
- **THEN** a new test suite is created and its key is returned

### Requirement: bulk_add_cases tool
The system SHALL provide a `bulk_add_cases` MCP tool that creates multiple test cases in one call as a single atomic transaction: if any case in the batch is invalid, no case in the batch is created.

#### Scenario: All cases valid
- **WHEN** an agent calls `bulk_add_cases` with a batch of valid cases
- **THEN** all cases are created and their keys are returned

#### Scenario: One case invalid rolls back the whole batch
- **WHEN** an agent calls `bulk_add_cases` with a batch where one case has an invalid field
- **THEN** no case in the batch is created and the error identifies the specific failing case and field

### Requirement: create_test_run tool
The system SHALL provide a `create_test_run` MCP tool that creates a test run, pinning each included case to its latest version at creation time, enforcing the caller's project permissions.

#### Scenario: Create a run from selected cases
- **WHEN** an agent calls `create_test_run` with a project and a list of case keys
- **THEN** a new run is created with run items pinned to each case's current version

### Requirement: record_result tool
The system SHALL provide a `record_result` MCP tool that appends a result entry (verdict, comment, actor) to a run item's append-only result log, enforcing assignee/permission restrictions identical to REST.

#### Scenario: Record a passing result
- **WHEN** an agent calls `record_result` for a run item it is permitted to act on, with verdict `pass`
- **THEN** a new result log entry is appended recording the agent as actor, and the run item's current status updates to `pass`

#### Scenario: Recording blocked for unauthorized item
- **WHEN** an agent calls `record_result` for a run item outside its scoped permissions
- **THEN** the tool call fails with a permission error and no result entry is appended

### Requirement: update_run_item_status tool
The system SHALL provide an `update_run_item_status` MCP tool that updates a run item's status (e.g. requesting `retest`, marking `blocked`) independent of recording a verdict-bearing result.

#### Scenario: Request a retest
- **WHEN** an agent calls `update_run_item_status` with status `retest` for a completed run item it can act on
- **THEN** the run item's current status becomes `retest`

### Requirement: search tool
The system SHALL provide a `search` MCP tool performing cross-entity full-text search over test cases, test suites, test runs, projects, releases, and test plans, backed by a Postgres `tsvector`+GIN index, returning only entities the caller's Actor has permission to see.

#### Scenario: Search returns matches across entity types
- **WHEN** an agent calls `search` with a query term matching both a test case title and a project name
- **THEN** results include both the matching case and the matching project, ranked by relevance

#### Scenario: Search respects project scoping
- **WHEN** an agent with a project-scoped token calls `search` with a term matching entities in other projects
- **THEN** only matches within the token's scoped project are returned

### Requirement: get_details tool
The system SHALL provide a `get_details` MCP tool that fetches the full record for a single entity given an explicit `entityType` and `key`, routing to the appropriate lookup for that type.

#### Scenario: Fetch an existing case by key
- **WHEN** an agent calls `get_details` with `entityType: "case"` and a valid case key
- **THEN** the full case record is returned

#### Scenario: Type/key mismatch reported clearly
- **WHEN** an agent calls `get_details` with `entityType: "run"` and a key belonging to a suite
- **THEN** the tool call fails with an error indicating the key does not match the requested entity type

### Requirement: get_run_progress tool
The system SHALL provide a `get_run_progress` MCP tool returning a run's status summary (counts per status, pass rate), enforcing the caller's project permissions.

#### Scenario: Fetch progress for an in-progress run
- **WHEN** an agent calls `get_run_progress` for a run it can view
- **THEN** the current per-status counts and pass rate are returned

### Requirement: list_projects tool
The system SHALL provide a `list_projects` MCP tool listing projects visible to the caller's Actor, matching REST's project-listing visibility rules.

#### Scenario: Unscoped token lists all accessible projects
- **WHEN** an agent with an unscoped token calls `list_projects`
- **THEN** all projects the token creator can access are returned

#### Scenario: Scoped token lists only its project
- **WHEN** an agent with a project-scoped token calls `list_projects`
- **THEN** only that single scoped project is returned

### Requirement: No delete operations via MCP
The system SHALL NOT expose any delete/removal operation through MCP tools in v0.1; deletions remain REST-only.

#### Scenario: No delete tool is registered
- **WHEN** an MCP client lists available tools
- **THEN** no tool in the list performs a delete or removal operation
