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

## Qase importer

> Independent, unofficial integration — not affiliated with, endorsed by,
> or sponsored by Qase Ltd. "Qase" is a trademark of Qase Ltd. No Qase logo
> is used anywhere in TestPulse's docs or UI.

The Qase importer (`add-qase-importer`) is the same `tools/import-connector`
tool as the TestRail importer above, with `--source=qase` instead of
`--source=testrail` — the job/route/report contract, poll-not-push control
direction, and Connect → Preview → Result flow are all identical and
unchanged; only the source-specific client and mapping logic differ.

### What it does and doesn't import

- **Imports**: Qase Suites, mapped directly to a TestPulse Folder tree —
  a root suite (no parent) becomes a top-level Folder, a nested suite
  becomes a nested Folder, preserving Qase's own suite hierarchy exactly.
  Unlike TestRail, Qase has no separate "suite vs. section" split, so this
  mapping is one level simpler. Cases (with steps and any `text`/`select`
  -mappable custom fields) are created in their suite's mapped Folder.
  TestPulse's own `Suite` construct is never created, modified, or
  otherwise touched by this import.
- **Does not import**: run/result history, Qase's nested/child-step trees
  (TestPulse's own `Step` type has no nested-step concept at all), Qase's
  data-driven parameterized cases (each Qase case imports as one plain
  TestPulse case), and any Qase custom field with no TestPulse equivalent
  (`number`, `checkbox`, `multiselect`, `url`, `user`, `datetime` — dropped,
  but always named individually in the job's report, never silently or
  collapsed into a summary count). Structure and cases only, the same
  permanent v1 boundary as the TestRail importer.
- Every import starts as a **dry run**, identical in shape to the TestRail
  importer's.

### Auth: an API token and project code, no site URL required

Qase has no self-hosted product, so unlike TestRail's required site URL,
the importer's credentials are just a Qase **API token** and the target
**project code** (the short string in a Qase project's own URL, e.g.
`PRJ`) — entered once in the browser (the Connect screen at **+ New
project → Import from Qase**), stored encrypted at rest exactly like
TestRail's credentials, and handed to the importer only at claim time. An
optional **base URL** override (collapsed under "Advanced" on the Connect
screen) is available for Qase Enterprise customers on a dedicated-VPC
hostname; it defaults to Qase's public SaaS API
(`https://api.qase.io/v1`). The importer's own TestPulse identity uses the
same per-project-scoped agent token model as the TestRail importer.

**Docker Compose**: the same `import-connector` profile, with `--source=qase`:

```sh
TESTPULSE_AGENT_TOKEN=... \
docker compose -f deploy/compose/docker-compose.yml --profile import-connector \
  run import-connector --source=qase
```

**Helm**: the same `importConnector.enabled: true` chart values, setting
`importConnector.source: qase` in place of the default `testrail`.

## Zephyr Scale importer

> Independent, unofficial integration — not affiliated with, endorsed by,
> or sponsored by SmartBear Software. "Zephyr Scale" is a trademark of
> SmartBear Software. No Zephyr Scale/SmartBear logo is used anywhere in
> TestPulse's docs or UI.

The Zephyr Scale importer (`add-zephyr-scale-importer`) is the same
`tools/import-connector` tool as the TestRail and Qase importers above,
with `--source=zephyr-scale` — the job/route/report contract, poll-not-push
control direction, and Connect → Preview → Result flow are all identical
and unchanged; only the source-specific client and mapping logic differ.
**Zephyr Scale Cloud only** — Zephyr Scale Server/Data Center exposes a
structurally different, self-hosted API and isn't supported.

### What it does and doesn't import

- **Imports**: Zephyr Scale's `TEST_CASE`-type folders, mapped directly to
  a TestPulse Folder tree — a root folder (no parent) becomes a top-level
  Folder, a nested folder becomes a nested Folder, preserving Zephyr
  Scale's own folder hierarchy exactly. Like Qase, and unlike TestRail,
  there's no separate "suite vs. section" split. Cases are created in
  their folder's mapped Folder, or the project's root folder if the case
  has no folder. A case's step-by-step steps import directly, with any
  test data appended to the step's action text (TestPulse's `Step` type has
  no separate test-data field). A case authored as freeform plain-text or
  BDD instead of step-by-step has that script's text preserved in the
  case's description, identified by its type, rather than dropped — it
  imports with no steps. TestPulse's own `Suite` construct is never
  created, modified, or otherwise touched by this import.
- **Does not import**: run/result history, Zephyr Scale's own native
  priority/status (every imported case gets TestPulse's default, matching
  the same non-mapping the TestRail and Qase importers already apply to
  their own vendor's priority/status), "call to test" steps that delegate
  execution to another case (skipped, without aborting the rest of that
  case's steps). **Custom fields**: only a field whose value is plain text
  maps to a TestPulse `text` custom field — every other value shape is
  dropped, but always named individually in the job's report, never
  silently or collapsed into a summary count. Unlike TestRail/Qase, no
  Zephyr Scale field maps to TestPulse's `select` type in this version: the
  public API surface this importer could verify access to doesn't expose
  the field-type metadata needed to tell a genuine single-choice field
  apart from free text, so guessing was avoided rather than risking a wrong
  mapping. Structure and cases only, the same permanent v1 boundary as the
  other importers.
- Every import starts as a **dry run**, identical in shape to the other
  importers'.

### Auth: an API access token and project key, no site URL required

Zephyr Scale Cloud's API is a fixed, vendor-hosted endpoint
(`api.zephyrscale.smartbear.com`) — unlike TestRail's required site URL,
there's no per-customer hostname to configure. The importer's credentials
are just a Zephyr Scale **API access token** (generated from a user's Jira
profile → Zephyr Scale API Access Tokens page) and the target **project
key** (the Jira project's own key, e.g. `PROJ`) — entered once in the
browser (the Connect screen at **+ New project → Import from Zephyr
Scale**), stored encrypted at rest exactly like the other importers'
credentials, and handed to the importer only at claim time. The importer's
own TestPulse identity uses the same per-project-scoped agent token model
as the other importers.

**Docker Compose**: the same `import-connector` profile, with
`--source=zephyr-scale`:

```sh
TESTPULSE_AGENT_TOKEN=... \
docker compose -f deploy/compose/docker-compose.yml --profile import-connector \
  run import-connector --source=zephyr-scale
```

**Helm**: the same `importConnector.enabled: true` chart values, setting
`importConnector.source: zephyr-scale` in place of the default `testrail`.
