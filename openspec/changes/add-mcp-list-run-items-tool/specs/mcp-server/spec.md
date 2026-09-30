## ADDED Requirements

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
