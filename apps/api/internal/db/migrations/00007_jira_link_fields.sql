-- +goose Up
-- add-jira-connector: a test case/run item can carry a Jira issue key
-- (identity-level metadata, deliberately not versioned) plus a cached
-- summary/status/sync-timestamp written only by the external Jira
-- connector, never directly by the case/run-item update endpoints.
-- The browsable issue link is computed client-side from jira_site_url
-- (instance_settings) + this key — the connector/case rows never store a
-- per-issue URL, so a link works immediately, before any sync ever runs.
ALTER TABLE test_cases
    ADD COLUMN jira_issue_key text,
    ADD COLUMN jira_issue_summary text,
    ADD COLUMN jira_issue_status text,
    ADD COLUMN jira_last_synced_at timestamptz;

ALTER TABLE test_run_items
    ADD COLUMN jira_issue_key text,
    ADD COLUMN jira_issue_summary text,
    ADD COLUMN jira_issue_status text,
    ADD COLUMN jira_last_synced_at timestamptz;

-- jira_site_url is the Tenant-Admin-configured Jira Cloud site base URL
-- (e.g. "https://mycompany.atlassian.net"), used only to build browsable
-- issue links in the UI — separate from the connector's own
-- TESTPULSE_JIRA_* env config, which it needs independently since it runs
-- as its own process with no access to instance_settings.
ALTER TABLE instance_settings
    ADD COLUMN jira_site_url text;

-- +goose Down
ALTER TABLE test_cases
    DROP COLUMN jira_issue_key,
    DROP COLUMN jira_issue_summary,
    DROP COLUMN jira_issue_status,
    DROP COLUMN jira_last_synced_at;

ALTER TABLE test_run_items
    DROP COLUMN jira_issue_key,
    DROP COLUMN jira_issue_summary,
    DROP COLUMN jira_issue_status,
    DROP COLUMN jira_last_synced_at;

ALTER TABLE instance_settings
    DROP COLUMN jira_site_url;
