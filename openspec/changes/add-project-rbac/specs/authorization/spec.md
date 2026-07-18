## MODIFIED Requirements

### Requirement: Tenant Admin and project-scoped roles
The system SHALL assign every user exactly one instance-wide flag, Tenant Admin (`true`/`false`). A Tenant Admin SHALL have implicit Project-Admin-or-above access to every project, may create projects, manage user accounts, manage teams, and assign project membership and roles. A non-Tenant-Admin user's access SHALL be determined entirely by their effective role on each project (see "Effective project role from membership and teams"); a user with no membership on a project SHALL have no access to it, including read access.

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

#### Scenario: User with no membership cannot see a project
- **WHEN** a non-Tenant-Admin user with no direct or team-derived membership on a project requests it
- **THEN** the request is rejected as if the project does not exist (`403`), and the project is absent from that user's project list

### Requirement: Effective project role from membership and teams
The system SHALL define three project-scoped roles in ascending order of privilege: Tester, Contributor, Project Admin. A user's effective role on a project SHALL be the highest-privilege role reachable through either a direct project membership row or membership in a team that is itself assigned a role on that project. Project Admin SHALL be able to do everything Contributor can, plus delete cases/folders/suites and administer the project's own settings (rename, description, archive, owner); Contributor SHALL be able to do everything Tester can, plus create/update cases/folders/suites; Tester SHALL be able to create/modify runs, record results, and read cases/folders/suites/runs. Only a Tenant Admin SHALL be able to assign or remove a user's or team's project membership — a Project Admin SHALL NOT.

#### Scenario: Direct membership grants effective role
- **WHEN** a user is directly assigned Contributor on a project with no team memberships
- **THEN** their effective role on that project is Contributor

#### Scenario: Team membership grants effective role
- **WHEN** a user belongs to a team assigned Tester on a project, with no direct assignment
- **THEN** their effective role on that project is Tester

#### Scenario: Highest role across direct and team assignments wins
- **WHEN** a user is directly assigned Tester on a project and also belongs to a team assigned Project Admin on the same project
- **THEN** their effective role on that project is Project Admin

#### Scenario: Contributor cannot delete
- **WHEN** a user whose effective role on a project is Contributor attempts to delete a case, folder, or suite in that project
- **THEN** the request is rejected with `403`

#### Scenario: Tester cannot modify cases, folders, or suites
- **WHEN** a user whose effective role on a project is Tester attempts to create, edit, move, or delete a case, folder, or suite
- **THEN** the request is rejected with `403`

#### Scenario: Project Admin cannot assign project membership
- **WHEN** a user whose effective role on a project is Project Admin attempts to assign or remove another user's or team's membership on that project
- **THEN** the request is rejected with `403`

### Requirement: Agent actors inherit their creator's permission level
An API token's actor SHALL never have its own project membership. Its Tenant Admin flag and effective project role on any project SHALL be resolved from its creator's current state at request time, not the creator's state at token-creation time.

#### Scenario: Token acts at creator's current effective role
- **WHEN** an API token created by a user who is Contributor on a project is used to edit a case in that project
- **THEN** the request succeeds exactly as it would for the creator

#### Scenario: Token reflects a change to the creator's role made after token creation
- **WHEN** a token's creator is later downgraded from Project Admin to Tester on a project
- **THEN** subsequent requests using that token are authorized as Tester on that project, not Project Admin

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

## REMOVED Requirements

### Requirement: Two instance-wide roles
**Reason**: Replaced by "Tenant Admin and project-scoped roles" — the flat `admin`/`member` model where every role could fully read/write every project's data is gone; access is now per-project via membership.
**Migration**: Every existing `admin` user becomes a Tenant Admin (`is_tenant_admin = true`); every existing `member` user becomes a Tenant Admin `false` with no project memberships (per the migration plan in design.md, the bootstrap/seed flow grants seeded users memberships so the demo environment stays usable — this is not automatic for arbitrary pre-existing data, since pre-1.0 has no real deployments to preserve).
