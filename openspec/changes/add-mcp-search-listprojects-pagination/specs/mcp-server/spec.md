## MODIFIED Requirements

### Requirement: search tool
The system SHALL provide a `search` MCP tool performing cross-entity full-text search over test cases, test suites, test runs, projects, releases, and test plans, backed by a Postgres `tsvector`+GIN index, returning only entities the caller's Actor has permission to see. Each result SHALL identify its project by `projectKey`, not internal project ID, resolved with at most one additional query per call regardless of result-set size. The tool SHALL accept optional `cursor`/`limit` parameters and return a `nextCursor` when more results are available beyond the current page.

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
