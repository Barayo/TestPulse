# TestPulse Roadmap

> **TestPulse** — the open-source test management platform your AI agents can use as fluently as you do.

Each release has a *story*, not just a feature list. A feature belongs in a release only if it serves that release's story. Every rung is implemented as one or more [OpenSpec changes](openspec/changes/); changes are created when their rung comes up, not before.

Current status of every rung, one card per OpenSpec change (not per task — granular task tracking stays in each change's `tasks.md`), plus the unscheduled backlog, lives on the [TestPulse Backlog board](https://github.com/orgs/Barayo/projects/1).

## Release ladder

| Version | Story | OpenSpec changes |
|---------|-------|------------------|
| v0.0 | Walking skeleton | `establish-architecture` |
| **v0.1** | **MVP: agent-usable test management** | `add-core-domain`, `add-identity-basics`, `add-mcp-server` |
| v0.2 | Team-ready | `add-sso-oidc`, `add-project-rbac` |
| v0.3 | Insight | `add-reporting` |
| v0.4 | Connected | `add-jira-connector` |
| v0.5+ | Enterprise-curious | SAML, SCIM, advanced audit exports |

## v0.0 — Walking skeleton

A deployable, healthy, empty application proving the whole pipeline: monorepo, Go API + React UI, PostgreSQL with migrations, docker-compose, Helm, multi-arch images, CI, AGPLv3 + DCO.

## v0.1 — MVP: "an agent can manage your tests"

The differentiator ships first: the MCP server is *in* the MVP, because a generic test-CRUD tool is just a worse Kiwi TCMS. The demo: *"Claude, read `requirements.md` and create a test suite in TestPulse."* Server-side AI features are unnecessary at this stage — the MCP server outsources intelligence to the client's agent.

**In scope**

- `add-core-domain` — projects, test cases, test suites (n:m), test runs, per-case results (pass/fail/skip); REST API + a thin but complete UI (plain forms for writes, clean read views).
- `add-identity-basics` — local users (bcrypt), sessions, two roles (admin/member), **scoped API tokens for agents**, audit log recording actor identity (human or agent).
- `add-mcp-server` — MCP server in the API binary over the same service layer: create/query cases and suites, start runs, record results.

**Deliberately out**: SSO, 4-role RBAC, reporting beyond run summaries, connectors, server-side AI features.

**Settled v0.1 design decisions** (to be specced in the changes above):

- **Test case versioning**: every edit creates a new immutable version. A run pins each case to the latest version *at run creation* (or when the case is added to an open run) — never at execution time — so a run's results are internally consistent and reproducible. UI hints when a newer case version exists.
- **Run execution model**: a run is a collection of run items, each `{case@version, assignee, current_status}` with statuses `pending / pass / failed / skipped / blocked / retest` (`retest` = request to execute again, not a verdict). Each run item carries an **append-only result log** `{actor, timestamp, verdict, comment}` — never edited — which yields retest history, the human-or-agent audit trail, and the raw data for v0.3 flaky-test detection.
- **MCP tool surface**: hybrid, coarse-grained domain tools (~11), not a CRUD mirror and not workflow mega-tools: `upsert_test_case`, `upsert_test_suite`, `bulk_add_cases`, `create_test_run`, `record_result`, `update_run_item_status`, `search` (cross-entity FTS), `get_details`, `get_run_progress`, `list_projects`. `upsert` collapses create/update (safe under versioning); `bulk_add_cases` makes the flagship demo a single call; deletes are REST-only in v0.1. MCP tools are thin compositions over the same Go service layer as REST. Resources and prompts deferred as later sugar.
- **UI thickness**: thin everywhere except the **run execution board** — the one polished screen (assigned items, pinned case version, step-through, verdict + comment). Authoring gets plain forms; authoring is expected to flow increasingly through agents. Test case *detail* (viewing/editing a single case) was pulled forward from this thin tier by `redesign-case-detail-page` — a routed page with a content+sidebar layout, replacing the original fixed-width drawer — the same kind of conscious pull-forward `add-project-rbac` was from v0.2, prompted by a full-app UX audit.

**Validation**: dogfooding — TestPulse's own OpenSpec scenarios become the first project inside TestPulse, maintained by an agent via MCP. First user: us.

## v0.2 — Team-ready: "your whole team can log in"

- `add-sso-oidc` — OIDC (Auth Code + PKCE) against any external IdP, JIT provisioning, claim→role mapping, SSO-only enforcement toggle.
- `add-project-rbac` — **shipped**, pulled forward: one instance-wide Tenant Admin flag plus three project-scoped roles (Tester < Contributor < Project Admin), assignable to a user directly or via a Team, for humans and agents alike (an agent inherits its creator's current permission level). Fixed permission sets for now — a later release lets Tenant Admin customize them.

## v0.3 — Insight: "it tells you things you didn't know"

- `add-reporting` — pass-rate trends, run comparisons, flaky-test detection; exposed as a query API consumed equally by the UI and MCP agents.
  - **Status charts** (pass/failed/skipped/pending/error) for a run, and for a suite across its completed runs. The run-level chart is a thin rendering of data `add-core-domain` already exposes (`GET /runs/{id}/summary`); the suite-level view needs new domain work — runs aren't currently linked back to the suite they were created from (`add-core-domain` design D6: a suite is only a *source* for populating a run's items at creation, not a persisted relationship), so "this suite's completed runs" has to be designed, not just queried. Also needs a product decision: an `error` status doesn't exist in the current model (`pending/pass/failed/skipped/blocked/retest`) — decide whether it's a new status (e.g. "the test itself couldn't run," distinct from a `failed` assertion) or an alias for an existing one before implementing.

## v0.4 — Connected: "it meets your tools where they are"

- `add-jira-connector` — built as an *external* API/MCP client, not an in-process plugin (see design decision in `openspec/changes/establish-architecture/design.md`).

## v0.5+ — Enterprise-curious

SAML, SCIM provisioning, advanced audit exports, multiple simultaneous IdPs. Candidates for a future paid/hosted tier; the open core (including SSO) stays open.

## Backlog — ideas not yet scheduled to a rung

Tracked as [GitHub issues labeled `backlog`](https://github.com/Barayo/TestPulse/issues?q=is%3Aissue+is%3Aopen+label%3Abacklog) (and, once set up, a Project board) rather than here — issues carry status, discussion, and links to the PRs/OpenSpec changes that eventually pick them up, which flat markdown can't. This file stays the release-ladder narrative; ideas not yet scheduled to a rung live on GitHub.

## Open questions

- Per-release cut lines are re-evaluated when each rung's OpenSpec change is proposed.
