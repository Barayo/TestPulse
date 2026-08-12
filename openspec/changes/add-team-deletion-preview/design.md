## Context

`DeleteTeam` already exists (`service/project_rbac.go:243-251`) and all FK cascades on `teams.id` are already correct (`team_members`, `project_team_roles` → CASCADE; `test_run_items.assignee_team_id` → SET NULL). The identical preview pattern was already built twice this release: `UserDeletionPreview` (`service/identity.go:307`) and `RoleDeletionPreview` (`service/project_rbac.go:91-100`), each pairing a reference-count store query with a Tenant-Admin-gated GET route and a UI confirmation dialog. This is the same shape applied to the third and last deletable entity that had it missing.

## Goals / Non-Goals

**Goals:**
- Let a Tenant Admin see a team's member count and distinct-project count before deleting it.
- Expose the existing `DeleteTeam` capability in the UI for the first time, guarded by that preview.

**Non-Goals:**
- No change to `DeleteTeam`'s cascade behavior — it's already correct.
- No schema/migration change — the preview is a read query (`COUNT(*)`) over existing tables, no new column.
- No bulk team deletion.

## Decisions

- **Reuse `RoleReferenceCounts`'s query shape** (`store/roles.go`): a single `QueryRow` with subquery counts, rather than N+1 calls — `TeamReferenceCounts(ctx, teamID) (memberCount, projectCount int, err error)`. `memberCount` is `SELECT count(*) FROM team_members WHERE team_id = $1`; `projectCount` is `SELECT count(DISTINCT project_id) FROM project_team_roles WHERE team_id = $1`.
- **Gate in the service layer, not just the route**, matching the fix already applied to `UserDeletionPreview` after the security review on #45/#98e2d7d: `TeamDeletionPreview` takes `actor domain.Actor` and checks `!actor.IsTenantAdmin → forbidden` itself, not relying solely on route middleware.
- **UI**: add the delete affordance next to each team row in `PeoplePage.tsx`'s Teams section (currently rename + member add/remove only), reusing the exact dialog structure `RolesPage.tsx` already has for role deletion — fetch preview on open, disable Delete until it resolves, show "Currently has N member(s), across M project(s). Deleting it removes those assignments too. This cannot be undone."

## Risks / Trade-offs

[A team with many members/project assignments deletes instantly once confirmed, same as roles today] → Preview surfaces the blast radius before the destructive click; no soft-delete/undo is introduced here, consistent with how role deletion already works — teams are worth less state than users, so the user-deletion pattern of "must deactivate first" doesn't apply.
