## Why

As a Tenant Admin, when I want to delete a team, I want to see what's affected before I confirm, and want a way to actually do it from the UI. Today `DELETE /api/v1/teams/{teamID}` already exists and cascades safely, but it's unreachable — `PeoplePage.tsx`'s Teams section has create/rename/add-member/remove-member, no delete button at all — and even if it were wired up, it would have no preview of what it removes, unlike the deletion flows already shipped for users and roles (#45).

## What Changes

- Add `TeamDeletionPreview` (service) and `GET /api/v1/teams/{teamId}/deletion-preview` (route), Tenant-Admin-gated, returning the team's current member count and the count of distinct projects it holds a role on — mirrors `RoleDeletionPreview`'s shape exactly.
- Add a delete-team affordance to `PeoplePage.tsx`'s Teams section: a destructive action that fetches the preview and shows real counts in a confirmation dialog before the delete button is enabled — mirrors `RolesPage.tsx`'s existing delete-role dialog.
- No change to delete semantics themselves — `DeleteTeam` and its cascades (`team_members`, `project_team_roles` CASCADE; `test_run_items.assignee_team_id` SET NULL) are already correct and unchanged.
- Sample Project: ensure the seeded data includes at least one team safe to delete live (no critical role assignments), so the flow is demonstrable out of the box.

## Capabilities

### New Capabilities
(none — this modifies existing capabilities)

### Modified Capabilities
- `teams`: add a deletion-preview requirement — a Tenant Admin can retrieve a team's member/project-role reference counts before deleting it.
- `authorization`: add a Tenant-Admin gate scenario for the new preview endpoint, matching the existing "Role deletion-preview counts are Tenant-Admin-gated" requirement.

## Impact

- `apps/api/internal/store/teams.go` — new reference-count query
- `apps/api/internal/service/project_rbac.go` — new `TeamDeletionPreview` method
- `apps/api/internal/server/team_handlers.go` — new route + handler
- `packages/shared/openapi.yaml` (+ regenerated `packages/shared/src/api.ts`) — new endpoint, `TeamDeletionPreview` schema
- `apps/web/src/pages/PeoplePage.tsx` — delete-team button + confirmation dialog
- `apps/api/internal/sampledata/seed.go` (+ test) — a deletable sample team
- `docs/api.md` — new endpoint documented
