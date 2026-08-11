## Why

As a Tenant Admin issuing an API token for an agent integration, when I mint that token, I want the option to restrict it to a specific project and a named, reusable role (e.g. read-only, or whatever custom role fits), so a leaked or compromised token's blast radius is bounded — instead of always being a live, full-fidelity copy of my own current permission level, up to and including Tenant Admin.

Today's behavior is not a bug: `openspec/specs/authorization/spec.md`'s "Agent actors inherit their creator's permission level" requirement deliberately specifies that a token's effective permissions are resolved from its creator's *current* state at request time, with no scoping mechanism at all. That was the right default for a v0.1 agent story (one actor kind, no per-token nuance needed yet). It stops being sufficient once a token can be minted by a Tenant Admin: a single leaked token is then equivalent to a leaked Tenant Admin session, with no way to hand an integration only the one project and the one role's worth of permissions it actually needs. CLAUDE.md already describes these as "scoped API tokens" — this change makes that description true as an option, without breaking the existing default.

## What Changes

- `ApiToken` gains an optional scope: a `projectId` + `roleId`, reusing the exact same `roles` table (fully custom, instance-wide permission bundles) already used for human project members — not a second, parallel per-token permission concept. Omitted at creation (the default) means today's unchanged behavior — full inheritance of the creator's live permission level, including Tenant Admin. Additive and backward-compatible: every existing token continues to behave exactly as it does today.
- A fourth default role, `Viewer` (read-only, nothing else), is seeded alongside the existing Tester/Contributor/Project Admin — none of the three today is pure read-only, and "give me a read-only token" is the single most common scoping ask.
- `AuthenticateToken` resolves a scoped token's effective permissions as the intersection of its role's flags and its creator's *current* permissions on that project (a scope can't outlive a permission the creator themselves has since lost) — an intersection, not a separate grant.
- Token creation (API + `TokensPage.tsx` UI) gains an optional project + role picker (the same plain `<select>`-from-`/api/v1/roles` pattern `ProjectMembersPage.tsx` already uses for humans). A scoped token can only ever be created for a project the creating user currently has access to, and only with a role whose flags are already a subset of the creator's own current access.
- A scoped token's display (token list) shows its scope (project + role name) alongside name/prefix, so a Tenant Admin auditing tokens (their own or, per existing `authorization` behavior, another user's for offboarding) can see at a glance which tokens are full-trust and which are bounded, and to what.
- **Not a BREAKING change** — no existing token, integration, or API caller changes behavior; scoping is purely opt-in at creation time.

## Capabilities

### New Capabilities
(none — this extends two existing capabilities' requirements, not a new capability)

### Modified Capabilities
- `authentication`: "Scoped API tokens for agents" requirement gains an optional project + role scope at creation and a new scenario for authenticating with a scoped token.
- `authorization`: "Agent actors inherit their creator's permission level" requirement is amended — full inheritance stays the default (unscoped tokens, unchanged), with a new scenario for a scoped token's effective permissions being the intersection of its role's flags and its creator's current permissions.

## Impact

- **Backend**: new migration on `api_tokens` (nullable `project_id` + `role_id`, both FKs, `ON DELETE CASCADE` on both) plus a seeded `Viewer` role; `apps/api/internal/domain/domain.go` (`ApiToken`), `apps/api/internal/store/tokens.go`, `apps/api/internal/service/identity.go` (`AuthenticateToken`, token creation), `apps/api/internal/server` (token creation/list handlers).
- **Contract**: `packages/shared/openapi.yaml` — token creation request gains optional `projectId`/`roleId` fields; token response/list shape gains scope display fields. `make generate` after.
- **Frontend**: `apps/web/src/pages/TokensPage.tsx` — optional project + role picker on creation, scope shown in the token list.
- **Docs**: `docs/api.md`'s token section, `docs/test-management.md` or wherever agent-token usage is documented.
- **Sample Project**: per the standing rule, evaluate whether the Sample Project's showcase should demonstrate a scoped token (likely yes — a concrete example is the whole point of the showroom).
