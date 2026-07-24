# teams

## Purpose

Named groups of users with no scope of their own, used to assign project
roles to many people at once.

## Requirements

### Requirement: Team management
The system SHALL let a Tenant Admin create, rename, and delete teams, where a team is a named group of users with no scope of its own — a team only gains meaning when assigned a role on one or more projects. Only a Tenant Admin SHALL manage teams and their membership.

#### Scenario: Create a team
- **WHEN** a Tenant Admin creates a team with a name
- **THEN** the team exists and can be assigned to projects

#### Scenario: Team name is required
- **WHEN** a Tenant Admin creates a team without a name
- **THEN** the request is rejected with a validation error naming the field

#### Scenario: Rename a team
- **WHEN** a Tenant Admin renames an existing team
- **THEN** the team's new name is reflected on subsequent reads, and its project role assignments are unaffected

#### Scenario: Delete a team
- **WHEN** a Tenant Admin deletes a team
- **THEN** the team no longer appears in the team list, its membership rows are removed, and its project role assignments are removed — any user whose effective role depended solely on that team loses that access

#### Scenario: Non-Tenant-Admin cannot manage teams
- **WHEN** a non-Tenant-Admin user attempts to create, rename, delete, or change the membership of a team
- **THEN** the request is rejected with `403`

### Requirement: Team membership
The system SHALL let a Tenant Admin add and remove users from a team. A user MAY belong to any number of teams.

#### Scenario: Add a member
- **WHEN** a Tenant Admin adds a user to a team
- **THEN** the user appears in the team's member list and inherits any project roles assigned to that team

#### Scenario: Remove a member
- **WHEN** a Tenant Admin removes a user from a team
- **THEN** the user no longer appears in the team's member list, and loses any project access that depended solely on that team's membership
