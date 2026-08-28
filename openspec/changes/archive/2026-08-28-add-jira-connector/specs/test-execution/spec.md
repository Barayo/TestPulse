## ADDED Requirements

### Requirement: Linking a run item to a Jira issue

A run item SHALL support the same optional `jiraIssueKey` (plus `jiraIssueSummary`, `jiraIssueStatus`, `jiraLastSyncedAt`) as a test case, settable via a dedicated `PUT /items/{itemId}/jira-link` endpoint and synced via `PUT /items/{itemId}/jira-sync`, independent of the case version it pins.

#### Scenario: Set a Jira issue key on a run item

- **WHEN** a user with edit permission calls the run item's `jira-link` endpoint with `jiraIssueKey: "PROJ-456"`
- **THEN** the run item's `jiraIssueKey` is stored as `"PROJ-456"`, and its `currentStatus` and pinned `caseVersion` are unchanged

#### Scenario: A closed run rejects a Jira link change

- **WHEN** a user attempts to set or clear `jiraIssueKey` on a run item belonging to a closed run
- **THEN** the request is rejected, consistent with a closed run rejecting other status updates

#### Scenario: Filtering an open run's items to only Jira-linked items

- **WHEN** a client requests an open run's items with `jiraLinked=true`
- **THEN** only run items with a non-null `jiraIssueKey` are returned
