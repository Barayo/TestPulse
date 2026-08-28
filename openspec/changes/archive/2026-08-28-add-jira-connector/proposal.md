## Why

As a tester or project admin, when I'm looking at a test case or a failed run item, I want to see and follow the Jira issue it relates to — instead I have to cross-reference case titles and Jira ticket numbers by hand, in two separate browser tabs, with nothing in TestPulse recording the link at all. v0.4 ("Connected") is the release whose story is exactly this: TestPulse meets the tools teams already use. A Jira connector is the first (and, per the architecture's connector decision, a template for future) integration.

## What Changes

- Test cases and run items gain an optional `jiraIssueKey` (e.g. `PROJ-123`), settable via new dedicated `jira-link` endpoints (never the versioned content-edit endpoint) — plain identity-level metadata, not part of a case's versioned content, since a Jira link describes the case/item itself, not a specific authored revision.
- A new Tenant-Admin-configurable instance setting, `jiraSiteUrl` (e.g. `https://mycompany.atlassian.net`), lets the UI build a working link to the real Jira issue the moment a key is set — independent of whether the connector has run yet.
- A new **Jira connector**: a small standalone Go program (`tools/jira-connector`), run as its own process/deployable — never compiled into `apps/api`, per `establish-architecture`'s standing decision that connectors are external API/MCP clients, not in-process plugins. It authenticates to TestPulse with a scoped agent API token (the existing agent-actor mechanism — no new auth surface on the TestPulse side) and to Jira Cloud with a project-supplied API token (email + token, Jira REST API v3). It talks to TestPulse over the REST API only: `add-mcp-server` (v0.1, "in scope" per `ROADMAP.md`) turns out not to actually be implemented yet — no MCP tools exist in the codebase despite the roadmap listing it as shipped — so this change does not add or depend on any MCP tool surface. Worth flagging separately; out of scope here.
- The connector polls TestPulse for cases/run items with a `jiraIssueKey` set, fetches each linked issue's summary and status from Jira, and writes that back to TestPulse as cached, read-only display fields (`jiraIssueSummary`, `jiraIssueStatus`, `jiraLastSyncedAt`) via the same update endpoints — so the core API never talks to Jira directly, and the UI never needs to know a sync even happened out-of-process.
- UI: a small Jira badge on `CaseDetailPage` and on run item rows (`RunPage`) showing the linked issue key, its cached status, and a link out to the real Jira issue. Settable/clearable inline from the same surfaces.
- `docs/integrations.md` (new page, linked from `docs/README.md`) documents connector configuration and deployment (`TESTPULSE_JIRA_*` / `TESTPULSE_URL` env vars, docker-compose service snippet).
- Sample Project showcase: seed data gains a couple of `jiraIssueKey` values on sample cases/run items so the badge has something to demo out of the box (cached fields stay empty/unsynced in the seed — no live Jira account to sync against).

**Deliberately out of scope for this change**: writing back to Jira (creating/commenting on issues), auto-filing bugs from failed runs, importing Jira issues as cases, and any generalized multi-connector abstraction — this ships one concrete connector for one concrete traceability need. Generalize only if a second connector actually gets scheduled.

## Capabilities

### New Capabilities
- `jira-connector`: the standalone connector service — config, auth to both systems, polling/sync behavior, failure handling (a sync failure never blocks case/run editing in TestPulse itself).

### Modified Capabilities
- `test-authoring`: test case update gains `jiraIssueKey` (settable) and `jiraIssueSummary`/`jiraIssueStatus`/`jiraLastSyncedAt` (read-only, connector-written) fields.
- `test-execution`: run item update gains the same field set, for linking a Jira issue to a specific run item's result (e.g. a failure).

## Impact

- **API**: `apps/api/internal/domain/domain.go` (`TestCase`, `RunItem`, `InstanceSettings`), `packages/shared/openapi.yaml` + generated types, new `jira-link`/`jira-sync` handlers and service methods, `internal/db/migrations/` (new columns on `test_cases`/`test_run_items`/`instance_settings`).
- **Web**: `CaseDetailPage`, `RunPage` (or its run-item row component) gain the Jira badge; a small edit affordance to set/clear the key.
- **New component**: `tools/jira-connector/` — its own `go.mod` (or a module within the existing one, TBD in design.md), Dockerfile, and compose/Helm deployment notes. No changes to `apps/api`'s runtime dependencies.
- **Docs**: new `docs/integrations.md`; `docs/README.md` index entry; `ROADMAP.md`'s v0.4 line updated from "not started" once shipped.
- **Sample data**: `apps/api/internal/sampledata/seed.go` and `seed_test.go`.
