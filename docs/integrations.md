# Integrations

## Jira connector

The Jira connector (`add-jira-connector`) links test cases and run items to
Jira issues and keeps a cached summary/status in sync — TestPulse's first
external integration, and per `establish-architecture`'s standing decision,
a template for future ones: connectors are external API clients, never
in-process plugins. There is no Jira-specific code in the main `testpulse`
image at all.

### What it does

- A test case or run item can carry a `jiraIssueKey` (e.g. `PROJ-123`),
  settable from its own page or via the REST API — independent of a case's
  versioned content, so linking/unlinking never creates a new version.
- A browsable link to the real Jira issue appears the moment a key is set,
  built client-side from the Tenant Admin's Instance Settings → Integrations
  → Jira **site URL** plus the key — it does not wait on the connector.
- The connector itself is a separate process. On a timer (`TESTPULSE_JIRA_SYNC_INTERVAL`,
  default 5 minutes), it asks TestPulse for every case/run item with a Jira
  link set, batch-fetches their current summary and status from Jira, and
  writes that back as read-only cached fields — the case/run item page then
  shows the issue's summary, status, and how recently it was synced.
- It's read-only from Jira's side: it never creates issues, comments, or
  transitions anything. A sync failure (Jira unreachable, a deleted issue,
  an expired token) is logged and skipped — case/run item editing in
  TestPulse is never affected, and the next interval tries again.

### Deploying it

The connector needs two independent sets of credentials, both entirely its
own — neither ever touches TestPulse's database:

1. **A scoped TestPulse agent token** — create one via `POST /api/v1/tokens`
   (or the Settings → People screen) the same way any other agent gets one;
   no special permission exists for this, ordinary case/run-item edit access
   on whichever projects should sync is enough.
2. **A Jira Cloud API token** for a Jira account the connector authenticates
   as (`id.atlassian.com/manage-profile/security/api-tokens`), plus that
   account's email and your Jira site's base URL (e.g.
   `https://mycompany.atlassian.net`).

| Variable | Required | Default | Description |
|---|---|---|---|
| `TESTPULSE_URL` | **yes** | — | Base URL of the TestPulse API the connector talks to, e.g. `http://localhost:8080` or an in-cluster service URL |
| `TESTPULSE_JIRA_AGENT_TOKEN` | **yes** | — | The scoped TestPulse agent token from step 1 |
| `TESTPULSE_JIRA_BASE_URL` | **yes** | — | Jira Cloud site base URL — keep this the same value as Instance Settings' `jiraSiteUrl` below; they're configured separately because the connector process and the browser can't share config |
| `TESTPULSE_JIRA_EMAIL`, `TESTPULSE_JIRA_API_TOKEN` | **yes** | — | Jira Cloud API token credentials (Basic auth against Jira's REST API v3) |
| `TESTPULSE_JIRA_SYNC_INTERVAL` | no | `5m` | How often the connector polls TestPulse and re-fetches Jira status, as a Go duration (`30s`, `5m`, `1h`) |

**Docker Compose**: the evaluation stack (`deploy/compose/docker-compose.yml`)
includes an optional `jira-connector` service, off by default. Start it with:

```sh
TESTPULSE_JIRA_AGENT_TOKEN=... TESTPULSE_JIRA_BASE_URL=... \
TESTPULSE_JIRA_EMAIL=... TESTPULSE_JIRA_API_TOKEN=... \
docker compose -f deploy/compose/docker-compose.yml --profile jira-connector up
```

**Helm**: set `jiraConnector.enabled: true` plus `jiraConnector.jiraBaseUrl`/
`jiraEmail` and either `jiraConnector.jiraApiToken`/`agentToken` (fine for
evaluation) or `jiraConnector.existingSecret` (a Secret with `jiraApiToken`/
`agentToken` keys, for a real deployment) — see `deploy/helm/testpulse/values.yaml`.

### Instance Settings: the site URL

Separately from the connector's own `TESTPULSE_JIRA_BASE_URL`, a Tenant
Admin sets the same Jira site URL under **Instance Settings → Integrations →
Jira**. This is what the UI uses to build a browsable link — it's a plain
setting stored in TestPulse's own database, not something the connector
process (which the browser has no access to) can supply. Leaving it empty
still shows a linked issue's key, just without a clickable link.
