## 1. MCP card in Instance Settings

- [x] 1.1 Write a failing test in `apps/web/src/pages/InstanceSettingsPage.test.tsx` (new `describe('MCP integration (mcp-admin-discoverability-card)')` block, alongside the existing `describe('Jira integration (add-jira-connector)')`) asserting: the Integrations section renders an "MCP" card with text stating the server is available at `/mcp` and authenticated with API tokens, and a link to `/settings/tokens`; the card renders no status indicator or count (assert absence of any up/down/connected/online/offline text).
- [x] 1.2 Run the test, confirm it fails (card doesn't exist yet).
- [x] 1.3 In `apps/web/src/pages/InstanceSettingsPage.tsx`, added a second `Card` inside the existing `Integrations` `<section>` (after the Jira card, same section, same `LinkIcon` header — no new section needed): title "MCP", body text "TestPulse exposes an MCP server at `/mcp`, authenticated with the same API tokens as the REST API.", and a `Link` (imported from `react-router`, matching this codebase's convention) to `/settings/tokens` reading "Manage tokens".
- [x] 1.4 Run the test, confirm it passes. Ran the full `InstanceSettingsPage` test suite: 35/35 green, no regressions.

## 2. Documentation

- [x] 2.1 Checked `docs/development.md` (no MCP or admin-UI mention at all — nothing to update) and `docs/test-management.md` (mentions "Instance Settings → Integrations" only in passing, in the unrelated case-level Jira-link feature description — not a tour of the section, nothing to update). Found a better, more specific home: `docs/mcp-server.md`'s existing "Connecting" section already documents exactly this (`/mcp` + API token auth) for a technical audience — added a short paragraph there noting the same summary is now also surfaced in-product via Instance Settings → Integrations.

## 3. Full verification

- [x] 3.1 Ran `make lint`: exit 0, clean (no new warnings in `InstanceSettingsPage.tsx`).
- [x] 3.2 Ran `make coverage-web`: exit 0, 90.31%/83.42%/88.47%/92.94% (statements/branches/functions/lines), all above the 80% gate.
- [x] 3.3 Deployed locally (rebuilt web + API, `docker compose up --build -d app`). Verified live in a real browser as a Tenant Admin at `/settings/instance`: the MCP card renders in Integrations right below Jira with the exact copy and "Manage tokens" link; clicking it navigated to `/settings/tokens`.

## 4. Follow-up: real enabled/disabled state (not fabricated data)

User question after review: "why not a status pointing to /mcp?" surfaced a real gap the static-only card (group 1) had — `TESTPULSE_MCP_ENABLED=false` genuinely unmounts `/mcp` (404), and the card was unconditionally claiming it's available regardless. This closes that gap with real config state, not a live connection ping (still rejected — see design.md).

- [x] 4.1 Backend: write a failing test `TestMetaMCPEnabledReflectsServerConfig` (`apps/api/internal/server/server_test.go`) asserting `GET /api/v1/meta`'s `mcpEnabled` field matches the `mcpEnabled` param `server.New` is constructed with, both `true` and `false`. Confirmed RED (field didn't exist).
- [x] 4.2 Implement: `handleMeta` (`apps/api/internal/server/server.go`) takes a third `mcpEnabled bool` param (the same value already gating the `/mcp` mount) and includes it in the response body; updated its one call site. Confirmed GREEN, plus the adjacent `TestMCPMountedWhenEnabled`/`TestMCPNotMountedWhenDisabled`/other Meta tests still pass.
- [x] 4.3 Contract: added `mcpEnabled: boolean` (required) to the `Meta` schema in `packages/shared/openapi.yaml`, matching the existing `publicProjectsEnabled` kill-switch precedent exactly. Ran `make generate`, confirmed `packages/shared/src/api.ts` picked up the field with no drift.
- [x] 4.4 Frontend hook: write a failing test in `apps/web/src/lib/useAuth.test.tsx` asserting `useAuth()` resolves `mcpEnabled` from `GET /api/v1/meta`, defaulting to `true`. Confirmed RED.
- [x] 4.5 Implement: added `mcpEnabled` state to `AuthProvider` (`apps/web/src/lib/useAuth.tsx`), wired into the mount-time meta fetch (and its catch-block fallback) and the context value, mirroring `publicProjectsEnabled`'s exact pattern (`!== false` safe-default, same fetch, same defaulting reasoning). Confirmed GREEN; full `useAuth` suite (23 tests) green.
- [x] 4.6 Frontend card: write failing tests in `InstanceSettingsPage.test.tsx` (extended `mockAsTenantAdmin` with an `mcpEnabled` param plus a `/api/v1/meta` branch, since the card reads this via `useAuth()`, a separate fetch from `/api/v1/instance-settings`) asserting the card shows "Enabled"/"enabled" text when true and "Disabled"/"disabled" text when false. Confirmed RED.
- [x] 4.7 Implement: `InstanceSettingsPage.tsx` reads `mcpEnabled` from `useAuth()` and appends "Currently enabled." or "Currently disabled — set `TESTPULSE_MCP_ENABLED=true` to turn it back on." to the card's existing body text — no new component, no badge, consistent with the calm textual style established in group 1. Confirmed GREEN; full `InstanceSettingsPage` suite (37 tests) green.
- [x] 4.8 Update `design.md` and this change's `specs/mcp-server/spec.md` to reflect the revised decision (config-state indicator, not a live connection status — the two aren't in tension) and add the two new enabled/disabled scenarios.
- [x] 4.9 Full regression sweep: web (`npx vitest run`, 138 files / 1791 tests) green; Go (`go build ./... && go test ./...`) green; `make lint` exit 0, no new warnings in touched files.

## 5. Public availability badge (HealthBadge)

User request: a public-facing signal that MCP is available, not just the admin-only Instance Settings card — "maybe to the bottom side to version." Design reviewed by Pepe (mock published via Artifact), then gated by Jose (architecture) and Luis (security) before implementation, per this project's standing review-before-implementing practice.

Jose's finding: `HealthBadge` should read `mcpEnabled` from `useAuth()`'s existing context (already the canonical source, already consumed by `InstanceSettingsPage.tsx`) rather than a second independent parse of its own raw `/api/v1/meta` fetch — avoids two independently-timed resolutions of the same field. Luis's finding: no new information-disclosure concern — `mcpEnabled` is already unauthenticated-readable via `/api/v1/meta`, and the `/mcp` mount state is already distinguishable via an unauthenticated probe (`POST /mcp` returns a different response shape depending on whether it's mounted) — the badge surfaces an already-public fact, it doesn't create a new oracle.

- [x] 5.1 Write failing tests in a new `apps/web/src/components/HealthBadge.test.tsx` (none existed — coverage was previously only indirect, via `App.test.tsx`) asserting an "MCP" badge renders when `mcpEnabled` is true and is absent when false, using a real `AuthProvider` + mocked `api.GET('/api/v1/meta')` (matching this codebase's established `useAuth`-consumer test pattern, e.g. `InstanceSettingsPage.test.tsx`).
- [x] 5.2 Run the tests, confirm RED (badge doesn't exist; the "absent when false" case trivially passes since nothing renders either way).
- [x] 5.3 Implement in `apps/web/src/components/HealthBadge.tsx`: `const { mcpEnabled } = useAuth()` (Jose's fix, not a second fetch), then a third `<Badge variant="outline" title="This instance exposes an MCP server for AI agents at /mcp.">MCP</Badge>` in the existing `flex items-center gap-2` row, rendered only when `mcpEnabled` is true — matching the existing conditional-badge idiom (`Archived`) elsewhere in the app, no icon, no link, no new visual style.
- [x] 5.4 Run the tests, confirm GREEN.
- [x] 5.5 Full regression sweep surfaced 30 failures across 4 test files (`AuthLayout.test.tsx`, `ForgotPasswordPage.test.tsx`, `RequiredPasswordChangePage.test.tsx`, `ResetPasswordPage.test.tsx`) — all rendered `AuthLayout`/pages using it without a real `AuthProvider`, which worked before only because `HealthBadge`'s own internal fetches were self-contained and error-swallowing; now that it calls `useAuth()` directly (which throws outside a provider), these needed a real `AuthProvider` wrapper. Fixed at the correct level (added the missing provider + `GET` mock to each, not reverted the architectural fix) — this is expected collateral of correctly promoting `HealthBadge` to shared context, per Jose's recommendation, not a design flaw.
- [x] 5.6 Full regression sweep: web (`npx vitest run`, 139 files / 1793 tests) green; `make lint` exit 0, no new warnings; `make coverage-web` exit 0 (90.32%/83.43%/88.47%/92.95%, all above the 80% gate).
- [x] 5.7 Deployed locally (rebuilt web + API, `docker compose up --build -d app`). Verified live in a real browser: the "MCP" badge renders next to "v0.0.1 · System ready" on both the fully public, unauthenticated `/login` page (confirming true public visibility, not just authenticated) and the authenticated app shell's footer (`/projects/SP`).

## 6. Visual fix: active-state tint, not outline

User feedback on the shipped result: "this badge on grey for MCP makes it look disconnected." Pepe reviewed the live render (not just the code) and confirmed a category-of-treatment problem: `variant="outline"` is this codebase's established vocabulary for an *ended/closed* state (Archived, Closed runs, EOL releases) — sitting a hollow badge next to the solid-fill "System ready" pill read as "the off one," even though the badge only renders when `mcpEnabled` is true.

- [x] 6.1 Write a failing test in `HealthBadge.test.tsx` asserting the MCP badge does NOT carry `data-variant="outline"` and does carry `bg-primary/10`/`text-primary` classes — the same "currently active" treatment `ReleaseStatusBadge.tsx`'s "Active" state already uses. Confirmed RED.
- [x] 6.2 Implement: dropped `variant="outline"` in favor of `className="border-transparent bg-primary/10 text-primary"` (no `variant` prop — defaults to `default`, then `className` overrides its fill via `twMerge`), matching `ReleaseStatusBadge.tsx`'s exact "Active" pattern. No icon (matching `Pills.tsx`'s icon-free "Auto" pill, the closest existing precedent for "an active capability"). Everything else unchanged: still gated on `mcpEnabled`, no link, same tooltip.
- [x] 6.3 Run the tests, confirm GREEN. Full regression sweep: web (139 files / 1794 tests) green, `make lint` exit 0, `make coverage-web` exit 0 (90.32%/83.45%/88.47%/92.95%).
- [x] 6.4 Deployed locally, verified live on `/login`: badge now reads as a solid teal tint matching "System ready"'s hue, no border — matches Pepe's revised mock exactly.
