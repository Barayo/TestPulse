## Why

As an agent that has already created a test case and an existing suite, when I want to add that case to the suite (or remove one), I want an MCP tool for that, so I don't have to re-create the suite via `upsert_test_suite` or rely on `create_test_run`'s indirect case list as a workaround. Today `upsert_test_suite` only creates or renames a suite — there is no MCP equivalent of REST's `PUT /suites/{suiteKey}/cases/{caseKey}` / `DELETE /suites/{suiteKey}/cases/{caseKey}` (suite-membership editing), gated by `domain.PermSuiteEditMembership`. Confirmed: the MCP tool surface today is 11 tools (7 write, 4 read; verified by reading `write_tools.go`/`read_tools.go` registration directly — `docs/mcp-server.md`'s "Twelve" prose and `ROADMAP.md`'s stale name list are both wrong independent of this change and will be corrected as part of it), none of which cover this operation.

## What Changes

- Add one new MCP write tool, `update_suite_membership`, wrapping the existing `Service.AddCaseToSuite`/`Service.RemoveCaseFromSuite` methods (`apps/api/internal/service/service.go:1113-1138`), gated by `domain.PermSuiteEditMembership` — the same permission REST's own `addCaseToSuite`/`removeCaseFromSuite` handlers already enforce.
- One tool, not two: an `action` field (`"add"` or `"remove"`) alongside `suiteKey`/`caseKey`, matching REST's own two-verbs-one-resource shape and the codebase's existing "coarse-grained, one tool per resource" tool-surface philosophy (ROADMAP.md's settled MCP design decision) rather than adding two single-purpose tools.
- Adding the same case twice, or removing a case that isn't a member, are no-ops (not errors) — matching the store layer's existing `ON CONFLICT DO NOTHING` / plain `DELETE` semantics exactly (`apps/api/internal/store/suites.go:379-390`), so the new tool doesn't invent new error behavior REST doesn't have.
- Result returns the suite's current membership as case **keys**, not internal UUIDs — deliberately not repeating the pre-existing internal-ID leak in `get_details`'s suite result (a separate, already-filed issue, #148) in newly-written code.
- Correct `docs/mcp-server.md`'s tool count/table (currently says "Twelve" with an 11-row table) and `ROADMAP.md`'s stale MCP tool name list (predates `add-reusable-steps`, missing `upsert_step_group`) while adding the twelfth tool, so both documents reflect the real, current tool surface going forward.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `mcp-server`: adds the `update_suite_membership` tool requirement.

## Impact

- **Affected code**: `apps/api/internal/mcp/write_tools.go` (new `UpdateSuiteMembershipInput` + handler, following `upsertTestSuite`'s exact structure as template), tool registration in `registerWriteTools` (write_tools.go:53-89), `apps/api/internal/mcp_test/mcp_scenarios_test.go` (new scenario tests).
- **No REST/openapi.yaml impact**: MCP tool schemas live directly in Go code (established precedent from `add-mcp-idempotency-keys`); the underlying REST routes and service methods already exist unchanged.
- **No migration needed**: reuses existing `Service.AddCaseToSuite`/`RemoveCaseFromSuite` and their existing store-layer implementation as-is.
- **Docs**: `docs/mcp-server.md` (new tool's table row + tool count correction), `ROADMAP.md` (MCP tool surface line, correcting the stale name list and count).
- **Sample Project**: exempt per CLAUDE.md's standing rule — no new user-facing product surface, only a new agent-facing MCP tool wrapping an already-shipped REST capability the Sample Project already demonstrates via REST.
