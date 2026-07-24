## ADDED Requirements

### Requirement: Assigning users and teams to a project
The system SHALL let a Tenant Admin assign a user or a team to a project with exactly one of the three project roles (Tester, Contributor, Project Admin), and remove that assignment later. A project MAY have any number of directly-assigned users and any number of assigned teams, each independently role-scoped to that project.

#### Scenario: Assign a user to a project
- **WHEN** a Tenant Admin assigns a user Contributor on a project
- **THEN** that user's effective role on the project becomes (at least) Contributor

#### Scenario: Assign a team to a project
- **WHEN** a Tenant Admin assigns a team Tester on a project
- **THEN** every member of that team has an effective role on the project of (at least) Tester

#### Scenario: Remove a user's assignment
- **WHEN** a Tenant Admin removes a user's direct assignment on a project
- **THEN** that user loses the access granted by that assignment, retaining only whatever access their team memberships still provide on that project

#### Scenario: Reassigning a user changes their role
- **WHEN** a Tenant Admin changes a user's direct assignment on a project from Contributor to Project Admin
- **THEN** the user's effective role on that project becomes Project Admin immediately, with no re-authentication required

#### Scenario: Non-Tenant-Admin cannot assign project membership
- **WHEN** a non-Tenant-Admin user, including a Project Admin of that project, attempts to assign or remove a user's or team's role on a project
- **THEN** the request is rejected with `403`

### Requirement: Listing a project's membership
The system SHALL let any user with an effective role on a project (Tester or above) list that project's directly-assigned users and assigned teams with their roles, so access can be audited without needing to separately reason about team composition.

#### Scenario: List project members
- **WHEN** a user with an effective role on a project requests its membership
- **THEN** the response lists every directly-assigned user and every assigned team, each with its role
