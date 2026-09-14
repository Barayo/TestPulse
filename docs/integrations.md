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

## TestRail importer

> Independent, unofficial integration — not affiliated with, endorsed by,
> or sponsored by Idera, Inc. "TestRail" is a trademark of Idera, Inc. No
> TestRail logo is used anywhere in TestPulse's docs or UI.

The TestRail importer (`add-testrail-importer`) does a one-time structural
import of an existing TestRail project's suites, sections, and cases into a
TestPulse project — a different shape of integration from the Jira
connector above (a continuous background sync): this one runs a job,
reports a result, and is done. Like every TestPulse connector, it's a
separate deployable (`tools/import-connector/`), never in-process code in
the main `testpulse` image (`establish-architecture`'s standing decision).
The tool itself is deliberately generic — `import-connector`, not
`testrail-importer` — since TestRail is one `--source` backend inside it,
not the tool's own name (the trademark constraint above).

### What it does and doesn't import

- **Imports**: TestRail Suites (as top-level TestPulse Folders), Sections
  within a suite (as nested Folders, preserving TestRail's own hierarchy),
  and Cases (with steps and any `text`/`select`-type custom fields).
  TestPulse's own `Suite` construct — a flat, named selection of
  already-existing cases used to scope a run — is never created, modified,
  or otherwise touched by this import; it has no TestRail equivalent.
- **Does not import**: run/result history, and any TestRail custom field
  with no TestPulse equivalent (dropped, but always named individually in
  the job's report — never silently or collapsed into a summary count).
  Structure and cases only, a permanent v1 boundary, not a "not yet."
- Every import starts as a **dry run**: a read-only scan of the source
  TestRail project that produces a report (counts plus the list of
  unmappable fields) without creating anything in TestPulse. Only a
  second, explicit real-mode job actually writes.

### Auth model: per-project scoped, both directions

Unlike the Jira connector's long-lived static credentials, the importer
holds no TestRail credentials in its own config at all. A human enters the
TestRail site URL, project ID, account email, and API key once in the
browser (the Connect screen at **+ New project → Import from TestRail**);
TestPulse stores them encrypted at rest and hands them to the importer only
at the moment it claims that specific job. The importer's own TestPulse
identity is a **project-scoped agent token** (create one via
`POST /api/v1/tokens` or Settings → People, the same way any agent token is
created) — confined to exactly one TestPulse project, so one importer
deployment serves one target project. This is a deliberate v1 boundary
(design.md D4): more convenient multi-project support is possible later
without a schema change, but starting narrow costs little and preserves the
existing scoped-token confinement guarantee.

| Variable | Required | Default | Description |
|---|---|---|---|
| `TESTPULSE_URL` | **yes** | — | Base URL of the TestPulse API the importer talks to |
| `TESTPULSE_AGENT_TOKEN` | **yes** | — | A project-scoped TestPulse agent token |
| `TESTPULSE_IMPORT_CONNECTOR_POLL_INTERVAL` | no | `5s` | How often the importer polls for pending work, as a Go duration — deliberately tight (unlike the Jira connector's `5m` default), so the in-app Preview/Result screens stay responsive |
| `--source` (CLI flag, not an env var) | **yes** | — | Which connector backend to run as, e.g. `--source=testrail`. An invocation choice, not deployment config — TestRail is the first backend, more will follow (#190-193) |

**Docker Compose**: the evaluation stack includes an optional
`import-connector` service, off by default. Start it with:

```sh
TESTPULSE_AGENT_TOKEN=... \
docker compose -f deploy/compose/docker-compose.yml --profile import-connector up
```

**Helm**: set `importConnector.enabled: true` plus either
`importConnector.agentToken` (fine for evaluation) or
`importConnector.existingSecret` (a Secret with an `agentToken` key, for a
real deployment) — see `deploy/helm/testpulse/values.yaml`.
