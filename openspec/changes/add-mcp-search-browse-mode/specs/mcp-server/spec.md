## MODIFIED Requirements

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
