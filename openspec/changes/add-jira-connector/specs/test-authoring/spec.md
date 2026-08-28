## ADDED Requirements

### Requirement: Linking a test case to a Jira issue

A test case SHALL support an optional `jiraIssueKey`, settable and clearable via a dedicated `PUT /cases/{key}/jira-link` endpoint (never the versioned content-edit endpoint, following the same precedent as the existing case-move endpoint) — setting or clearing it SHALL NOT create a new case version. When set, the case SHALL also expose `jiraIssueSummary`, `jiraIssueStatus`, and `jiraLastSyncedAt` fields, populated only via a separate `PUT /cases/{key}/jira-sync` endpoint used by the Jira connector (see `jira-connector` capability) — the case-link and content-edit endpoints have no request field for these cached values at all.

#### Scenario: Set a Jira issue key on a case

- **WHEN** a user with edit permission calls `PUT /cases/{key}/jira-link` with `jiraIssueKey: "PROJ-123"`
- **THEN** the case's `jiraIssueKey` is stored as `"PROJ-123"` and its `currentVersion` is unchanged

#### Scenario: Clearing a Jira issue key also clears its cached summary

- **WHEN** a user calls `PUT /cases/{key}/jira-link` with `jiraIssueKey: null` on a linked case
- **THEN** `jiraIssueKey`, `jiraIssueSummary`, `jiraIssueStatus`, and `jiraLastSyncedAt` are all cleared

#### Scenario: The cache-sync endpoint requires an existing link

- **WHEN** `PUT /cases/{key}/jira-sync` is called on a case whose `jiraIssueKey` is null
- **THEN** the request is rejected, since there is no link for the cached data to describe

#### Scenario: A new case has no Jira link by default

- **WHEN** a test case is created without a `jiraIssueKey`
- **THEN** `jiraIssueKey`, `jiraIssueSummary`, `jiraIssueStatus`, and `jiraLastSyncedAt` are all null

#### Scenario: Filtering the case list to only Jira-linked cases

- **WHEN** a client requests a project's case list with `jiraLinked=true`
- **THEN** only cases with a non-null `jiraIssueKey` are returned, and no case content is scanned client-side to produce this result
