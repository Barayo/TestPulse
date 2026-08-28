# jira-connector

## Purpose

The standalone Jira connector: a separate deployable process, never
in-process code in `apps/api`, that keeps TestPulse's cached view of a
linked Jira issue's summary and status reasonably fresh, and the
Tenant-Admin-configured Jira site URL the UI uses to build a browsable link
for a linked issue.

## Requirements

### Requirement: Connector runs as a standalone process, never in-process

The Jira connector SHALL be a separate deployable process from the TestPulse API binary, authenticating to TestPulse as an ordinary scoped agent actor over the REST API and to Jira Cloud via its own REST API v3 credentials. It SHALL NOT be reachable as an in-process code path of `apps/api`.

#### Scenario: The API binary has no Jira dependency

- **WHEN** `apps/api` is built
- **THEN** its dependency graph contains no Jira client library or Jira-specific code

### Requirement: Configuration via environment variables, fail fast

The connector SHALL read all configuration from `TESTPULSE_JIRA_*` and `TESTPULSE_URL`/`TESTPULSE_JIRA_AGENT_TOKEN` environment variables and SHALL fail to start, naming the missing variable, if any required value is absent — consistent with TestPulse's own config convention.

#### Scenario: Missing Jira credentials prevents startup

- **WHEN** the connector starts without `TESTPULSE_JIRA_API_TOKEN` set
- **THEN** it exits immediately with an error naming that variable, rather than starting and failing on first sync

### Requirement: Periodic batched sync of linked issues

On each sync interval (`TESTPULSE_JIRA_SYNC_INTERVAL`, default 5 minutes), the connector SHALL, for each project its token can access, fetch all Jira-linked cases and open-run items via the `jiraLinked=true` filter, then fetch their current Jira issue data in a single batched Jira search per project rather than one Jira API call per linked item, then write the resulting summary, status, and sync timestamp back to each linked case/run item.

#### Scenario: One Jira call covers many linked cases in a project

- **WHEN** a project has 20 cases linked to Jira issues
- **THEN** the connector fetches their current data using one batched Jira search request for that project's sync pass, not 20 individual requests

### Requirement: A sync failure never blocks TestPulse editing or corrupts cached data

If a Jira API call fails (network error, rate limit, revoked credential, unknown issue key) for a given item, the connector SHALL log the failure, leave that item's previously cached `jiraIssueSummary`/`jiraIssueStatus`/`jiraLastSyncedAt` untouched, and retry on the next sync interval — normal case/run item editing in TestPulse SHALL remain unaffected regardless of connector or Jira availability.

#### Scenario: Jira outage does not affect case editing

- **WHEN** Jira's API is unreachable during a sync pass
- **THEN** existing cases and run items remain fully editable in TestPulse, and their last-cached Jira fields are unchanged

#### Scenario: An unknown or deleted Jira issue key is skipped, not fatal

- **WHEN** a linked `jiraIssueKey` no longer exists in Jira
- **THEN** the connector logs the mismatch for that one item and continues syncing the rest of the batch

### Requirement: Browsable Jira links are built from a Tenant-Admin-configured site URL, not connector-cached per issue

The instance settings SHALL include a Tenant-Admin-configurable `jiraSiteUrl` (e.g. `https://mycompany.atlassian.net`), settable via the existing instance-settings update endpoint. The UI SHALL build each linked issue's browsable URL as `{jiraSiteUrl}/browse/{jiraIssueKey}` — a case or run item SHALL NOT store a per-issue URL.

#### Scenario: A link works before any sync has ever run

- **WHEN** a user sets a case's `jiraIssueKey` and `jiraSiteUrl` is already configured
- **THEN** the case immediately shows a working link to the Jira issue, regardless of whether the connector has synced yet

#### Scenario: An unconfigured site URL degrades to a non-clickable key

- **WHEN** `jiraSiteUrl` is empty (not configured)
- **THEN** a linked issue key still displays, without a clickable link

#### Scenario: Only a Tenant Admin can set the Jira site URL

- **WHEN** a non-Tenant-Admin actor attempts to update `jiraSiteUrl`
- **THEN** the request is rejected, consistent with every other instance-wide setting
