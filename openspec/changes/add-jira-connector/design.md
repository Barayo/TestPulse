## Context

TestPulse's `establish-architecture` design settled that connectors are external API clients, never in-process plugins — so this is the first change to actually exercise that decision. There's no precedent in the codebase for a second deployable, and no existing "discover records with an external link set" query pattern to reuse. `ROADMAP.md` lists `add-mcp-server` as shipped v0.1 scope, but no MCP code exists anywhere in the repo (confirmed by grep) and the GitHub Project board still carries it as `Backlog` (#8, #109) — so this connector talks to TestPulse over REST only; it does not wait on or bundle an MCP server build-out.

## Goals / Non-Goals

**Goals:**
- A test case or run item can carry a Jira issue key, settable from the TestPulse UI or REST API.
- A linked issue key is browsable immediately (a clickable link to the real Jira issue), independent of whether the connector has ever run.
- An out-of-process connector keeps a cached summary/status of that Jira issue reasonably fresh, without any Jira-specific code living in `apps/api`.
- A connector outage or a Jira API failure never blocks or corrupts normal case/run editing in TestPulse — sync is best-effort and additive.

**Non-Goals:**
- Writing back to Jira (creating issues, comments, transitions) — read-only sync from Jira's side.
- Multi-connector abstraction — this ships one concrete Jira integration; a generic "external connector" framework is only worth building once a second connector is actually scheduled.
- OAuth app registration/3LO — this is a self-hosted, single-tenant-per-install tool, not an Atlassian Marketplace app serving many Jira tenants.

## Decisions

### D1: Separate Go module under `tools/jira-connector`, own `go.mod`

The connector gets its own module rather than living in `apps/api/cmd/`. Its dependency graph (a Jira API client) has no reason to be pulled into the main API binary's build or its distroless image, and a build/dependency failure in the connector must never be able to break `apps/api`'s own `go build ./...` CI gate.

- *Alternative — a new `cmd/` entrypoint in the existing module*: rejected; shares `go.mod`, so a Jira SDK dependency (even an HTTP-only one) taints the main binary's dependency tree for zero benefit, and CI's existing `go build ./...`/`go vet ./...` steps would need updating to know about it either way.

### D2: Polling, not webhooks, and TestPulse-initiated discovery via a filter query param

The connector runs a loop: every `sync interval` (default 5m, `TESTPULSE_JIRA_SYNC_INTERVAL`), it calls `GET /projects/{key}/cases?jiraLinked=true` and the equivalent run-item listing per open run, for each project the connector's token can see. `jiraLinked=true` is a new filter option on the existing list endpoints/queries (a `WHERE jira_issue_key IS NOT NULL` predicate pushed to the DB) — not a client-side scan of every case, per the project's standing rule that aggregate/list features must be designed for DB scale, not loops over full result sets.

For each linked key found, it batches a Jira JQL search (`issuekey in (KEY-1,KEY-2,...)`, Jira's bulk search endpoint) rather than one HTTP call per case — this bounds Jira API usage to roughly one call per project per sync interval instead of one per linked case.

- *Alternative — Jira webhooks pushing into TestPulse*: rejected for v1; TestPulse has no generalized inbound-webhook receiver yet (that's backlog #130, a separate unbuilt capability), and polling is simpler to reason about, test, and self-host without exposing a new public endpoint.
- *Alternative — TestPulse pushes a list of linked keys to the connector*: rejected; would require TestPulse to know the connector's address and retry semantics, inverting the "TestPulse doesn't know Jira exists" property this design is going for.

### D3: Auth — Jira API token (email + token, Basic auth) against Jira Cloud REST API v3; TestPulse-side scoped agent token

Two independent credentials, both connector-local config, never touching TestPulse's own database:
- **Jira side**: `TESTPULSE_JIRA_EMAIL` + `TESTPULSE_JIRA_API_TOKEN`, Basic-auth against `https://<site>.atlassian.net/rest/api/3/`.
- **TestPulse side**: `TESTPULSE_JIRA_AGENT_TOKEN`, an ordinary scoped agent API token created the same way any other agent gets one today (no new auth mechanism) — scoped read/write on the cases and run items it needs to touch.

- *Alternative — Jira OAuth 2.0 (3LO)*: rejected; that flow exists to let a single Atlassian Marketplace app serve many customer Jira sites through a consent screen. A self-hosted connector run by the same team that owns the Jira site has no such multi-tenant need, and OAuth would add a redirect-callback surface the connector has no web UI to host.

### D4: New fields live on `TestCase`/`RunItem` directly, not on versioned content; two dedicated endpoints, not the content-update endpoint

`jiraIssueKey` (settable) and `jiraIssueSummary` / `jiraIssueStatus` / `jiraLastSyncedAt` (connector-written) are added to `TestCase` and `RunItem` themselves — not `CaseContent`. A Jira link describes the case/item's identity ("this is the case for PROJ-123"), not a specific authored revision; putting it in versioned content would mean every edit silently forked or lost the Jira link, which is never the intent.

They're exposed through two new dedicated endpoints per entity, following the existing precedent set by `MoveCase` (already its own endpoint, separate from the versioned content-edit endpoint, for the same reason: not every mutation is a content edit):
- `PUT /cases/{caseKey}/jira-link` / `PUT /items/{itemId}/jira-link` — body `{jiraIssueKey: string | null}`. Sets or clears the key; clearing also clears the three cached fields. This is what the UI's set/clear affordance calls, and its schema has no field for the cached values at all — they are not merely rejected at runtime, they don't exist in this request's shape.
- `PUT /cases/{caseKey}/jira-sync` / `PUT /items/{itemId}/jira-sync` — body `{jiraIssueSummary: string, jiraIssueStatus: string}`; the server sets `jiraLastSyncedAt` itself. Only valid when the case/item already has a non-null `jiraIssueKey` (guards against orphaned cache data). This is what the connector calls; it requires the same case/run-item edit permission any actor needs, since the connector authenticates as an ordinary scoped agent actor — no new permission concept.

`jiraIssueStatus` is stored as a plain string, not a TestPulse enum — Jira status names are workflow-configurable per Jira project, so hardcoding a taxonomy would break on the first customized workflow.

### D5: Browsable issue links are built client-side from a Tenant-Admin-configured `jiraSiteUrl` instance setting, not a per-item cached URL

The UI constructs each issue's link as `${instanceSettings.jiraSiteUrl}/browse/${jiraIssueKey}` rather than the connector caching a full URL per case/run item. `jiraSiteUrl` (e.g. `"https://mycompany.atlassian.net"`) is a new field on the existing single-row `instance_settings` table, following the exact `InstanceSettings`/`InstanceSettingsUpdate` partial-update pattern already used for retention/auto-archive/color-theme/OIDC settings — Tenant-Admin-only via the existing `PATCH /instance-settings` endpoint, no new auth surface.

This means a link works the instant a human types in an issue key, before the connector ever runs its first sync — only the cached summary/status genuinely need to wait on a sync. It also means the site URL is stored exactly once, not duplicated onto every linked case/run item.

The connector needs the same base URL for its own Jira API calls (`TESTPULSE_JIRA_BASE_URL`, connector-local env config per D3) — this is a second, independent copy of the same value, unavoidable given the two different runtime contexts (the connector process has no access to TestPulse's instance settings; the browser has no access to the connector's env). Both must be kept in sync by whoever configures the connector; this is documented in `docs/integrations.md`, not enforced by the system.

- *Alternative — connector caches a full `jiraIssueUrl` per case/run item*: initially implemented, then rejected — redundant storage of an identical string across every linked item, and a link only works after the first sync (a real UX gap for a screen otherwise designed to distinguish "linked" from "stale"). Reverted in favor of this design after a UI mock (Pepe) surfaced the gap explicitly.

### D6: Sync failures are logged and retried next interval; never surfaced as a case/run-item edit error

A Jira fetch failure (bad key, rate limit, network blip, revoked token) is caught, logged by the connector, and simply skipped until the next interval — TestPulse keeps serving whatever `jiraIssueSummary`/`jiraIssueStatus` it last cached (or nothing, if never synced), and `jiraLastSyncedAt` staying stale is the UI's signal that something's off, rather than an error state blocking anything.

## Risks / Trade-offs

- **Jira API rate limits** (Jira Cloud enforces per-token rate limits) → batched JQL search per project per interval keeps call volume low; a generous default interval (5m) and documented guidance for larger installs to raise it.
- **Stale data during a connector outage** → `jiraLastSyncedAt` is always shown next to the cached status in the UI, so staleness is visible rather than silently trusted.
- **Jira credential exposure** → both credentials are connector-only env vars; they never transit TestPulse's API, database, or logs. The connector's own token is a normal scoped agent token and can be revoked from TestPulse like any other.
- **N+1 growth as linked-case count grows within one project** → mitigated by D2's batched JQL search; if a single project's linked-case count ever exceeds Jira's JQL batch limits, paginate the batch (not designed further here — no installation is near that scale yet).

## Migration Plan

Additive only: new nullable columns on `test_cases` and `run_items`, plus one new nullable `jira_site_url` column on `instance_settings` (one new incremental migration file, per the project's permanent migration policy). No backfill needed — existing rows simply have `jira_issue_key = NULL` / `jira_site_url = NULL`. The connector is entirely opt-in: an installation that never sets `TESTPULSE_JIRA_*` and never configures `jiraSiteUrl` never runs it and sees no behavior change at all. Rollback is deleting the new migration's columns in a follow-up migration (never editing the shipped one) and not running the connector.

## Open Questions

- Whether run-item-level linking is needed in this first slice, or whether case-level linking alone already delivers v0.4's "Connected" story with run-item linking as a fast-follow — resolving this affects `tasks.md`'s scope and is worth the user's input before implementation starts.
