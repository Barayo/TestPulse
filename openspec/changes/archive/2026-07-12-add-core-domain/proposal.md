# Add Core Domain

## Why

TestPulse's walking skeleton (v0.0) proved the pipeline but manages nothing. This change delivers the core test management domain — projects, versioned test cases, suites, runs, and results — turning TestPulse into a usable (single-user, unauthenticated) test management tool and unblocking the rest of the v0.1 MVP: `add-identity-basics` needs resources to protect, and `add-mcp-server` needs a service layer to expose.

## What Changes

- PostgreSQL schema (goose migrations) for the domain: projects, test cases with **immutable versioning**, suites (n:m with cases), runs, run items, and append-only result logs.
- Go service layer + REST API under `/api/v1`: CRUD for projects/cases/suites, run creation with case-version pinning, result recording, run-item status management, and a run summary endpoint (counts by status).
- OpenAPI contract extended for all new endpoints (`packages/shared/openapi.yaml`), regenerated TypeScript client.
- Web UI: thin authoring forms (projects, cases, suites) and the **run execution board** — the one polished screen (assigned items, pinned case version, step-through, verdict + comment).
- Test coverage per CLAUDE.md: every spec scenario becomes an automated test (unit/integration/E2E), coverage gates stay ≥ 80%.
- Docs updated: `docs/api.md`, `docs/architecture.md` domain section, and a new `docs/test-management.md` user guide.

**Explicitly out of scope**: authentication/authorization (endpoints are open until `add-identity-basics` — acceptable only because v0.1 is not yet a public deployment target), MCP server, trends/advanced reporting, Jira connectors, test case attachments.

## Capabilities

### New Capabilities

- `test-authoring`: Creating and organizing test assets — projects, test cases (title, description, steps, expected result, priority, tags) with immutable versioning on every edit, and suites grouping cases n:m.
- `test-execution`: Planning and executing test runs — run creation pinning case versions, run items with assignee and status lifecycle (`pending/pass/failed/skipped/blocked/retest`), append-only result logs, and run summaries.

### Modified Capabilities

<!-- None — platform-deployment requirements are unchanged. -->

## Impact

- **Code**: new Go packages under `apps/api/internal/` (domain, storage, HTTP handlers); new React routes/screens in `apps/web`; first real schema migrations.
- **API**: `/api/v1` grows from one meta endpoint to the full domain surface. No breaking changes (nothing existed).
- **Database**: first real tables; migrations remain automatic and idempotent.
- **Security posture**: endpoints are open pending `add-identity-basics` — documented in README/docs.
- **Follow-ups unblocked**: `add-identity-basics`, `add-mcp-server`.
