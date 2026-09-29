# MCP server

TestPulse's stated differentiator: an agent can manage tests over the
[Model Context Protocol](https://modelcontextprotocol.io/) instead of
hand-rolling REST calls. The MCP server (`add-mcp-server`) runs inside the
same `testpulse-api` binary as the REST API — there's no separate process to
deploy — exposed at `/mcp` over MCP's Streamable HTTP transport, built on
the [official Go SDK](https://github.com/modelcontextprotocol/go-sdk).

## Connecting

1. **Get a TestPulse API token.** Any authenticated user can create one from
   the account menu's **API tokens** link (or `POST /api/v1/tokens`) — see
   [Test management: API tokens](test-management.md#api-tokens) for the full
   scoped-vs-unscoped explanation. An **unscoped** token acts at its
   creator's current permission level across every project they can access;
   a **scoped** token is capped to one project and one role, resolved fresh
   on every call.
2. **Point your MCP client at `/mcp`**, e.g. `http://localhost:8080/mcp` for
   a local Docker Compose instance, sending the token as
   `Authorization: Bearer <token>` — the exact header every REST call
   already uses. There's no separate MCP-specific auth: the same
   `authenticate` middleware resolves the request's actor before either
   REST or MCP ever runs.
3. Try it against the always-seeded [Sample Project](getting-started.md) —
   every tool below has real data to operate on immediately, no setup
   required.

Disable the mount entirely with `TESTPULSE_MCP_ENABLED=false` (default
`true`) — see [Deployment](deployment.md#configuration-reference).

A Tenant Admin can also find this same "point your client at `/mcp`,
authenticate with an API token" summary right in the product, without
leaving the app: **Instance Settings → Integrations** carries an MCP card
alongside Jira's, linking straight to token management.

## Tools

Twelve coarse-grained, hybrid tools — not a CRUD mirror of every REST
endpoint, and not a handful of workflow mega-tools. Deletes are REST-only;
no delete tool is registered.

| Tool | Description |
|---|---|
| `upsert_test_case` | Create a case (`projectKey` + fields), or edit one by `caseKey` (creates a new immutable version). A step entry's `action`/`expected` may be replaced with `groupKey` to reference an existing shared step group instead — resolved server-side to that group's current content, the same as the REST path (`add-reusable-steps`). The create path accepts an optional `idempotencyKey` (`add-mcp-idempotency-keys`) |
| `upsert_step_group` | Create a shared step group (`projectKey` + `name` + `steps`), or edit one by `groupKey` — requires `manageProject`. Referenced from `upsert_test_case`/`bulk_add_cases` step input via `groupKey` (`add-reusable-steps`) |
| `upsert_test_suite` | Create a suite (`projectKey` + `name`), or rename one by `suiteKey` |
| `update_suite_membership` | Add an existing case to an existing suite, or remove it (`suiteKey` + `caseKey` + `action`: `add`/`remove`) — requires `manageProject`. Repeating the same add/remove is a no-op, not an error (`add-mcp-suite-membership-tool`) |
| `bulk_add_cases` | Create many cases in one project as a single atomic batch — one invalid case fails the whole call, none are created. Accepts an optional `idempotencyKey` (`add-mcp-idempotency-keys`) |
| `create_test_run` | Create a run from a suite's cases and/or explicit `caseKeys`, optionally scoped to a Test Plan. Accepts an optional `idempotencyKey` (`add-mcp-idempotency-keys`) |
| `record_result` | Record a verdict (`pass`/`failed`/`skipped`/`blocked`) for a case within a run |
| `update_run_item_status` | Update a run item's status directly (e.g. request a `retest`), independent of recording a verdict |
| `search` | Cross-entity full-text search over cases, suites, runs, projects, releases, and test plans, restricted to projects you can access |
| `get_details` | Fetch the full record for one entity by `entityType` (`case`/`suite`/`run`/`project`/`release`/`testPlan`) and `key` |
| `get_run_progress` | A run's current status counts and pass rate |
| `list_projects` | Projects visible to you — a scoped token sees only its one project |

Every tool enforces the same permission model as REST: a scoped token can
only act within its project and granted permissions; an unscoped token acts
at its creator's current access, resolved fresh on every call — see
[API: Authentication](api.md#authentication).

### Retrying a create safely

`upsert_test_case` (create path only, not edits), `bulk_add_cases`, and
`create_test_run` accept an optional `idempotencyKey` string. If a call
times out and you retry it with the same key, the server recognizes the
retry and returns the original result instead of creating a second copy —
useful over an unreliable connection. Keys are scoped per caller and per
tool, expire after 24 hours, and only a *successful* call is ever cached:
a failed attempt (validation error, permission error) creates nothing, so
it's always safe to retry freely with the same key once the input is
fixed. Omitting `idempotencyKey` entirely preserves the exact prior
behavior — every call creates a new record, no dedup.

## Example: the flagship demo

*"Read `requirements.md` and create a test suite in TestPulse."* An agent
connected via MCP can do this in two calls: `upsert_test_suite` to create
the suite, then one `bulk_add_cases` call to populate it — atomically, so a
single malformed case doesn't leave a half-populated suite behind.
