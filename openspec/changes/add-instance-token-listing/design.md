## Context

`ApiTokenRepo` (`apps/api/internal/store/tokens.go`) already has `ListByCreator` (one user's tokens) and `Get`/`Revoke` (single-token ownership checks). `Service.ListTokensForUser` already has the exact Tenant-Admin-bypass shape this change needs (`actor.ID != userID && !actor.IsTenantAdmin → forbidden`), just scoped to one user at a time via REST's `GET /api/v1/tokens?userId=`. There is no "every token, every user" query anywhere.

`domain.ApiToken` carries only raw IDs (`CreatedBy`, `ProjectID`, `RoleID`) — fine for the existing personal/per-user listings, where the frontend already has the relevant project/role list loaded locally to resolve names (`TokensPage.tsx` does this client-side: `projects.find(p => p.id === t.projectId)`). An instance-wide listing spanning every user's tokens doesn't have that luxury — the viewer may not have every token-owner's accessible-projects list loaded, and shouldn't need three separate list-everything calls just to render one table.

`AdminShell.tsx`'s existing comment is the one piece of prior art this change directly contradicts and must update: "Tokens deliberately stays outside this shell: it only ever shows the caller's own tokens, so there is nothing 'admin' about it to fold in." That's about the *personal* `/settings/tokens` page specifically, which this change leaves untouched — the new page is a different route, a different resource, and a genuinely admin-scoped view, so it belongs inside `AdminShell` as a 4th tab.

`listUsers` (`GET /api/v1/users`) is the closest existing precedent for an instance-wide, cursor-paginated listing: `parsePageParams`/`newPagePayload`/the `(created_at, id)` keyset template from `add-cursor-pagination`, already used by `UserRepo.ListPage`.

## Goals / Non-Goals

**Goals:**
- A Tenant Admin can see every API token across every user in one paginated list: owner, name, scope (unscoped vs. project+role), created date — never the token secret itself (already never stored past creation).
- Resolve owner/project/role names server-side, in the same query, so the frontend renders directly without cross-referencing other lists.

**Non-Goals:**
- No change to the existing personal `/settings/tokens` page or its `GET /api/v1/tokens`/`POST /api/v1/tokens`/`DELETE /api/v1/tokens/{tokenId}` endpoints — this is a new, separate, read-only admin view.
- No revoke action from the new admin page in this change — a Tenant Admin can already revoke any token via the existing endpoint (`RevokeToken` already allows `actor.IsTenantAdmin`); wiring a revoke button into the new page is a natural follow-up, not required to close the actual gap (visibility) this issue names.
- No token usage/last-used tracking — out of scope, not requested.

## Decisions

**D1 — A dedicated `GET /api/v1/tokens/instance` endpoint, not an `all=true` flag on the existing `listTokens`.** The existing endpoint returns bare `ApiToken[]` (no owner info needed — the caller already knows whose tokens they asked for). The new listing needs a materially different response shape (`ApiTokenWithOwner`, with resolved owner/project/role names) and cursor pagination the existing endpoint doesn't have. Two different response shapes behind one `operationId` is awkward for the generated TS client; a new path is cleaner and matches how `listUsers` already has a path (`/users`) separate from narrower per-user lookups.
  - *Alternative considered*: extend `ApiToken` itself with optional owner/project/role name fields, populated only by the new endpoint. Rejected — leaves the personal-tokens response carrying fields that are always empty for that caller, and conflates two different response contracts under one schema.

**D2 — `ApiTokenWithOwner` resolves owner, project, and role in one query via LEFT JOINs**, mirroring `RunRepo.Items`'s existing `LEFT JOIN users u ON u.id = i.assignee_user_id` pattern. `project_id`/`role_id` are nullable (unscoped tokens), so both joins are `LEFT JOIN`; an unscoped token's `projectKey`/`roleName` are simply absent in the response, matching `TokensPage.tsx`'s existing "Full access" treatment for the same null-pair case.

**D3 — `Service.ListAllTokensPage` re-checks `actor.IsTenantAdmin` itself**, not just relying on the route's `requireTenantAdmin` middleware — matching `ListTokensForUser`'s existing defense-in-depth style for this specific domain (token visibility is more sensitive than most listings, and the tokens service methods already have this habit; `ListUsersPage` by contrast relies on route-level gating alone, but that's a different, less sensitive case — see the authorization spec's existing treatment of `GET /api/v1/users` as any-authenticated-user-readable).

**D4 — New admin page at `/settings/agent-tokens`, a 4th `AdminShell` tab, labeled "Agent Tokens"** (distinct from the personal page's "API tokens" label in the account menu, avoiding two identically-named but different destinations). `AdminShell.tsx`'s comment is updated to explain the distinction rather than deleted, since the "personal page stays outside this shell" fact is still true and still worth stating.

## Risks / Trade-offs

- **[Risk]** A large instance could have many tokens across many users; an admin paging through them one by one is slow. **Mitigation**: cursor pagination from the start (same `add-cursor-pagination` template every other instance-wide listing already uses), not a flat unpaginated list.
- **[Risk]** Exposing every user's token names/scopes to any Tenant Admin is itself a (mild) information-disclosure surface. **Mitigation**: accepted — Tenant Admin already has implicit access to everything in the instance; this adds visibility, not new access, and the token secret itself is never returned (already true of every existing token endpoint).

## Migration Plan

No data migration. Purely additive: one new store method, one new service method, one new REST endpoint, one new frontend page/route/tab.
