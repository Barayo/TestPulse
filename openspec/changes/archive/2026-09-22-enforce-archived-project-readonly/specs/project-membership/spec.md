## MODIFIED Requirements

### Requirement: Assigning users and teams to a project
The system SHALL let a Tenant Admin assign a user or a team to a project with exactly one role, chosen from the instance's role catalog (see `authorization`), and remove that assignment later. A project MAY have any number of directly-assigned users and any number of assigned teams, each independently role-scoped to that project. While a project is archived, every membership/role assignment or removal on it SHALL be rejected with `409 Conflict`, with no exception for Tenant Admin standing — membership changes are a write to the project, subject to the same archived-project read-only rule as its test content (see `test-authoring`).

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

#### Scenario: Assigning membership on an archived project is rejected
- **WHEN** a Tenant Admin attempts to assign or remove a user's or team's role on a project that is archived
- **THEN** the request is rejected with `409 Conflict`, and the project's membership is unchanged
