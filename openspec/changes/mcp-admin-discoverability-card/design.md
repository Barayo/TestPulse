## Context

Pepe's dashboard-enrichment design review evaluated a "MCP server status badge" idea for the admin section and concluded the literal badge (up/down, connected-agent count) isn't buildable honestly today — see the rejected alternatives below. What's real and worth shipping is discoverability: an admin has no way today to learn from the UI that MCP exists or how to authenticate to it.

## Goals / Non-Goals

**Goals:**
- Make MCP's existence and auth model discoverable from Instance Settings.
- Ship something honest — no fabricated metrics.

**Non-Goals:**
- An up/down status indicator.
- A "connected agents" count.
- An instance-wide token listing (filed separately as backlog issue #202 — this change does not depend on it and does not attempt a token count).

## Decisions

**No *live connection* status indicator, because there is no independent failure mode to report.** `apps/api/internal/mcp/mcp.go`'s own doc comment describes MCP as "a thin layer over `service.Service`," mounted in the same authenticated chi group as `/api/v1`, sharing the exact same middleware. If the admin page rendering a badge loaded at all, MCP is trivially "up" the same way the page itself is. An indicator here would either always read "Up" (dead weight) or duplicate the existing `/healthz` endpoint. Alternative considered: poll `/healthz` and show it as an "MCP" badge anyway for visual reassurance — rejected as actively misleading, since it measures the wrong thing under the MCP label.

**Revised after initial ship: the mount *does* have one real, independent, checkable state — `TESTPULSE_MCP_ENABLED=false` unmounts `/mcp` entirely (404, per the `mcp-server` spec's own "MCP mount disabled by config" scenario).** The first version of this card stated "TestPulse exposes an MCP server at `/mcp`" unconditionally, which is simply false on an instance where an admin deliberately disabled it — not a design tradeoff, a defect. Fixed by exposing the same `mcpEnabled bool` the server already computes (`config.go:106`, already passed into `server.New` and used to gate the `/mcp` mount itself) on `GET /api/v1/meta`, the same unauthenticated-kill-switch pattern `publicProjectsEnabled` already established there. The card now reads this via `useAuth()`'s `mcpEnabled` field (mirroring `publicProjectsEnabled`'s existing wiring exactly: same fetch, same `!== false` safe-default reasoning, defaulting to `true` since that's the server's own default) and shows "Currently enabled." or "Currently disabled — set `TESTPULSE_MCP_ENABLED=true` to turn it back on." This is a config-state fact, not a live connection status — it doesn't contradict the "no fabricated up/down" decision above, it closes a real accuracy gap the static-only version had.

**No "connected agents" count, because MCP has no connection/session registry.** `NewHTTPHandler` sets `Stateless: true` on `StreamableHTTPOptions` — every MCP call, including tool calls, is a single stateless authenticated POST, not a session. There is nothing to count. Alternative considered: count distinct API tokens that have ever made an MCP call — rejected for this change since it needs new tracking (which transport a token used) that doesn't exist yet; flagged as a real future gap in Risks below, not solved here.

**Card content: static text + a link, not dynamic data.** "MCP available at `/mcp`, authenticated with the same API tokens as REST" plus a link to `/settings/tokens`. Matches the existing Jira card's shape exactly (`CardHeader`/`CardTitle`/`CardContent`, `Card` component, same `Integrations` section) — no new visual idiom introduced.

**Placement: Instance Settings → Integrations, not near the Tokens page.** `AdminShell.tsx`'s own existing comment explains Tokens is deliberately kept outside the admin shell because it only shows the caller's own tokens — there's nothing "admin" about it. Integrations is the section a Tenant Admin already checks for "what's connected to this instance."

**Second revision: a small public-facing signal, separate from the admin card.** User request: a badge near the version footer, visible to everyone, not just admins in Instance Settings. `HealthBadge.tsx` (mounted on both the authenticated `Layout.tsx` and the public `AuthLayout.tsx`) already fetches `/api/v1/meta` for `version` — already reaching an anonymous audience. Pepe designed a third `<Badge variant="outline">MCP</Badge>` in that same row, rendered only when `mcpEnabled` is true (silent when off — an admin's deliberate config choice isn't a fault worth a persistent "off" chip on every anonymous visitor's screen, and there's nothing a public viewer could act on either way). Gated by Jose (architecture) and Luis (security) before implementation:
- **Jose:** source `mcpEnabled` via `useAuth()`'s existing context field, not a second independent parse of `HealthBadge`'s own `/meta` fetch — `mcpEnabled` already graduated to canonical shared state (`InstanceSettingsPage.tsx` already consumes it that way); a second resolution path for the same field is an avoidable inconsistency.
- **Luis:** no new information-disclosure concern. `mcpEnabled` is already unauthenticated-readable via `/api/v1/meta`, and whether `/mcp` is mounted is *already* distinguishable by an anonymous party via a direct, unauthenticated `POST /mcp` (401-JSON-with-auth-middleware vs. SPA-fallback-html, per `TestMCPMountedWhenEnabled`/`TestMCPNotMountedWhenDisabled`) — the badge surfaces an already-public, already-probeable fact in the UI, it doesn't create a new oracle. Nothing sensitive rides along (no token, no tool list, no tenant data).

## Risks / Trade-offs

- [Risk] A future "N active agent tokens" or "last MCP write" version of this card needs two separate prerequisites that don't exist yet: an instance-wide token listing (backlog #202) and a way to distinguish MCP-originated writes from REST-originated ones in the audit trail (`s.audit()` calls don't currently record transport). → Mitigation: none needed for this change — explicitly out of scope; noted here so a future card doesn't silently assume this data exists.
- [Risk] A static card with no dynamic data could look like an incomplete feature rather than a deliberate choice. → Mitigation: copy is written as informational/reference content (how to connect), not as a placeholder for a metric — reads as complete on its own terms.

## Migration Plan

None — no data migration. **Revised:** the enabled/disabled addition is a small, additive `GET /api/v1/meta` contract change (`mcpEnabled: boolean`, required, matching `publicProjectsEnabled`'s existing precedent) — backward compatible, no breaking change, no version bump needed.
