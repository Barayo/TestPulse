## 1. Search index migration

- [x] 1.1 Write a new incremental migration file under `apps/api/internal/db/migrations/` adding generated `tsvector` columns + GIN indexes for cases, suites, runs, projects, releases, and test plans (goose, additive only, never edit a shipped migration).
- [x] 1.2 Verify the migration applies cleanly via `make test-db-up` against a fresh DB and against an existing seeded DB (upgrade path).

## 2. Service layer: bulk_add_cases (TDD)

- [x] 2.1 Write a failing test for `Service.BulkAddCases` covering: all-valid batch succeeds, one invalid case rolls back the entire batch with an error naming the failing case/field, permission enforcement matches `CreateCase` (neither checks permissions internally — enforcement is the caller's job, same as REST's `requirePermission` middleware; see task 6/7's `Authorize` helper for MCP's equivalent).
- [x] 2.2 Implement `Service.BulkAddCases` as a single DB transaction to make the tests pass.

## 3. Service layer: search (TDD)

- [x] 3.1 Write a failing test for `Service.Search` covering: cross-entity matches (case + project in one query), relevance ranking, project scoping.
- [x] 3.2 Implement `Service.Search` querying the new `tsvector` indexes across all six entity types, filtered by the caller-supplied projectIDs, to make the tests pass. (Actor→projectIDs resolution lives in the MCP tool layer, task 7 — `Search` itself trusts its caller, matching every other project-scoped service method.)

## 4. Service layer: get_details (TDD)

- [x] 4.1 Write a failing test for `Service.GetDetails` covering: valid `{entity_type, key}` for each of the six entity types returns the full record, type/key mismatch returns a clear error (indistinguishable from not-found, by design — never leaks cross-type existence).
- [x] 4.2 Implement `Service.GetDetails` routing to the existing `*ByKey` lookups (`project_rbac.go`) to make the tests pass. (Permission enforcement is the MCP tool layer's job, task 7 — matches every other project-scoped service method's division of labor.)

## 5. Config and server wiring

- [x] 5.1 Add `TESTPULSE_MCP_ENABLED` to `apps/api/internal/config/config.go` (doc comment, `getenv`, `withDefault(true)`), following the existing config pattern.
- [x] 5.2 Thread the config value through `apps/api/cmd/testpulse-api/main.go` into `server.New`.
- [x] 5.3 Write a failing test asserting `/mcp` is unmounted when `TESTPULSE_MCP_ENABLED=false` (falls through to the SPA handler, not 404 — this app's NotFound is an SPA fallback, not a real 404), and mounted (behind real auth, 401 unauthenticated) when true.

## 6. MCP server package

- [x] 6.1 Add `github.com/modelcontextprotocol/go-sdk` to `apps/api/go.mod`.
- [x] 6.2 Create `apps/api/internal/mcp/` package: server setup over Streamable HTTP (stateless mode — each tool call is one authenticated HTTP POST, matching a scoped API token's model). No separate auth middleware was needed: mounting inside the same authenticated chi group as `/api/v1` means `authenticate(svc)` already injects the `domain.Actor` onto the request context before the MCP handler ever runs, and the SDK's stateless transport derives its per-call context from that same `req.Context()`. Added `Service.Authorize`/`AccessibleProjects`/`AccessibleProjectIDs` (project_rbac.go) as the MCP tool layer's equivalent of REST's `requirePermission` middleware, since service methods themselves don't check permissions (that's the caller's job, discovered while implementing task 2).
- [x] 6.3 Mount the MCP server at `/mcp` in `apps/api/internal/server/server.go`, gated by the enabled config from task 5.

## 7. MCP tools (TDD via SDK client, one sub-task per tool per spec's requirements)

- [x] 7.1 Write integration tests (using the official SDK's MCP client, in-process, real Streamable HTTP, `TESTPULSE_TEST_DATABASE_URL` gate) for every scenario in `specs/mcp-server/spec.md`, grouped by tool — `apps/api/internal/mcp_test/` (separate package from `internal/mcp` to avoid an import cycle through `internal/server`, which imports `internal/mcp`).
- [x] 7.2 Implement `upsert_test_case` tool wrapping `CreateCase`/`EditCase`.
- [x] 7.3 Implement `upsert_test_suite` tool wrapping `CreateSuite`/`RenameSuite`.
- [x] 7.4 Implement `bulk_add_cases` tool wrapping `Service.BulkAddCases` (task 2).
- [x] 7.5 Implement `create_test_run` tool wrapping `CreateRun`.
- [x] 7.6 Implement `record_result` tool wrapping `RecordResult`.
- [x] 7.7 Implement `update_run_item_status` tool wrapping `UpdateItem`.
- [x] 7.8 Implement `search` tool wrapping `Service.Search` (task 3).
- [x] 7.9 Implement `get_details` tool wrapping `Service.GetDetails` (task 4).
- [x] 7.10 Implement `get_run_progress` tool wrapping `RunSummary`.
- [x] 7.11 Implement `list_projects` tool wrapping the new `Service.AccessibleProjects` (task 6, not raw `ListProjects` — `ListProjects` doesn't narrow to a scoped token's single project, so list_projects needed the same scoping helper `search` uses).
- [x] 7.12 Confirm no delete/removal tool is registered (spec's "No delete operations via MCP" requirement) and add a test asserting the tool list excludes any delete operation.
- [x] 7.13 Run the full suite and confirm all tests from 7.1 pass — 15/15 pass (`go test ./internal/mcp_test/...`).

## 8. Documentation

- [x] 8.1 Write a new MCP quickstart page in `docs/` (connecting an agent to `/mcp`, creating/using a scoped or unscoped API token, tool reference table for all ~11 tools) — `docs/mcp-server.md`. Also fixed a stale "MCP server (arriving in v0.1)" line in `docs/api.md` and added `TESTPULSE_MCP_ENABLED` to `docs/deployment.md`'s config table.
- [x] 8.2 Add the new page to `docs/README.md`'s index.
- [x] 8.3 Update `ROADMAP.md`'s v0.1 section to mark `add-mcp-server` as shipped (it's currently noted as scoped-but-unimplemented). Also fixed the stale "turned out not to actually be implemented" aside under v0.4's Jira connector entry.

## 9. Sample Project showcase

- [x] 9.1 Confirmed: re-read current `apps/api/internal/sampledata/seed.go` in full. It already seeds everything every MCP tool needs to demonstrate against — cases across multiple folders (`upsert_test_case`/`bulk_add_cases`/`search`/`get_details` targets), suites including Smoke/Regression/Nightly/API Contract (`upsert_test_suite`, `create_test_run` from a suite), a Release with two Test Plans (`create_test_run` scoped to a Test Plan, `get_details` for release/testPlan), both open and closed runs with recorded results (`record_result`, `update_run_item_status`, `get_run_progress`), and even a seeded unscoped ("ci-pipeline") and scoped ("status-dashboard") API token precedent (though the actual secret isn't retrievable after creation — a user still creates their own per the docs). No new seed data needed; nothing to add here per the standing Sample-Project-showcase rule.
- [x] 9.2 Point the docs quickstart (task 8.1) at the Sample Project as the "connect your agent here" walkthrough. (`docs/mcp-server.md`'s "Connecting" section, step 3.)

## 10. Verification

- [x] 10.1 Run `make coverage-api` and confirm `internal/...` stays ≥ 80%. (80.8%.)
- [x] 10.2 Run `make lint` and `make build`. (Fixed one staticcheck QF1008 finding — dropped a redundant embedded-field selector.)
- [x] 10.3 Rebuilt and redeployed `docker-compose` from scratch with this change's code, then drove the real MCP server at `http://localhost:8080/mcp` with the official SDK's own client (a standalone Go QA script, not the automated test suite) as two different real API tokens — an unscoped admin token and a read-only project-scoped token created via REST the same way any real user would. 35/35 manual checks passed: auth rejects missing/invalid tokens; exactly 10 tools registered, none named `*delete*`; `list_projects`/`search`/`get_details` (including the unknown-entity-type error path); `upsert_test_case` create→edit (version bump confirmed) and empty-title rejection; `bulk_add_cases` all-valid and atomic-rollback-on-invalid-case (confirmed via the tool's own error, matching the automated tests); `upsert_test_suite` create+rename; `create_test_run`/`get_run_progress`; `record_result` (including invalid-verdict rejection) and `update_run_item_status`; and, with the scoped token, `list_projects` narrowed to exactly its one project, `search` results all confined to that project, and `upsert_test_case` denied with "insufficient permissions." No defects found.
- [x] 10.4 Second QA round: registered the live server as a real MCP connection in Claude Code itself (`claude mcp add --transport http`) — the most authentic client available — and found a real interop bug the permissive Go SDK test client had missed: `bulk_add_cases`/`search`/`list_projects` returned bare JSON arrays as structured output (`outputSchema.type: ["null","array"]`), which Claude Code's client rejects (`Connected · tools fetch failed`); the official SDK permits arrays per SEP-2106, but real-client compatibility wins, so all three now wrap their output in a named object (`BulkAddCasesOutput.cases`, `SearchOutput.results`, `ListProjectsOutput.projects`). Also fixed while in there, each covered by a new automated test: every `*ByKey` lookup across all 10 tools propagated the store's bare `"not found"` with zero context (now `<kind> "<key>" not found`, 17 call sites via a shared `notFoundf` helper); `get_details`' unknown-entityType error referenced a param name (`entity_type`) that didn't match the actual field (`entityType`); no tool carried `ToolAnnotations` (`readOnlyHint`/`destructiveHint`/etc.) — the hints real MCP clients use to decide whether a call needs confirmation; the server sent no `Instructions`, so an agent had to trial-and-error its way to the key format and fixed vocabularies (priority/verdict/status) instead of being told upfront. Reconnected Claude Code after each fix; final state is `✔ Connected` (not just "connected, tools fetch failed"). 22/22 automated MCP tests still pass, `make lint`/`make coverage-api` (80.9%) still green. Deferred as scope decisions, not bugs (see conversation for full write-up): raw-JSON `content` text instead of a human-readable summary, internal `id` fields alongside `key` in every output, no pagination on `search`/`list_projects`, no run-item enumeration tool, no suite-membership-edit tool, no idempotency keys on create-style calls.
