## Why

As a Tenant Admin, when I check what's connected to this instance, I want to know that TestPulse's MCP server exists and how to authenticate to it — today there is no mention of MCP anywhere in the admin UI, even though it's the product's stated core differentiator.

## What Changes

- Instance Settings' existing Integrations section gains a second card, "MCP", alongside the existing Jira card: states that TestPulse exposes an MCP server at `/mcp`, authenticated with the same API tokens as REST, with a link to the Tokens page.
- No status/health indicator (up/down or connection count) — investigated and rejected as unbuildable honestly today; see design.md.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `mcp-server`: adds a requirement that the MCP server's existence and authentication model be discoverable from the admin UI, not just from documentation.

## Impact

- **Frontend only**: `apps/web/src/pages/InstanceSettingsPage.tsx`, plus its test file.
- No backend, API contract, or migration changes.
- `docs/test-management.md` or `docs/development.md` (wherever MCP/admin settings are documented) checked for an update describing the new card.
- No Sample Project showcase task — this is an always-present instance-wide admin card, not project-scoped content; nothing for `seed.go` to demonstrate.
