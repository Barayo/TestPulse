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

### Requirement: Human-readable MCP tool result text
Every MCP tool SHALL include a short, human-readable, one-sentence summary of its result in the tool call response's text content, in addition to the structured result the calling model parses programmatically. This summary SHALL be built only from values already resolved while handling the call, without any additional lookup.

#### Scenario: A create tool's result includes a readable summary
- **WHEN** an agent calls `upsert_test_case` to create a new case
- **THEN** the tool call response's text content includes a sentence naming the created case's key and title, and the structured result still includes the full case record

#### Scenario: A batch tool's result includes a readable summary
- **WHEN** an agent calls `bulk_add_cases` to create a batch of cases
- **THEN** the tool call response's text content includes a sentence stating how many cases were created and in which project

#### Scenario: A read tool's result includes a readable summary
- **WHEN** an agent calls `search` with a query that matches results
- **THEN** the tool call response's text content includes a sentence stating how many matches were found for the query

#### Scenario: Structured content is unaffected by the readable summary
- **WHEN** an agent calls any MCP tool successfully
- **THEN** the tool call response's structured content is the same value it would be without the readable summary text present

### Requirement: upsert_test_case tool
The system SHALL provide an `upsert_test_case` MCP tool that creates a new test case or edits an existing one (by key), producing a new immutable version on edit, enforcing the caller's project permissions. A step entry in the tool's `steps` input MAY reference an existing step group by key instead of supplying its own `action`/`expected` content; the tool SHALL resolve such entries server-side against the referenced step group's current content, via the same resolution path used by the REST case-write routes, and SHALL NOT accept pre-resolved step content for a group-reference entry from the caller. The create path (no existing case key supplied) MAY accept an optional `idempotencyKey`: if a prior successful create call from the same caller supplied the same key, the tool SHALL return that prior result instead of creating a second case. The returned case SHALL identify its project by `projectKey`, not internal project ID, and SHALL NOT include a folder ID field.

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

#### Scenario: Returned case identifies its project by key, not internal ID
- **WHEN** an agent calls `upsert_test_case` to create or edit a case
- **THEN** the returned record includes `projectKey` and does not include a raw internal project ID or folder ID field

### Requirement: upsert_step_group tool
The system SHALL provide an `upsert_step_group` MCP tool that creates a new project-scoped step group or edits an existing one (by key), enforcing the caller's `manageProject` permission on the target project. The returned step group SHALL identify its project by `projectKey`, not internal project ID.

#### Scenario: Create a new step group
- **WHEN** an agent with `manageProject` permission on a project calls `upsert_step_group` with no existing group key and a name plus one or more steps
- **THEN** a new step group is created under that project and its key is returned

#### Scenario: Edit an existing step group by key
- **WHEN** an agent with `manageProject` permission calls `upsert_step_group` with an existing group's key and updated steps
- **THEN** that step group's content is updated in place, not duplicated

#### Scenario: Rejected without manageProject permission
- **WHEN** an agent without `manageProject` permission on a project calls `upsert_step_group` for that project
- **THEN** the tool call fails with a permission error and no step group is created or modified

#### Scenario: Returned step group identifies its project by key, not internal ID
- **WHEN** an agent calls `upsert_step_group` to create or edit a step group
- **THEN** the returned record includes `projectKey` and does not include a raw internal project ID field

### Requirement: upsert_test_suite tool
The system SHALL provide an `upsert_test_suite` MCP tool that creates a new test suite or renames/edits an existing one (by key), enforcing the caller's project permissions. The returned suite SHALL identify its project by `projectKey` and its member cases by `caseKeys`, not internal IDs — the identical output shape `update_suite_membership` returns.

#### Scenario: Create a new suite
- **WHEN** an agent calls `upsert_test_suite` with no existing suite key and valid fields
- **THEN** a new test suite is created and its key is returned

#### Scenario: Returned suite identifies its project and cases by key, not internal ID
- **WHEN** an agent calls `upsert_test_suite` to create or rename a suite
- **THEN** the returned record includes `projectKey` and `caseKeys`, and does not include a raw internal project ID or case ID

### Requirement: update_suite_membership tool
The system SHALL provide an `update_suite_membership` MCP tool that adds a test case to a suite or removes it, enforcing the caller's `manageProject`-equivalent `PermSuiteEditMembership` permission on the suite's project. The tool accepts a suite key, a case key, and an `action` of `"add"` or `"remove"`. Adding a case already in the suite, or removing a case not in the suite, SHALL succeed as a no-op rather than failing. The tool SHALL return the suite's current membership as case keys, not internal case IDs — the identical output shape `upsert_test_suite` returns.

#### Scenario: Add a case to a suite
- **WHEN** an agent with `PermSuiteEditMembership` on a project calls `update_suite_membership` with an existing suite key, an existing case key from the same project, and `action: "add"`
- **THEN** the case is added to the suite's membership and the returned membership list includes that case's key

#### Scenario: Remove a case from a suite
- **WHEN** an agent with `PermSuiteEditMembership` calls `update_suite_membership` with a suite key, a case key currently in that suite's membership, and `action: "remove"`
- **THEN** the case is removed from the suite's membership and the returned membership list no longer includes that case's key

#### Scenario: Adding an already-member case is a no-op
- **WHEN** an agent calls `update_suite_membership` with `action: "add"` for a case already in the suite's membership
- **THEN** the call succeeds, membership is unchanged, and no error is returned

#### Scenario: Removing a non-member case is a no-op
- **WHEN** an agent calls `update_suite_membership` with `action: "remove"` for a case not currently in the suite's membership
- **THEN** the call succeeds, membership is unchanged, and no error is returned

#### Scenario: Rejected without permission
- **WHEN** an agent without `PermSuiteEditMembership` on a project calls `update_suite_membership` for a suite in that project
- **THEN** the tool call fails with a permission error and suite membership is unchanged

#### Scenario: Rejected when case belongs to a different project
- **WHEN** an agent calls `update_suite_membership` with `action: "add"` for a suite and case that belong to different projects
- **THEN** the tool call fails with a validation error and suite membership is unchanged

#### Scenario: Suite membership changes do not affect already-created runs
- **WHEN** a run has already been created from a suite's cases, and `update_suite_membership` subsequently changes that suite's membership
- **THEN** the existing run's run items remain unchanged, still pinned to the case versions captured at run-creation time

### Requirement: bulk_add_cases tool
The system SHALL provide a `bulk_add_cases` MCP tool that creates multiple test cases in one call as a single atomic transaction: if any case in the batch is invalid, no case in the batch is created. The tool MAY accept an optional `idempotencyKey`: if a prior successful call from the same caller supplied the same key, the tool SHALL return that prior result instead of creating a second batch. Each returned case SHALL identify its project by `projectKey`, not internal project ID, and SHALL NOT include a folder ID field — the identical per-case output shape `upsert_test_case` returns.

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

### Requirement: record_result tool
The system SHALL provide a `record_result` MCP tool that appends a result entry (verdict, comment, actor) to a run item's append-only result log, enforcing assignee/permission restrictions identical to REST. The returned result SHALL include the `runKey` and `caseKey` the caller supplied, and SHALL NOT include a raw internal run item ID. The tool SHALL accept an optional `stepResults` array of `stepIndex`/`verdict` pairs, submitted atomically with the overall verdict; when supplied, these become the result's step-verdict snapshot and the run item's new live step verdicts, identically to REST's equivalent `stepResults` field, including server-side bounds-checking against the case's pinned step count.

#### Scenario: Record a passing result
- **WHEN** an agent calls `record_result` for a run item it is permitted to act on, with verdict `pass`
- **THEN** a new result log entry is appended recording the agent as actor, and the run item's current status updates to `pass`

#### Scenario: Recording blocked for unauthorized item
- **WHEN** an agent calls `record_result` for a run item outside its scoped permissions
- **THEN** the tool call fails with a permission error and no result entry is appended

#### Scenario: Returned result identifies the run and case by key, not internal run item ID
- **WHEN** an agent calls `record_result` successfully
- **THEN** the returned record includes the `runKey` and `caseKey` supplied in the call, and does not include a raw internal run item ID

#### Scenario: Recording step-level verdicts atomically with the overall result
- **WHEN** an agent calls `record_result` with a `stepResults` array identifying which step failed
- **THEN** the returned result includes that step-verdict snapshot, and the run item's live per-step state reflects it for a later retest

#### Scenario: Step index out of bounds is rejected
- **WHEN** an agent calls `record_result` with a `stepResults` entry whose `stepIndex` exceeds the case's pinned step count
- **THEN** the tool call fails with a validation error and no result entry is appended

### Requirement: update_run_item_status tool
The system SHALL provide an `update_run_item_status` MCP tool that updates a run item's status (e.g. requesting `retest`, marking `blocked`) independent of recording a verdict-bearing result.

#### Scenario: Request a retest
- **WHEN** an agent calls `update_run_item_status` with status `retest` for a completed run item it can act on
- **THEN** the run item's current status becomes `retest`

### Requirement: search tool
The system SHALL provide a `search` MCP tool performing cross-entity full-text search over test cases, test suites, test runs, projects, releases, and test plans, backed by a Postgres `tsvector`+GIN index, returning only entities the caller's Actor has permission to see. Each result SHALL identify its project by `projectKey`, not internal project ID, resolved with at most one additional query per call regardless of result-set size. The tool SHALL accept optional `cursor`/`limit` parameters and return a `nextCursor` when more results are available beyond the current page. The `query` parameter SHALL be optional: when omitted or empty, the tool SHALL list matching entities ordered by most-recently-created first instead of erroring or returning no results, with `rank` reported as `0` for every result in this mode. The tool SHALL accept an optional `entityType` parameter (one of `case`, `suite`, `run`, `project`, `release`, `testPlan`) restricting results to that entity type, usable together with either a keyword query or an empty (browse) query.

#### Scenario: Search returns matches across entity types
- **WHEN** an agent calls `search` with a query term matching both a test case title and a project name
- **THEN** results include both the matching case and the matching project, ranked by relevance

#### Scenario: Search respects project scoping
- **WHEN** an agent with a project-scoped token calls `search` with a term matching entities in other projects
- **THEN** only matches within the token's scoped project are returned

#### Scenario: Returned results identify their project by key, not internal ID
- **WHEN** an agent calls `search` and receives results spanning multiple projects
- **THEN** each result includes `projectKey` and does not include a raw internal project ID

#### Scenario: Pagination via cursor
- **WHEN** an agent calls `search` with a `limit` smaller than the total number of matches
- **THEN** the response includes a `nextCursor`, and a follow-up call with that cursor returns the next page of results

#### Scenario: Empty query browses a project's contents
- **WHEN** an agent calls `search` with an empty or omitted `query` against an accessible project
- **THEN** the response lists that project's entities ordered by most-recently-created first, with `rank` reported as `0` for every result, instead of an error or an empty result set

#### Scenario: entityType narrows either mode
- **WHEN** an agent calls `search` with `entityType: "suite"` and either a keyword `query` or an empty `query`
- **THEN** only suites are returned, with the same ranking (keyword mode) or recency ordering (browse mode) as an unfiltered call

### Requirement: get_details tool
The system SHALL provide a `get_details` MCP tool that fetches the full record for a single entity given an explicit `entityType` and `key`, routing to the appropriate lookup for that type. For every entity type it can return, the record SHALL identify related entities by key, not internal ID, matching the output shape the corresponding dedicated tool (`upsert_test_case`, `upsert_test_suite`, `upsert_step_group`) returns for that same entity type.

#### Scenario: Fetch an existing case by key
- **WHEN** an agent calls `get_details` with `entityType: "case"` and a valid case key
- **THEN** the full case record is returned

#### Scenario: Type/key mismatch reported clearly
- **WHEN** an agent calls `get_details` with `entityType: "run"` and a key belonging to a suite
- **THEN** the tool call fails with an error indicating the key does not match the requested entity type

#### Scenario: Fetched records identify related entities by key, not internal ID
- **WHEN** an agent calls `get_details` for a case, suite, step group, release, or test plan
- **THEN** the returned record identifies its project (and, for a test plan, its release) by key, not internal ID

### Requirement: get_run_progress tool
The system SHALL provide a `get_run_progress` MCP tool returning a run's status summary (counts per status, pass rate), enforcing the caller's project permissions.

#### Scenario: Fetch progress for an in-progress run
- **WHEN** an agent calls `get_run_progress` for a run it can view
- **THEN** the current per-status counts and pass rate are returned

### Requirement: list_run_items tool
The system SHALL provide a `list_run_items` MCP tool that lists a run's items, cursor-paginated, enforcing the caller's `PermRead` permission on the run's project. The tool accepts a run key and optional `cursor`/`limit` parameters, matching REST's own pagination convention for run items. Each returned item SHALL identify its case by `caseKey`, not internal case ID, and SHALL NOT include a raw internal run item ID, run ID, or assignee reference ID.

#### Scenario: List a run's items
- **WHEN** an agent calls `list_run_items` with an existing run key
- **THEN** the run's items are returned, each identifying its case by `caseKey` and including its current status

#### Scenario: Pagination via cursor
- **WHEN** an agent calls `list_run_items` with a `limit` smaller than the run's total item count
- **THEN** the response includes a `nextCursor`, and a follow-up call with that cursor returns the next page of items

#### Scenario: Rejected without read permission
- **WHEN** an agent without `PermRead` on a run's project calls `list_run_items` for that run
- **THEN** the tool call fails with a permission error

#### Scenario: Returned items identify their case by key, not internal ID
- **WHEN** an agent calls `list_run_items` for a run with at least one item
- **THEN** each returned item includes `caseKey` and does not include a raw internal run item ID, run ID, case ID, or assignee reference ID

### Requirement: list_projects tool
The system SHALL provide a `list_projects` MCP tool listing projects visible to the caller's Actor, matching REST's project-listing visibility rules. The tool SHALL accept optional `cursor`/`limit` parameters and return a `nextCursor` when more projects are available beyond the current page.

#### Scenario: Unscoped token lists all accessible projects
- **WHEN** an agent with an unscoped token calls `list_projects`
- **THEN** all projects the token creator can access are returned

#### Scenario: Scoped token lists only its project
- **WHEN** an agent with a project-scoped token calls `list_projects`
- **THEN** only that single scoped project is returned

#### Scenario: Pagination via cursor
- **WHEN** an agent calls `list_projects` with a `limit` smaller than the total number of accessible projects
- **THEN** the response includes a `nextCursor`, and a follow-up call with that cursor returns the next page of projects

### Requirement: No delete operations via MCP
The system SHALL NOT expose any delete/removal operation through MCP tools in v0.1; deletions remain REST-only.

#### Scenario: No delete tool is registered
- **WHEN** an MCP client lists available tools
- **THEN** no tool in the list performs a delete or removal operation

### Requirement: MCP discoverability in the admin UI
The web UI SHALL surface the MCP server's existence and authentication model in Instance Settings' Integrations section, so a Tenant Admin can discover it without leaving the app. The card SHALL state that the MCP server is available at `/mcp` and is authenticated using the same API tokens as the REST API, with a link to the Tokens page. The card SHALL NOT display a connection status indicator or a connected-agent count, since neither can be derived honestly from the current stateless, session-less MCP transport. The card SHALL reflect the real `TESTPULSE_MCP_ENABLED` config state (exposed via `GET /api/v1/meta`'s `mcpEnabled` field), rather than unconditionally claiming the server is available.

#### Scenario: Admin discovers MCP from Instance Settings
- **WHEN** a Tenant Admin opens Instance Settings
- **THEN** the Integrations section shows an "MCP" card stating the server is available at `/mcp` and authenticated with API tokens, alongside the existing Jira card

#### Scenario: MCP card links to token management
- **WHEN** a Tenant Admin clicks the MCP card's token link
- **THEN** the app navigates to the Tokens page

#### Scenario: Card shows no fabricated status or count
- **WHEN** a Tenant Admin views the MCP card
- **THEN** no up/down indicator or connected-agent count is shown, since the MCP transport is stateless and has no connection registry to report from

#### Scenario: Card shows enabled state when the mount is active
- **WHEN** the instance is running with `TESTPULSE_MCP_ENABLED` unset or `true`
- **THEN** the MCP card states the server is currently enabled

#### Scenario: Card shows disabled state when the mount is inactive
- **WHEN** the instance is running with `TESTPULSE_MCP_ENABLED=false`
- **THEN** the MCP card states the server is currently disabled, rather than continuing to claim it's available at `/mcp`

### Requirement: Public MCP availability badge
The web UI SHALL surface a small, non-interactive "MCP" indicator in the app-wide health/version footer (`HealthBadge`), visible to every visitor including unauthenticated ones, when the instance has MCP enabled. The indicator SHALL NOT render when MCP is disabled, and SHALL NOT display a connection status, session count, or any data beyond the plain fact that the MCP mount is enabled.

#### Scenario: Anonymous visitor sees the MCP badge on a public page
- **WHEN** an unauthenticated visitor views a page using the public layout (e.g. the login page) on an instance with MCP enabled
- **THEN** the footer shows an "MCP" badge alongside the version and system-status indicators

#### Scenario: Badge absent when MCP is disabled
- **WHEN** any visitor, authenticated or not, views the footer on an instance with `TESTPULSE_MCP_ENABLED=false`
- **THEN** no MCP badge is shown, and no other part of the footer changes

#### Scenario: Badge shows no live connection data
- **WHEN** any visitor views the MCP badge
- **THEN** it shows only the label "MCP" with a static descriptive hover title — no count, no up/down state, no link
