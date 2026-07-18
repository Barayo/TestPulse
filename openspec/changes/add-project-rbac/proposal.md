## Why

Today every authenticated user can fully read and write every project's data — the only role distinction (`admin`/`member`, `add-identity-basics`) is instance-wide and only gates user-account management. That was fine for a single dogfooding team, but the user wants real project isolation now: a Tenant Admin who provisions projects and decides who's on them, and per-project roles (Project Admin, Contributor, Tester) that shape what a member can actually do once they're in. This also gives teams (groups of people) a first-class way to be granted access to a project at once, instead of adding people one at a time.

## What Changes

- **BREAKING**: Remove the instance-wide `admin`/`member` role. Replace with a single instance-wide flag, **Tenant Admin**, plus three **project-scoped roles** — Project Admin, Contributor, Tester — assigned per project, per user (directly or via team membership).
- **BREAKING**: A non-Tenant-Admin user only sees and can act on projects they're a member of (directly or via a team). Today every authenticated user sees every project.
- Add **Team**: a named group of users, manageable instance-wide. A team can be assigned to any number of projects, each with its own role on that project (a team might be Contributor on one project and Tester on another).
- Add **project membership**: Tenant Admin assigns individual users or teams to a project with one of the three project roles. A user's *effective* role on a project is the highest-privilege role reachable through any direct assignment or team membership (see design.md for the ordering and why it's a total order).
- Define the fixed (v1, not yet customizable) permission set per role:
  - **Project Admin**: everything Contributor can do, plus delete cases/folders/suites, plus administer the project's own settings (rename, description, archive) — but cannot change who's assigned to the project or at what role (that stays Tenant-Admin-only).
  - **Contributor**: create/update cases, folders, and suites; create/modify runs and record results; read everything. Cannot delete cases/folders/suites (default off — a later release lets Tenant Admin customize per-role permissions).
  - **Tester**: create/modify runs and record results; read cases, folders, and suites. Cannot create/update/delete cases, folders, or suites.
  - **Tenant Admin**: implicit Project-Admin-or-above access to every project, plus create projects, manage user accounts, manage teams, and assign project membership/roles.
- An API token (agent) inherits its creator's Tenant Admin flag and effective project roles — it never gets its own separate membership, consistent with the existing "acts at creator's permission level, never impersonates" design (`add-identity-basics` D1/D3.1).
- Enforce project-role checks on every case/folder/suite/run/run-item route, not just at the project boundary.

## Capabilities

### New Capabilities
- `teams`: creating/renaming/deleting teams and managing their membership.
- `project-membership`: assigning users and teams to a project with a role, removing them, and resolving a user's effective role on a project.

### Modified Capabilities
- `authorization`: replaces the "two instance-wide roles" requirement with Tenant Admin + project-scoped roles; token-management-by-admin becomes token-management-by-Tenant-Admin.
- `authentication`: user creation moves from "any role" to "Tenant Admin only," matching what the code already enforces (the current spec text was already stale against `requireRole(domain.RoleAdmin)` in `identity_handlers.go`).
- `test-authoring`: project listing/access, case/folder/suite create/update/delete now require project membership and role; project creation becomes Tenant-Admin-only.
- `test-execution`: run creation, run-item status updates, and result recording now require project membership and Tester-or-above role.
- `project-favorites`: starring/unstarring requires project membership (you can't favorite a project you can't see).

## Impact

- **Schema**: `users.role` (admin/member) replaced by `users.is_tenant_admin boolean`; new tables `teams`, `team_members`, `project_members`, `project_team_roles`. **BREAKING**: also removes `projects.owner_id` (`enrich-project-list`) entirely — superseded by real membership, decided during implementation (design.md D9). Amends `apps/api/internal/db/migrations/00003_identity.sql` in place (pre-1.0 policy).
- **Domain/service**: `domain.Role` becomes the three project-scoped values; `domain.Actor` drops the flat `Role` field in favor of `IsTenantAdmin` + effective-project-role resolution; new `Service` methods for teams and project membership.
- **API**: `packages/shared/openapi.yaml` gains team and project-membership endpoints; every case/folder/suite/run/run-item route gains project-role middleware.
- **UI**: `UsersPage.tsx` drops the role dropdown for a Tenant Admin toggle; new Teams admin page (top-level route, alongside `/settings/users`); new project Members tab for assigning users/teams to a project.
- **Seed/demo data**: `make seed-demo` and the compose bootstrap admin need to grant themselves/the seeded users membership on the seeded projects, or the demo becomes inaccessible under the new model.
- **Docs**: `docs/architecture.md`, `docs/database.md`, `docs/api.md`, `docs/deployment.md`, `docs/development.md`, `docs/test-management.md` all reference the current admin/member model and need updating.
