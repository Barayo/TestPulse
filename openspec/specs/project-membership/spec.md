# project-membership

## Purpose

Assigning users and teams a role on a project — the only way, besides being
a Tenant Admin, that a user gains any access to a project at all.

## Requirements

### Requirement: Assigning users and teams to a project
The system SHALL let a Tenant Admin assign a user or a team to a project with exactly one role, chosen from the instance's role catalog (see `authorization`), and remove that assignment later. A project MAY have any number of directly-assigned users and any number of assigned teams, each independently role-scoped to that project.

#### Scenario: Assign a user to a project
- **WHEN** a Tenant Admin assigns a user a role granting `caseCreate` and `caseEdit` on a project
- **THEN** that user's effective permissions on the project include `caseCreate` and `caseEdit`

#### Scenario: Assign a team to a project
- **WHEN** a Tenant Admin assigns a team a role granting `read` and `runRecordResult` on a project
- **THEN** every member of that team has those permissions on the project

#### Scenario: Remove a user's assignment
- **WHEN** a Tenant Admin removes a user's direct assignment on a project
- **THEN** that user loses the access granted by that assignment, retaining only whatever access their team memberships still provide on that project

#### Scenario: Reassigning a user changes their role
- **WHEN** a Tenant Admin changes a user's direct assignment on a project from one role to a different one
- **THEN** the user's effective permissions on that project reflect the new role immediately, with no re-authentication required

#### Scenario: Non-Tenant-Admin cannot assign project membership
- **WHEN** a non-Tenant-Admin user, including one with `manageProject` permission on that project, attempts to assign or remove a user's or team's role on a project
- **THEN** the request is rejected with `403`

### Requirement: Listing a project's membership
The system SHALL let any user with `read` permission on a project list that project's directly-assigned users and assigned teams with their roles, so access can be audited without needing to separately reason about team composition.

#### Scenario: List project members
- **WHEN** a user with `read` permission on a project requests its membership
- **THEN** the response lists every directly-assigned user and every assigned team, each with its role
