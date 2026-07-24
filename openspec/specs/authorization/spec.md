# authorization

## Purpose

Deciding which authenticated actor may perform which action: one
instance-wide Tenant Admin flag, plus fully custom, instance-wide,
per-project roles built from independently toggleable permission flags —
and the ownership rules for API token management.

## Requirements

### Requirement: Tenant Admin and project-scoped roles
The system SHALL assign every user exactly one instance-wide flag, Tenant Admin (`true`/`false`). A Tenant Admin SHALL have implicit full access to every project regardless of membership, may create projects, manage user accounts, manage teams and roles, and assign project membership and roles. A non-Tenant-Admin user's access SHALL be determined entirely by the permission flags of every role reachable on a project (direct assignment or via a team — see "Effective project permissions from membership and teams"); a user with no such role on a project SHALL have no access to it, including read access.

#### Scenario: Tenant Admin has implicit access to every project
- **WHEN** a Tenant Admin reads, creates, or edits a project or any of its cases, folders, suites, or runs, regardless of project membership
- **THEN** the request succeeds

#### Scenario: Tenant Admin manages user accounts
- **WHEN** a Tenant Admin creates, deactivates, or changes the Tenant Admin flag of another user account
- **THEN** the request succeeds

#### Scenario: Non-Tenant-Admin cannot manage users
- **WHEN** a non-Tenant-Admin user attempts to create, deactivate, or change the Tenant Admin flag of another user account
- **THEN** the request is rejected with `403`

#### Scenario: Non-Tenant-Admin cannot create a project
- **WHEN** a non-Tenant-Admin user attempts to create a project
- **THEN** the request is rejected with `403`

#### Scenario: User with no role on a project cannot see it
- **WHEN** a non-Tenant-Admin user with no direct or team-derived role on a project requests it
- **THEN** the request is rejected as if the project does not exist (`403`), and the project is absent from that user's project list

### Requirement: Fully custom, instance-wide roles built from permission flags
The system SHALL let a Tenant Admin create, rename, and delete roles, each carrying a name, a display-only `rank`, and independently toggleable permission flags: `read`, `caseCreate`, `caseEdit`, `caseDelete`, `sectionCreate`, `sectionDelete`, `suiteCreate`, `suiteEditMembership`, `runCreate`, `runRecordResult`, `manageProject`. `rank` is a display/sort-order integer only — no authorization decision compares ranks; a role either grants a flag or it doesn't. A fresh instance SHALL be seeded with three editable default roles — Tester (`read`, `runCreate`, `runRecordResult`), Contributor (Tester's flags plus `caseCreate`, `caseEdit`, `sectionCreate`, `suiteCreate`, `suiteEditMembership`), Project Admin (Contributor's flags plus `caseDelete`, `sectionDelete`, `manageProject`) — reproducing a conventional three-tier default without hardcoding it. A Tenant Admin MAY freely edit, rename, or delete any role, including the three defaults.

#### Scenario: Create a role
- **WHEN** a Tenant Admin creates a role with a name and a set of permission flags
- **THEN** the role exists and can be assigned to a user or team on a project

#### Scenario: Edit a role's permission flags
- **WHEN** a Tenant Admin toggles a permission flag on an existing role
- **THEN** every user or team currently assigned that role has the updated flag reflected immediately, with no re-authentication required

#### Scenario: Delete a role
- **WHEN** a Tenant Admin deletes a role
- **THEN** every project membership and team role assignment referencing it is removed, and any user whose access depended solely on that role loses it

#### Scenario: Non-Tenant-Admin cannot manage roles
- **WHEN** a non-Tenant-Admin user attempts to create, edit, or delete a role
- **THEN** the request is rejected with `403`

#### Scenario: Reset restores only the three named default roles, in place
- **WHEN** a Tenant Admin resets roles to defaults, and a role named "Contributor" currently exists with edited flags
- **THEN** the "Contributor" role's flags and rank are overwritten back to its factory values with the same `id` (existing assignments referencing it stay valid), and every other role in the instance is left untouched

### Requirement: Effective project permissions from membership and teams
A user's effective permissions on a project SHALL be the union — one flag OR'd across every applicable role, not "the single highest-ranked role" — of every role reachable through either a direct project membership row or membership in a team that is itself assigned a role on that project. Only a Tenant Admin SHALL be able to assign or remove a user's or team's project membership — no project-scoped role, however permissive, SHALL be able to.

#### Scenario: Direct membership grants effective permissions
- **WHEN** a user is directly assigned a role granting `caseCreate` and `caseEdit` on a project, with no team memberships
- **THEN** their effective permissions on that project include `caseCreate` and `caseEdit`

#### Scenario: Team membership grants effective permissions
- **WHEN** a user belongs to a team assigned a role granting `read` and `runRecordResult` on a project, with no direct assignment
- **THEN** their effective permissions on that project include `read` and `runRecordResult`

#### Scenario: Permissions union across direct and team assignments
- **WHEN** a user is directly assigned a role granting only `read` on a project, and also belongs to a team assigned a different role granting `manageProject` on the same project
- **THEN** their effective permissions on that project include both `read` and `manageProject`

#### Scenario: A role without a permission cannot perform that action
- **WHEN** a user's effective permissions on a project do not include `caseDelete`
- **THEN** a request from that user to delete a case in that project is rejected with `403`

#### Scenario: A role's permissions cannot assign project membership
- **WHEN** a user whose effective permissions on a project include `manageProject`, but who is not a Tenant Admin, attempts to assign or remove another user's or team's membership on that project
- **THEN** the request is rejected with `403`

#### Scenario: A user can query their own effective permissions
- **WHEN** an authenticated user with `read` permission on a project requests their own effective permissions on it
- **THEN** the response reflects every flag granted by their direct and team-derived roles — a Tenant Admin's response has every flag `true` regardless of membership, so UI (e.g. `add-delete-mode`'s delete mode toggle) can hide permission-gated controls entirely rather than just disabling them

### Requirement: Agent actors inherit their creator's permission level
An API token's actor SHALL never have its own project membership. Its Tenant Admin flag and effective permissions on any project SHALL be resolved from its creator's current state at request time, not the creator's state at token-creation time.

#### Scenario: Token acts at creator's current effective permissions
- **WHEN** an API token created by a user whose effective role on a project grants `caseEdit` is used to edit a case in that project
- **THEN** the request succeeds exactly as it would for the creator

#### Scenario: Token reflects a change to the creator's role made after token creation
- **WHEN** a token's creator's project role assignment is later changed to one that no longer grants `manageProject`
- **THEN** subsequent requests using that token are no longer authorized to perform `manageProject` actions on that project

### Requirement: Token management scoped to creator, with Tenant Admin override
The system SHALL let a user list and revoke only the API tokens they created; a Tenant Admin SHALL additionally be able to list and revoke any user's tokens, for offboarding.

#### Scenario: User lists their own tokens
- **WHEN** an authenticated user lists API tokens
- **THEN** only tokens they created are returned

#### Scenario: Tenant Admin lists another user's tokens
- **WHEN** a Tenant Admin requests the token list for a specific user
- **THEN** that user's tokens are returned regardless of who is asking

#### Scenario: Non-Tenant-Admin cannot list another user's tokens
- **WHEN** a non-Tenant-Admin user requests the token list for a different user
- **THEN** the request is rejected with `403`
