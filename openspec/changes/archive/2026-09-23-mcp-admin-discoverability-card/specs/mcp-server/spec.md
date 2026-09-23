## ADDED Requirements

### Requirement: MCP discoverability in the admin UI
The web UI SHALL surface the MCP server's existence and authentication model in Instance Settings' Integrations section, so a Tenant Admin can discover it without leaving the app. The card SHALL state that the MCP server is available at `/mcp` and is authenticated using the same API tokens as the REST API, with a link to the Tokens page. The card SHALL NOT display a connection status indicator or a connected-agent count, since neither can be derived honestly from the current stateless, session-less MCP transport. The card SHALL reflect the real `TESTPULSE_MCP_ENABLED` config state (exposed via `GET /api/v1/meta`'s `mcpEnabled` field), rather than unconditionally claiming the server is available.

#### Scenario: Admin discovers MCP from Instance Settings
- **WHEN** a Tenant Admin opens Instance Settings
- **THEN** the Integrations section shows an "MCP" card stating the server is available at `/mcp` and authenticated with API tokens, alongside the existing Jira card

#### Scenario: MCP card links to token management
- **WHEN** a Tenant Admin clicks the MCP card's token link
- **THEN** the app navigates to the Tokens page

#### Scenario: Card shows no fabricated status or count
- **WHEN** a Tenant Admin views the MCP card
- **THEN** no up/down indicator or connected-agent count is shown, since the MCP transport is stateless and has no connection registry to report from

#### Scenario: Card shows enabled state when the mount is active
- **WHEN** the instance is running with `TESTPULSE_MCP_ENABLED` unset or `true`
- **THEN** the MCP card states the server is currently enabled

#### Scenario: Card shows disabled state when the mount is inactive
- **WHEN** the instance is running with `TESTPULSE_MCP_ENABLED=false`
- **THEN** the MCP card states the server is currently disabled, rather than continuing to claim it's available at `/mcp`

### Requirement: Public MCP availability badge
The web UI SHALL surface a small, non-interactive "MCP" indicator in the app-wide health/version footer (`HealthBadge`), visible to every visitor including unauthenticated ones, when the instance has MCP enabled. The indicator SHALL NOT render when MCP is disabled, and SHALL NOT display a connection status, session count, or any data beyond the plain fact that the MCP mount is enabled.

#### Scenario: Anonymous visitor sees the MCP badge on a public page
- **WHEN** an unauthenticated visitor views a page using the public layout (e.g. the login page) on an instance with MCP enabled
- **THEN** the footer shows an "MCP" badge alongside the version and system-status indicators

#### Scenario: Badge absent when MCP is disabled
- **WHEN** any visitor, authenticated or not, views the footer on an instance with `TESTPULSE_MCP_ENABLED=false`
- **THEN** no MCP badge is shown, and no other part of the footer changes

#### Scenario: Badge shows no live connection data
- **WHEN** any visitor views the MCP badge
- **THEN** it shows only the label "MCP" with a static descriptive hover title — no count, no up/down state, no link
