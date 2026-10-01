## Why

As a Tenant Admin, when I check on an instance's agent integrations, I want to see how many API tokens exist across all users, not just my own. `ListTokensForUser` is restricted to one user at a time; there is no instance-wide registry today, so a Tenant Admin has no way to audit how many agent tokens exist across the tenant, or who holds them (#202).

## What Changes

- A new Tenant-Admin-only, cursor-paginated endpoint lists every API token across every user, with owner (email/display name), project key, and role name already resolved server-side — not raw internal IDs the frontend would have to cross-reference.
- A new admin page (`/settings/agent-tokens`, a 4th tab alongside People/Roles/Instance in `AdminShell`) renders this listing. The existing personal `/settings/tokens` page (API tokens a user manages for themselves, reachable from the account menu) is untouched — this is a distinct, admin-scoped view of everyone's tokens, not a replacement.
- `AdminShell.tsx`'s existing comment ("Tokens deliberately stays outside this shell... nothing admin about it") gets updated: it's still true of the personal page, but no longer the whole story now that an actual admin-scoped token view exists under a different name.

## Capabilities

### Modified Capabilities
- `authentication`: the "Scoped API tokens for agents" area gains a new requirement — an instance-wide, Tenant-Admin-only token listing.

## Impact

- `apps/api/internal/store/tokens.go`: `ApiTokenRepo.ListAllPage(ctx, cursor string, limit int) ([]domain.ApiTokenWithOwner, string, error)` — keyset-paginated, LEFT JOINing `users` (owner), `projects`, and `roles`.
- `apps/api/internal/domain/domain.go`: new `domain.ApiTokenWithOwner` type.
- `apps/api/internal/service/identity.go`: new `Service.ListAllTokensPage(ctx, actor, cursor, limit)`, Tenant-Admin-gated (defense-in-depth, matching `ListTokensForUser`'s existing style — not just relying on route middleware).
- `apps/api/internal/server/identity_handlers.go`: new `GET /api/v1/tokens/instance` handler, `requireTenantAdmin`-gated at the route.
- `packages/shared/openapi.yaml`: new path + `ApiTokenWithOwner`/`ApiTokenWithOwnerListPage` schemas.
- `apps/web/src/pages/InstanceTokensPage.tsx` (new), `apps/web/src/App.tsx` (new route), `apps/web/src/components/AdminShell.tsx` (new tab + updated comment).
- `docs/`: whichever page documents the admin surface / Instance Settings gains a short mention.
